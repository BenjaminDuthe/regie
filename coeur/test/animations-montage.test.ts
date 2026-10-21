// Histoire 3.11 : animations, transitions, zoom et regénération du rendu.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { construireServeur } from '../src/serveur.ts';
import { construirePlanRendu } from '@regie/contrats';
import { parametresTexte } from '../src/domaine/montage.ts';
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

describe('animations, zoom et regénération du rendu', () => {
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
  const posterMontages = (id: string, corps: Record<string, string>, cookie = cookieA, entetes: Record<string, string> = { origin: ORIGINE }) =>
    app.inject({ method: 'POST', url: `/montages?id=${id}`, headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });
  const poster = (corps: Record<string, string>, cookie = cookieA, entetes: Record<string, string> = { origin: ORIGINE }) =>
    app.inject({ method: 'POST', url: '/montages/editer', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });

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

  it('montage.editer : animation, transition et zoom d’une scène créent une version, l’ancienne ne bouge pas', async () => {
    const m = await nouveauMontage();
    const avant = JSON.stringify(m.timeline);
    const [a, b] = m.timeline.scenes.map((s) => s.id) as [string, string];
    const r = await appeler(jetonA, 'montage/editer', {
      id: m.id,
      operations: [
        { op: 'animation', sceneId: a, entree: 'zoom', sortie: 'fondu', dureeMs: 700, delaiMs: 300 },
        { op: 'transition', sceneId: b, transition: 'fondu' },
        { op: 'zoom', sceneId: a, niveau: 2, decalageMs: -400 },
      ],
    });
    expect(r.statusCode).toBe(200);
    const { montage } = r.json().donnees as { montage: { numero: number; timeline: { scenes: { animation: unknown; transition: string; zoom: unknown }[] } } };
    expect(montage.numero).toBe(2);
    expect(montage.timeline.scenes[0]!.animation).toEqual({ entree: 'zoom', sortie: 'fondu', dureeMs: 700, delaiMs: 300 });
    expect(montage.timeline.scenes[1]!.transition).toBe('fondu');
    expect(montage.timeline.scenes[0]!.zoom).toMatchObject({ niveau: 2, decalageMs: -400 });
    expect(JSON.stringify(banc.montages.montages.find((x) => x.id === m.id)!.timeline)).toBe(avant);
    const zoomRetire = await appeler(jetonA, 'montage/editer', { id: montage.numero === 2 ? banc.montages.montages.find((x) => x.parentId === m.id)!.id : m.id, operations: [{ op: 'zoom', sceneId: a, actif: false }] });
    expect(zoomRetire.json().donnees.montage.timeline.scenes[0].zoom.actif).toBe(false);
  });
  it('seul le catalogue est accepté ; durée, délai, niveau et décalage ont des bornes ; une carte absente ne s’anime pas', async () => {
    const m = await nouveauMontage();
    const a = m.timeline.scenes[0]!.id;
    for (const op of [
      { op: 'animation', sceneId: a, entree: 'rebond' },
      { op: 'animation', sceneId: a, sortie: 'glisse_haut' },
      { op: 'animation', sceneId: a, dureeMs: 5000 },
      { op: 'animation', sceneId: a, delaiMs: -1 },
      { op: 'transition', sceneId: a, transition: 'volet' },
      { op: 'zoom', sceneId: a, niveau: 9 },
      { op: 'zoom', sceneId: a, decalageMs: 9000 },
    ]) expect((await appeler(jetonA, 'montage/editer', { id: m.id, operations: [op] })).statusCode, JSON.stringify(op)).toBe(400);
    expect(banc.montages.montages.some((x) => x.parentId === m.id)).toBe(false);
    const sansCarte = banc.montages.montages.find((x) => x.id === m.id)!.timeline.carteFin === null;
    if (sansCarte) {
      const r = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'animation_carte', entree: 'fondu' }] });
      expect(r.statusCode).toBe(422);
    }
    const avecCarte = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'carte_fin', titre: 'Merci' }, { op: 'animation_carte', entree: 'glisse_haut', sortie: 'zoom' }] });
    expect(avecCarte.statusCode).toBe(200);
    expect(avecCarte.json().donnees.montage.timeline.carteFin.animation).toMatchObject({ entree: 'glisse_haut', sortie: 'zoom' });
  });

  it('la page propose seulement le catalogue et enregistre les réglages saisis', async () => {
    const m = await nouveauMontage();
    const a = m.timeline.scenes[0]!;
    const page = await voir(`/montages/editer?id=${m.id}`);
    for (const champ of ['anim-entree', 'anim-sortie', 'anim-duree', 'anim-delai', 'zoom-actif', 'zoom-niveau', 'zoom-decalage']) expect(page.body).toContain(`name="${champ}-${a.id}"`);
    expect(page.body).toContain(`name="transition-${m.timeline.scenes[1]!.id}"`);
    expect(page.body).not.toContain(`name="transition-${a.id}"`);
    expect(page.body).not.toContain('rebond');
    const ok = await poster({ id: m.id, geste: 'enregistrer', [`anim-entree-${a.id}`]: 'glisse_bas', [`anim-duree-${a.id}`]: '0,8', [`zoom-niveau-${a.id}`]: '2,5' });
    expect(ok.statusCode).toBe(303);
    const suite = banc.montages.montages.find((x) => x.parentId === m.id)!;
    expect(suite.timeline.scenes[0]!.animation).toMatchObject({ entree: 'glisse_bas', dureeMs: 800 });
    expect(suite.timeline.scenes[0]!.zoom.niveau).toBe(2.5);
    // Une valeur hors catalogue ou hors bornes est refusée, rien n’est enregistré.
    const m2 = await nouveauMontage();
    const hors = await poster({ id: m2.id, geste: 'enregistrer', [`anim-entree-${a.id}`]: 'rebond' });
    expect(hors.statusCode).toBe(200);
    expect(hors.body).toContain('pas valable');
    const trop = await poster({ id: m2.id, geste: 'enregistrer', [`zoom-niveau-${a.id}`]: '12' });
    expect(trop.body).toContain('pas valable');
    expect(banc.montages.montages.some((x) => x.parentId === m2.id)).toBe(false);
  });
  it('l’aperçu joue l’animation et le zoom, et suit les champs sans rien enregistrer', async () => {
    const m = await nouveauMontage();
    const a = m.timeline.scenes[0]!;
    expect(a.points.length).toBeGreaterThan(0);
    const sans = await voir(`/montages/apercu.svg?id=${m.id}&scene=${a.id}&anim-entree-${a.id}=aucune&anim-sortie-${a.id}=aucune&anim-delai-${a.id}=0`);
    expect(sans.body).not.toContain('<animateTransform');
    const zoom = await voir(`/montages/apercu.svg?id=${m.id}&scene=${a.id}&anim-entree-${a.id}=zoom&anim-sortie-${a.id}=zoom`);
    expect(zoom.statusCode).toBe(200);
    expect(zoom.body).toContain('<animate attributeName="opacity"');
    expect(zoom.body).toContain('type="scale"');
    const glisse = await voir(`/montages/apercu.svg?id=${m.id}&scene=${a.id}&anim-entree-${a.id}=glisse_haut`);
    expect(glisse.body).toContain('type="translate"');
    expect(String(zoom.headers['content-security-policy'])).toContain("default-src 'none'");
    // Le zoom suit les clics ; le retirer enlève le cadre ; un niveau plus fort change le cadre.
    expect(zoom.body).toContain('#3DDC84');
    const retire = await voir(`/montages/apercu.svg?id=${m.id}&scene=${a.id}&zoom-actif-${a.id}=non`);
    expect(retire.body).not.toContain('#3DDC84');
    const fort = await voir(`/montages/apercu.svg?id=${m.id}&scene=${a.id}&zoom-niveau-${a.id}=3`);
    const doux = await voir(`/montages/apercu.svg?id=${m.id}&scene=${a.id}&zoom-niveau-${a.id}=1,2`);
    expect(fort.body).not.toBe(doux.body);
    expect(banc.montages.montages.some((x) => x.parentId === m.id)).toBe(false);
  });

  it('montage.regenerer : met un rendu en file avec sa tâche et ne change pas le montage ; la progression se lit par rendu.lire', async () => {
    const m = await nouveauMontage();
    const avant = JSON.stringify(m.timeline);
    const rendus = banc.montages.rendus.length;
    const r = await appeler(jetonA, 'montage/regenerer', { id: m.id });
    expect(r.statusCode).toBe(200);
    const { tacheId } = r.json().donnees as { montageId: string; tacheId: string };
    expect(banc.montages.rendus).toHaveLength(rendus + 1);
    const nouveau = banc.montages.rendus.at(-1)!;
    expect(nouveau).toMatchObject({ montageId: m.id, genre: 'allege', etat: 'en_file', tacheId });
    expect(banc.file.taches.some((t) => t.id === tacheId && t.type === 'rendu')).toBe(true);
    const lu = await appeler(jetonA, 'rendu/lire', { id: nouveau.id });
    expect(lu.json().donnees.rendu.etat).toBe('en_file');
    expect(JSON.stringify(banc.montages.montages.find((x) => x.id === m.id)!.timeline)).toBe(avant);
    expect(banc.montages.montages.filter((x) => x.serieId === m.serieId)).toHaveLength(1);
  });
  it('montage.regenerer : refusé pour un autre espace, un identifiant inconnu et un genre inconnu', async () => {
    const m = await nouveauMontage();
    const rendus = banc.montages.rendus.length;
    expect((await appeler(jetonB, 'montage/regenerer', { id: m.id })).statusCode).toBe(404);
    expect((await appeler(jetonA, 'montage/regenerer', { id: randomUUID() })).statusCode).toBe(404);
    expect((await appeler(jetonA, 'montage/regenerer', { id: m.id, genre: 'enorme' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/montage/regenerer', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ id: m.id }) })).statusCode).toBe(401);
    expect(banc.montages.rendus).toHaveLength(rendus);
  });
  it('le même montage et le même film donnent deux plans de rendu identiques (FR-30)', async () => {
    const m = await nouveauMontage();
    const un = JSON.stringify(construirePlanRendu(m.timeline, parametresTexte(m.gabarit.definition), { genre: 'allege' }));
    const deux = JSON.stringify(construirePlanRendu(structuredClone(m.timeline), parametresTexte(structuredClone(m.gabarit.definition)), { genre: 'allege' }));
    expect(deux).toBe(un);
    await appeler(jetonA, 'montage/regenerer', { id: m.id });
    await appeler(jetonA, 'montage/regenerer', { id: m.id });
    const ids = banc.montages.rendus.filter((r) => r.montageId === m.id).map((r) => r.id);
    expect(ids).toHaveLength(3); // le rendu du film, puis les deux regénérations
    expect(new Set(ids).size).toBe(3);
  });
  it('la page régénère : bouton, redirection avec avancement, refus nommé si les rushes sont purgés', async () => {
    const m = await nouveauMontage();
    const page = await voir(`/montages?id=${m.id}`);
    expect(page.body).toContain('Regénérer la vidéo');
    const rendus = banc.montages.rendus.length;
    const ok = await posterMontages(m.id, { id: m.id, regeneration: 'rendu' });
    expect(ok.statusCode).toBe(303);
    expect(ok.headers.location).toBe(`/montages?id=${m.id}&lance=rendu`);
    expect(banc.montages.rendus).toHaveLength(rendus + 1);
    expect((await voir(`/montages?id=${m.id}&lance=rendu`)).body).toContain('Rendu lancé');
    expect((await posterMontages(m.id, { id: m.id, regeneration: 'inconnue' })).statusCode).toBe(200);
    expect(banc.montages.rendus).toHaveLength(rendus + 1);
    expect((await posterMontages(m.id, { id: m.id, regeneration: 'rendu' }, cookieA, {})).statusCode).toBe(403);
    banc.montages.espacesVisibles = [];
    expect((await posterMontages(m.id, { id: m.id, regeneration: 'rendu' }, cookieB)).body).toContain('n’existe pas');
    banc.montages.espacesVisibles = undefined;
    expect(banc.montages.rendus).toHaveLength(rendus + 1);
  });

  it('rushes purgés : regénérer est refusé par SEANCE_PURGEE avec la date de purge, sans rien mettre en file', async () => {
    const m = await nouveauMontage();
    await banc.montages.marquerPurge(marqueId, utilisateurA, m.filmFichierId, new Date('2026-03-05T10:00:00Z'));
    const rendus = banc.montages.rendus.length;
    const r = await appeler(jetonA, 'montage/regenerer', { id: m.id });
    expect(r.statusCode).toBe(409);
    expect(r.json().erreur.code).toBe('SEANCE_PURGEE');
    expect(r.json().erreur.message).toContain('5 mars 2026');
    expect(banc.montages.rendus).toHaveLength(rendus);
    expect((await posterMontages(m.id, { id: m.id, regeneration: 'rendu' })).body).toContain('5 mars 2026');
  });
});
