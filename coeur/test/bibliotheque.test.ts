// Histoire 3.9 : ma bibliothèque de vidéos (filtres, archivage, suppression, vidéo publiée, cloisonnement).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerMontageDuJeu } from '../src/services/film-jeu.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);
const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 3500, genre: 'narration', cible: 'Un deuxième temps.' },
  { t: 7000, genre: 'film_fin' },
];

describe('ma bibliothèque de vidéos', () => {
  let banc: BancDeTest;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let marqueId: string;
  let utilisateurA: string;
  let espaceA: string;
  let jetonA: string;
  let jetonB: string;
  let cookieA: string;
  let cookieB: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const voir = async (url: string, cookie = cookieA) => app.inject({ method: 'GET', url, headers: { cookie } });
  const poster = (corps: Record<string, string>, cookie = cookieA, entetes: Record<string, string> = { origin: ORIGINE }) =>
    app.inject({ method: 'POST', url: '/montages', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });

  async function nouveauMontage() {
    const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };
    const r = await creerMontageDuJeu({ montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file }, { marqueId, utilisateurId: utilisateurA }, { id: randomUUID(), espaceId: espaceA, nom: 'Parcours' }, film, WEBM.length, journal, 7000);
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    return banc.montages.montages.find((x) => x.id === r.montageId)!;
  }
  const ajouterRendu = (m: { id: string; espaceId: string }, etat: 'pret' | 'bloque' | 'echec' | 'en_file', genre: 'allege' | 'complet' = 'allege', avecFichier = false) => {
    const fichierId = randomUUID();
    if (avecFichier) {
      banc.montages.fichiers.push({ id: fichierId, espaceId: m.espaceId, genre: 'rendu', mime: 'video/mp4', octets: 10, sha256: 'a'.repeat(64), dureeMs: 7000, montageId: m.id, sceneId: null, creeLe: new Date(), purgeLe: null });
      void banc.stockage.ecrire(marqueId, fichierId, Buffer.from('rendu'));
    }
    banc.montages.rendus.push({ id: randomUUID(), espaceId: m.espaceId, montageId: m.id, genre, etat, tacheId: null, fichierId: avecFichier ? fichierId : null, violations: [], cause: null, creeLe: new Date(), termineLe: null });
    return fichierId;
  };
  const serieIds = async (jeton = jetonA, corps: unknown = {}) => ((await appeler(jeton, 'montage/bibliotheque', corps)).json().donnees.videos as { montage: { id: string }; statut: string; archiveeLe: string | null }[]);

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    utilisateurA = a.utilisateurId;
    espaceA = a.espaces[0]!.id;
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Autre');
    const jeton = async (sub: string, utilisateurId: string, espaceIds: string[]) => (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 't', portees: ['lecture', 'ecriture'], espaceIds, dureeJours: 30 })).clair;
    jetonA = await jeton('sub-a', utilisateurA, [espaceA]);
    jetonB = await jeton('sub-b', b.utilisateurId, [b.espaces[0]!.id]);
    const session = async (sub: string) => `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub, email: undefined, authentifieLe: new Date() })}`;
    cookieA = await session('sub-a');
    cookieB = await session('sub-b');
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => app?.close());

  it('liste la dernière version de chaque vidéo avec son statut, la plus récente d’abord', async () => {
    const m = await nouveauMontage();
    ajouterRendu(m, 'pret');
    const e = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'texte', sceneId: m.timeline.scenes[0]!.id, accroche: 'Nouvelle' }] });
    const v2 = e.json().donnees.montage.id as string;
    const v = await serieIds();
    expect(v.find((x) => x.montage.id === m.id)).toBeUndefined();
    expect(v.find((x) => x.montage.id === v2)).toMatchObject({ statut: 'sans_rendu', archiveeLe: null });
  });

  it('statuts : prête, bloquée, en échec, en cours ; filtre par statut', async () => {
    const cas = { pret: 'prete', bloque: 'bloquee', echec: 'en_echec', en_file: 'en_cours' } as const;
    const ids: Record<string, string> = {};
    for (const etat of Object.keys(cas) as (keyof typeof cas)[]) {
      const m = await nouveauMontage();
      ajouterRendu(m, etat);
      ids[etat] = m.id;
    }
    for (const [etat, statut] of Object.entries(cas)) {
      const v = await serieIds(jetonA, { statut });
      expect(v.map((x) => x.montage.id)).toContain(ids[etat]);
      expect(v.every((x) => x.statut === statut)).toBe(true);
    }
    expect((await serieIds(jetonA, { statut: 'prete' })).map((x) => x.montage.id)).not.toContain(ids['bloque']);
  });

  it('période : jours de Paris, bornes comprises ; une période mal formée ou inversée est refusée', async () => {
    const m = await nouveauMontage();
    const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(m.creeLe);
    expect((await serieIds(jetonA, { depuis: jour, jusqua: jour })).map((x) => x.montage.id)).toContain(m.id);
    expect((await serieIds(jetonA, { jusqua: '2000-01-01' })).map((x) => x.montage.id)).not.toContain(m.id);
    expect((await serieIds(jetonA, { depuis: '2999-01-01' })).map((x) => x.montage.id)).not.toContain(m.id);
    for (const corps of [{ depuis: '2026-13-40' }, { depuis: 'hier' }, { depuis: '2026-10-05', jusqua: '2026-10-01' }]) {
      const r = await appeler(jetonA, 'montage/bibliotheque', corps);
      expect(r.statusCode).toBeGreaterThanOrEqual(400);
      expect(r.statusCode).toBeLessThan(500);
    }
  });

  it('archiver sort la vidéo de la liste sans rien effacer, la désarchiver la remet', async () => {
    const m = await nouveauMontage();
    const fichier = ajouterRendu(m, 'pret', 'allege', true);
    expect((await appeler(jetonA, 'montage/archiver', { id: m.id, archivee: true })).statusCode).toBe(200);
    expect((await serieIds()).map((x) => x.montage.id)).not.toContain(m.id);
    expect((await serieIds(jetonA, { archivees: 'inclure' })).find((x) => x.montage.id === m.id)?.archiveeLe).not.toBeNull();
    expect((await serieIds(jetonA, { archivees: 'seulement' })).map((x) => x.montage.id)).toContain(m.id);
    expect(banc.montages.fichiers.some((f) => f.id === fichier)).toBe(true);
    expect(banc.stockage.fichiers.has(`${marqueId}/${fichier}`)).toBe(true);
    expect((await appeler(jetonA, 'montage/archiver', { id: m.id, archivee: false })).statusCode).toBe(200);
    expect((await serieIds()).map((x) => x.montage.id)).toContain(m.id);
  });

  it('supprimer exige la confirmation, puis efface versions, rendus, légende, fichiers et octets', async () => {
    const m = await nouveauMontage();
    const rendu = ajouterRendu(m, 'pret', 'allege', true);
    await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'tiktok', legende: 'Ma légende', hashtags: [] });
    const sans = await appeler(jetonA, 'montage/supprimer', { id: m.id });
    expect(sans.statusCode).toBeGreaterThanOrEqual(400);
    const faux = await appeler(jetonA, 'montage/supprimer', { id: m.id, confirmer: false });
    expect(faux.statusCode).toBeGreaterThanOrEqual(400);
    expect(banc.montages.montages.some((x) => x.id === m.id)).toBe(true);
    const r = await appeler(jetonA, 'montage/supprimer', { id: m.id, confirmer: true });
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees).toMatchObject({ supprimee: true, fichiersNonSupprimes: 0 });
    expect(banc.montages.montages.some((x) => x.serieId === m.serieId)).toBe(false);
    expect(banc.montages.rendus.some((x) => x.montageId === m.id)).toBe(false);
    expect(banc.montages.legendes.some((l) => l.serieId === m.serieId)).toBe(false);
    expect(banc.montages.fichiers.some((f) => f.id === rendu || f.id === m.filmFichierId)).toBe(false);
    expect(banc.stockage.fichiers.has(`${marqueId}/${rendu}`)).toBe(false);
    expect(banc.stockage.fichiers.has(`${marqueId}/${m.filmFichierId}`)).toBe(false);
    expect(banc.montages.suppressions.some((s) => s.serieId === m.serieId && s.utilisateurId === utilisateurA)).toBe(true);
    expect((await appeler(jetonA, 'montage/lire', { id: m.id })).statusCode).toBe(404);
  });

  it('une vidéo publiée n’est pas supprimée : on propose d’archiver', async () => {
    const m = await nouveauMontage();
    banc.montages.publiees.add(m.serieId);
    const r = await appeler(jetonA, 'montage/supprimer', { id: m.id, confirmer: true });
    expect(r.statusCode).toBe(409);
    expect(r.json().erreur.code).toBe('VIDEO_PUBLIEE');
    expect(banc.montages.montages.some((x) => x.id === m.id)).toBe(true);
    expect((await appeler(jetonA, 'montage/archiver', { id: m.id, archivee: true })).statusCode).toBe(200);
  });

  it('une autre personne ne voit, n’archive ni ne supprime ma vidéo', async () => {
    const m = await nouveauMontage();
    expect((await serieIds(jetonB)).map((x) => x.montage.id)).not.toContain(m.id);
    expect((await appeler(jetonB, 'montage/archiver', { id: m.id, archivee: true })).statusCode).toBe(404);
    expect((await appeler(jetonB, 'montage/supprimer', { id: m.id, confirmer: true })).statusCode).toBe(404);
    expect(banc.montages.montages.some((x) => x.id === m.id)).toBe(true);
  });

  it('la page : filtres, archiver et supprimer avec confirmation, refus sans case cochée ni origine', async () => {
    const m = await nouveauMontage();
    ajouterRendu(m, 'pret');
    const liste = await voir('/montages?statut=prete');
    expect(liste.statusCode).toBe(200);
    expect(liste.body).toContain(`value="${m.id}"`);
    expect(liste.body).toContain('name="confirmer"');
    expect((await voir('/montages?statut=bloquee')).body).not.toContain(`value="${m.id}"`);
    expect((await voir('/montages?depuis=n-importe-quoi')).statusCode).toBe(200);
    const sansOrigine = await poster({ id: m.id, gestion: 'archiver' }, cookieA, {});
    expect(sansOrigine.statusCode).toBeGreaterThanOrEqual(400);
    expect((await voir('/montages')).body).toContain(`value="${m.id}"`);
    const archive = await poster({ id: m.id, gestion: 'archiver' });
    expect(archive.statusCode).toBe(303);
    expect((await voir('/montages')).body).not.toContain(`value="${m.id}"`);
    const sansCase = await poster({ id: m.id, gestion: 'supprimer' });
    expect(sansCase.statusCode).toBe(200);
    expect(sansCase.body).toContain('Coche la confirmation');
    expect(banc.montages.montages.some((x) => x.id === m.id)).toBe(true);
    const supprime = await poster({ id: m.id, gestion: 'supprimer', confirmer: 'oui' });
    expect(supprime.statusCode).toBe(303);
    expect(banc.montages.montages.some((x) => x.id === m.id)).toBe(false);
    // Une autre personne n'atteint pas la vidéo d'autrui par la page.
    const n = await nouveauMontage();
    banc.montages.espacesVisibles = [];
    try {
      const refus = await poster({ id: n.id, gestion: 'supprimer', confirmer: 'oui' }, cookieB);
      expect(refus.statusCode).toBe(200);
    } finally {
      banc.montages.espacesVisibles = undefined;
    }
    expect(banc.montages.montages.some((x) => x.id === n.id)).toBe(true);
  });
});
