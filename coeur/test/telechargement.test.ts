// Histoire 3.8 : télécharger la vidéo prête (action, page, couverture, rushes purgés).
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

describe('télécharger ma vidéo prête', () => {
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
  const voir = async (url: string, cookie = cookieA) => {
    banc.montages.espacesVisibles = cookie === cookieB ? [] : undefined;
    try {
      return await app.inject({ method: 'GET', url, headers: { cookie } });
    } finally {
      banc.montages.espacesVisibles = undefined;
    }
  };
  const poster = (corps: Record<string, string>, cookie = cookieA, entetes: Record<string, string> = { origin: ORIGINE }) =>
    app.inject({ method: 'POST', url: '/montages/telecharger', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });

  async function nouveauMontage() {
    const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };
    const r = await creerMontageDuJeu({ montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file }, { marqueId, utilisateurId: utilisateurA }, { id: randomUUID(), espaceId: espaceA, nom: 'Parcours' }, film, WEBM.length, journal, 7000);
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    return banc.montages.montages.find((x) => x.id === r.montageId)!;
  }

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
  beforeEach(() => {
    banc.montages.legendes.length = 0;
  });

  /** Un rendu complet « prêt » avec son fichier (l'exécutant réel est testé dans rendu.test.ts). */
  function rendreComplet(m: { id: string; espaceId: string }, etat: 'pret' | 'bloque' | 'en_file' = 'pret') {
    const fichierId = randomUUID();
    if (etat === 'pret') banc.montages.fichiers.push({ id: fichierId, espaceId: m.espaceId, genre: 'rendu', mime: 'video/mp4', octets: 5_000_000, sha256: 'a'.repeat(64), dureeMs: 7000, montageId: m.id, sceneId: null, creeLe: new Date(), purgeLe: null });
    const rendu = { id: randomUUID(), espaceId: m.espaceId, montageId: m.id, genre: 'complet' as const, etat, tacheId: null, fichierId: etat === 'pret' ? fichierId : null, violations: [], cause: null, creeLe: new Date(banc.services.maintenant() + 1), termineLe: null };
    banc.montages.rendus.push(rendu);
    return { fichierId, rendu };
  }

  it('rendu complet fait : adresse signée de moins d’une heure, couverture et légendes des trois réseaux', async () => {
    const m = await nouveauMontage();
    const { fichierId } = rendreComplet(m);
    await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'tiktok', legende: 'Ma légende', hashtags: ['Un'] });
    const r = await appeler(jetonA, 'montage/telecharger', { id: m.id });
    expect(r.statusCode).toBe(200);
    const d = r.json().donnees;
    expect(d.etat).toBe('pret');
    expect(d.video).toMatchObject({ mime: 'video/mp4', largeur: 1080, hauteur: 1920 });
    expect(d.video.expireDansS).toBeLessThan(3600);
    expect(d.video.adresse).toContain(`/v/session/${marqueId}/${utilisateurA}/${fichierId}`);
    expect(d.couverture.svg).toContain('<svg');
    expect(d.legendes.map((l: { reseau: string }) => l.reseau)).toEqual(['instagram', 'facebook', 'tiktok']);
    expect(d.legendes.find((l: { reseau: string }) => l.reseau === 'tiktok')).toMatchObject({ legende: 'Ma légende', hashtags: ['un'], enregistree: true });
    expect(banc.montages.rendus.filter((x) => x.montageId === m.id && x.genre === 'complet')).toHaveLength(1);
  });
  it('pas de rendu complet : le lance une seule fois et donne l’heure estimée', async () => {
    const m = await nouveauMontage();
    const premier = (await appeler(jetonA, 'montage/telecharger', { id: m.id })).json().donnees;
    expect(premier).toMatchObject({ etat: 'en_preparation', lance: true });
    expect(premier.tacheId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof premier.finEstimee).toBe('string');
    const second = (await appeler(jetonA, 'montage/telecharger', { id: m.id })).json().donnees;
    expect(second).toMatchObject({ etat: 'en_preparation', lance: false, tacheId: premier.tacheId });
    expect(banc.montages.rendus.filter((x) => x.montageId === m.id && x.genre === 'complet')).toHaveLength(1);
  });
  it('rushes purgés : un rendu déjà fait reste téléchargeable, sans rendu fait la demande est refusée', async () => {
    const m = await nouveauMontage();
    const sans = await nouveauMontage();
    rendreComplet(m);
    await banc.montages.marquerPurge(marqueId, utilisateurA, m.filmFichierId, new Date());
    await banc.montages.marquerPurge(marqueId, utilisateurA, sans.filmFichierId, new Date());
    expect((await appeler(jetonA, 'montage/telecharger', { id: m.id })).json().donnees.etat).toBe('pret');
    const refus = await appeler(jetonA, 'montage/telecharger', { id: sans.id });
    expect(refus.statusCode).toBe(409);
    expect(refus.json().erreur.code).toBe('SEANCE_PURGEE');
  });
  it('refuse un fichier du rendu purgé, un rendu bloqué, un montage d’un autre espace et une entrée inconnue', async () => {
    const purgee = await nouveauMontage();
    const { fichierId } = rendreComplet(purgee);
    await banc.montages.marquerPurge(marqueId, utilisateurA, fichierId, new Date());
    // Fichier purgé : on retombe sur la relance, qui exige le film (encore là) ; aucune adresse n'est donnée.
    expect((await appeler(jetonA, 'montage/telecharger', { id: purgee.id })).json().donnees.etat).toBe('en_preparation');
    const bloque = await nouveauMontage();
    rendreComplet(bloque, 'bloque');
    const b = await appeler(jetonA, 'montage/telecharger', { id: bloque.id });
    expect(b.statusCode).toBe(409);
    expect(b.json().erreur.code).toBe('RENDU_PAS_PRET');
    const autre = await appeler(jetonB, 'montage/telecharger', { id: bloque.id });
    expect(autre.statusCode).toBe(404);
    expect((await appeler(jetonA, 'montage/telecharger', { id: bloque.id, genre: 'x' })).statusCode).toBe(400);
    expect((await appeler(jetonA, 'montage/telecharger', { id: 'pas-un-uuid' })).statusCode).toBe(400);
  });
  it('page : GET ne lance rien, POST affiche liens et légendes, texte échappé', async () => {
    const m = await nouveauMontage();
    const get = await voir(`/montages/telecharger?id=${m.id}`);
    expect(get.statusCode).toBe(200);
    expect(banc.montages.rendus.filter((x) => x.montageId === m.id && x.genre === 'complet')).toHaveLength(0);
    const attente = await poster({ id: m.id });
    expect(attente.statusCode).toBe(200);
    expect(attente.body).toContain('role="status"');
    rendreComplet(m);
    await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'instagram', legende: '</textarea><script>alert(1)</script>', hashtags: [] });
    const pret = await poster({ id: m.id });
    expect(pret.body).toContain('download="video.mp4"');
    expect(pret.body).toContain('telecharger=1');
    expect(pret.body).not.toContain('<script>alert(1)');
    expect(pret.body).toContain('&lt;/textarea&gt;');
    banc.montages.espacesVisibles = [];
    const autrePersonne = await poster({ id: m.id }, cookieB);
    banc.montages.espacesVisibles = undefined;
    expect(autrePersonne.statusCode).toBe(404);
    expect((await poster({ id: m.id }, cookieA, { origin: 'http://evil.example' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/montages/telecharger?id=${m.id}` })).statusCode).not.toBe(200);
  });
  it('couverture : le téléchargement ajoute un en-tête de pièce jointe, une variante inconnue est refusée', async () => {
    const m = await nouveauMontage();
    const ok = await voir(`/montages/couverture.svg?id=${m.id}&variante=titre&telecharger=1`);
    expect(ok.headers['content-disposition']).toContain('attachment');
    expect((await voir(`/montages/couverture.svg?id=${m.id}&variante=titre`)).headers['content-disposition']).toBeUndefined();
    expect((await voir(`/montages/couverture.svg?id=${m.id}&variante=../x&telecharger=1`)).statusCode).toBe(404);
  });
});
