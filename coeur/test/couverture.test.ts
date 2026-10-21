// Histoire 3.5 : trois couvertures au style du gabarit, choix d'une variante (actions, image SVG, page).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('couverture d’un montage', () => {
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
    app.inject({ method: 'POST', url: '/montages/variantes', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });

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

  it('montage.couvertures : trois variantes différentes, la variante par défaut est la choisie', async () => {
    const m = await nouveauMontage();
    const r = await appeler(jetonA, 'montage/couvertures', { id: m.id });
    expect(r.statusCode).toBe(200);
    const { variantes } = r.json().donnees as { variantes: { variante: string; choisie: boolean; svg: string }[] };
    expect(variantes.map((v) => v.variante)).toEqual(['titre', 'ecran', 'bandeau']);
    expect(variantes.filter((v) => v.choisie).map((v) => v.variante)).toEqual(['titre']);
    expect(new Set(variantes.map((v) => v.svg)).size).toBe(3);
    for (const v of variantes) expect(v.svg).toMatch(/^<svg /);
  });
  it('montage.couvrir : nouvelle version immuable, ancienne intacte, aucun rendu lancé ; inchangé si déjà choisie', async () => {
    const m = await nouveauMontage();
    const avant = JSON.stringify(m.timeline);
    const rendus = banc.montages.rendus.length;
    const debut = Date.now();
    const r = await appeler(jetonA, 'montage/couvrir', { id: m.id, variante: 'bandeau' });
    expect(Date.now() - debut).toBeLessThan(2000);
    expect(r.statusCode).toBe(200);
    const { montage } = r.json().donnees as { montage: { id: string; numero: number; origine: string; parentId: string; timeline: { couverture: { variante: string } } } };
    expect(montage).toMatchObject({ numero: 2, origine: 'edition', parentId: m.id });
    expect(montage.timeline.couverture.variante).toBe('bandeau');
    expect(JSON.stringify(banc.montages.montages.find((x) => x.id === m.id)!.timeline)).toBe(avant);
    expect(banc.montages.rendus).toHaveLength(rendus);
    const encore = await appeler(jetonA, 'montage/couvrir', { id: montage.id, variante: 'bandeau' });
    expect(encore.json().donnees).toMatchObject({ inchange: true });
    expect(banc.montages.montages.filter((x) => x.serieId === m.serieId)).toHaveLength(2);
  });
  it('refuse une variante inconnue, un autre espace, une version périmée et des rushes purgés', async () => {
    const m = await nouveauMontage();
    expect((await appeler(jetonA, 'montage/couvrir', { id: m.id, variante: 'etoile' })).statusCode).toBe(400);
    expect((await appeler(jetonB, 'montage/couvrir', { id: m.id, variante: 'ecran' })).statusCode).toBe(404);
    expect((await appeler(jetonB, 'montage/couvertures', { id: m.id })).statusCode).toBe(404);
    expect((await appeler(jetonA, 'montage/couvrir', { id: m.id, variante: 'ecran' })).statusCode).toBe(200);
    const perime = await appeler(jetonA, 'montage/couvrir', { id: m.id, variante: 'bandeau' });
    expect(perime.statusCode).toBe(409);
    expect(perime.json().erreur.code).toBe('MONTAGE_VERSION_PERIMEE');
    const p = await nouveauMontage();
    await banc.montages.marquerPurge(marqueId, utilisateurA, p.filmFichierId, new Date('2026-03-05T10:00:00Z'));
    const montages = banc.montages.montages.length;
    const r = await appeler(jetonA, 'montage/couvrir', { id: p.id, variante: 'ecran' });
    expect(r.statusCode).toBe(409);
    expect(r.json().erreur.code).toBe('SEANCE_PURGEE');
    expect(banc.montages.montages).toHaveLength(montages);
  });
  it('un texte hostile est échappé dans l’image', async () => {
    const m = await nouveauMontage();
    const a = m.timeline.scenes[0]!;
    const r = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'texte', sceneId: a.id, accroche: '<script>alert(1)</script>', texteEcran: '"><img src=x onerror=1>' }] });
    const id = r.json().donnees.montage.id as string;
    for (const variante of ['titre', 'ecran', 'bandeau']) {
      const img = await voir(`/montages/couverture.svg?id=${id}&variante=${variante}`);
      expect(img.statusCode).toBe(200);
      expect(img.headers['content-type']).toContain('image/svg+xml');
      expect(img.headers['content-security-policy']).toContain("default-src 'none'");
      expect(img.body).not.toContain('<script');
      expect(img.body).not.toContain('<img');
      expect(img.body).toContain('&lt;script&gt;');
    }
  });
  it('l’image est cloisonnée : 404 pour un autre espace, une variante inconnue ou un identifiant mal formé', async () => {
    const m = await nouveauMontage();
    expect((await voir(`/montages/couverture.svg?id=${m.id}&variante=titre`, cookieB)).statusCode).toBe(404);
    expect((await voir(`/montages/couverture.svg?id=${m.id}&variante=zzz`)).statusCode).toBe(404);
    expect((await voir('/montages/couverture.svg?id=../../etc&variante=titre')).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/montages/couverture.svg?id=${m.id}&variante=titre` })).statusCode).not.toBe(200);
  });
  it('la page montre les trois variantes en onglet, la choisie marquée', async () => {
    const m = await nouveauMontage();
    const r = await voir(`/montages/variantes?id=${m.id}`);
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('role="tablist"');
    expect(r.body).toContain('aria-selected="true"');
    for (const v of ['titre', 'ecran', 'bandeau']) expect(r.body).toContain(`/montages/couverture.svg?id=${m.id}&amp;variante=${v}`.replace('&amp;', r.body.includes('&amp;variante') ? '&amp;' : '&'));
    expect((await voir(`/montages/variantes?id=${m.id}`, cookieB)).statusCode).toBe(404);
  });
  it('la page enregistre le choix : redirection 303 vers la nouvelle version ; les rushes purgés sont dits', async () => {
    const m = await nouveauMontage();
    const r = await poster({ id: m.id, variante: 'ecran' });
    expect(r.statusCode).toBe(303);
    const nouveau = banc.montages.montages.find((x) => x.parentId === m.id)!;
    expect(r.headers.location).toBe(`/montages/variantes?id=${nouveau.id}&ok=1`);
    const vue = await voir(r.headers.location as string);
    expect(vue.body).toContain('role="status"');
    const p = await nouveauMontage();
    await banc.montages.marquerPurge(marqueId, utilisateurA, p.filmFichierId, new Date('2026-03-05T10:00:00Z'));
    const refus = await poster({ id: p.id, variante: 'ecran' });
    expect(refus.statusCode).toBe(200);
    expect(refus.body).toContain('role="alert"');
    expect(refus.body).toContain('5 mars 2026');
    expect((await poster({ id: m.id, variante: 'ecran' }, cookieA, {})).statusCode).toBe(403);
  });
});
