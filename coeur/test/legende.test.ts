// Histoire 3.7 : légende et hashtags par réseau, bornes de bornes.json (domaine, actions, page).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import { BORNES } from '../src/domaine/bornes.ts';
import { nettoyerLegende, normaliserHashtag, verifierLegende } from '../src/domaine/legende.ts';
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

describe('légende et hashtags', () => {
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
    app.inject({ method: 'POST', url: '/montages/legende', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });

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

  it('domaine : bornes lues dans bornes.json, hashtags normalisés et dédoublonnés, refus nommant la borne', () => {
    const b = BORNES.reseaux.instagram;
    expect(verifierLegende('instagram', ' Bonjour\r\nle monde ', ['#Cuisine', 'cuisine', ' Batch_Cooking '])).toEqual({ ok: true, valeur: { legende: 'Bonjour\nle monde', hashtags: ['cuisine', 'batch_cooking'] } });
    expect(verifierLegende('instagram', 'x'.repeat(b.legendeMaxCaracteres), [])).toMatchObject({ ok: true });
    expect(verifierLegende('instagram', 'x'.repeat(b.legendeMaxCaracteres + 1), [])).toMatchObject({ ok: false, refus: { code: 'LEGENDE_TROP_LONGUE', contexte: { max: b.legendeMaxCaracteres } } });
    const trop = Array.from({ length: b.hashtagsMax + 1 }, (_, i) => `h${i}`);
    expect(verifierLegende('instagram', 'ok', trop)).toMatchObject({ ok: false, refus: { code: 'TROP_DE_HASHTAGS', contexte: { max: b.hashtagsMax } } });
    for (const mauvais of ['', '#', 'a b', 'a<b', 'x'.repeat(61)]) expect(verifierLegende('tiktok', 'ok', [mauvais])).toMatchObject({ ok: false, refus: { code: 'HASHTAG_INVALIDE' } });
    expect(normaliserHashtag('##Été')).toBe('été');
    expect(nettoyerLegende('a\u0000b\u200bc\nd')).toBe('abc\nd');
    // Les émojis comptent pour un caractère, comme chez le réseau.
    expect(verifierLegende('instagram', '😀'.repeat(b.legendeMaxCaracteres), [])).toMatchObject({ ok: true });
  });
  it('montage.legende : propose l’accroche tant que rien n’est enregistré, puis rend ce qui l’est, avec les bornes', async () => {
    const m = await nouveauMontage();
    const r = await appeler(jetonA, 'montage/legende', { id: m.id, reseau: 'instagram' });
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees).toMatchObject({ enregistree: false, hashtags: [], legende: m.timeline.scenes[0]!.accroche, bornes: BORNES.reseaux.instagram });
    await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'instagram', legende: 'Ma légende', hashtags: ['#Un', 'deux'] });
    const lue = await appeler(jetonA, 'montage/legende', { id: m.id, reseau: 'instagram' });
    expect(lue.json().donnees).toMatchObject({ enregistree: true, legende: 'Ma légende', hashtags: ['un', 'deux'] });
    // Un autre réseau reste indépendant.
    expect((await appeler(jetonA, 'montage/legende', { id: m.id, reseau: 'tiktok' })).json().donnees.enregistree).toBe(false);
  });
  it('montage.legender : remplace, suit la vidéo d’une version à l’autre, ne crée aucune version', async () => {
    const m = await nouveauMontage();
    await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'facebook', legende: 'Première', hashtags: [] });
    const r = await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'facebook', legende: 'Seconde', hashtags: ['a'] });
    expect(r.statusCode).toBe(200);
    expect(banc.montages.legendes.filter((l) => l.serieId === m.serieId && l.reseau === 'facebook')).toHaveLength(1);
    expect(banc.montages.montages.filter((x) => x.serieId === m.serieId)).toHaveLength(1);
    const v2 = (await appeler(jetonA, 'montage/couvrir', { id: m.id, variante: 'ecran' })).json().donnees.montage.id as string;
    expect((await appeler(jetonA, 'montage/legende', { id: v2, reseau: 'facebook' })).json().donnees).toMatchObject({ legende: 'Seconde', hashtags: ['a'] });
  });
  it('refuse en nommant la borne, sans rien enregistrer ; cloisonne ; valide les entrées', async () => {
    const m = await nouveauMontage();
    const b = BORNES.reseaux.instagram;
    const longue = await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'instagram', legende: 'x'.repeat(b.legendeMaxCaracteres + 1), hashtags: [] });
    expect(longue.statusCode).toBe(422);
    expect(longue.json().erreur.code).toBe('LEGENDE_TROP_LONGUE');
    expect(longue.json().erreur.message).toContain(String(b.legendeMaxCaracteres));
    const trop = await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'instagram', legende: 'ok', hashtags: Array.from({ length: b.hashtagsMax + 1 }, (_, i) => `h${i}`) });
    expect(trop.json().erreur.code).toBe('TROP_DE_HASHTAGS');
    expect((await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'instagram', legende: 'ok', hashtags: ['a b'] })).json().erreur.code).toBe('HASHTAG_INVALIDE');
    expect(banc.montages.legendes).toHaveLength(0);
    expect((await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'snapchat', legende: 'ok', hashtags: [] })).statusCode).toBe(400);
    expect((await appeler(jetonA, 'montage/legender', { id: m.id, reseau: 'instagram', legende: 'ok', hashtags: [], extra: 1 })).statusCode).toBe(400);
    expect((await appeler(jetonB, 'montage/legender', { id: m.id, reseau: 'instagram', legende: 'ok', hashtags: [] })).statusCode).toBe(404);
    expect((await appeler(jetonB, 'montage/legende', { id: m.id, reseau: 'instagram' })).statusCode).toBe(404);
    expect(banc.montages.legendes).toHaveLength(0);
  });
  it('la page montre le radiogroup, le compteur et les puces ; le texte hostile est échappé', async () => {
    const m = await nouveauMontage();
    const r = await poster({ id: m.id, reseau: 'instagram', legende: '<script>alert(1)</script>', hashtags: 'cuisine', nouveau: 'Batch #Été', geste: 'ajouter' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('role="radiogroup"');
    expect(r.body).toContain('aria-live="polite"');
    expect(r.body).toContain(`25 / ${BORNES.reseaux.instagram.legendeMaxCaracteres} caractères`);
    expect(r.body).toContain('#cuisine');
    expect(r.body).toContain('#batch');
    expect(r.body).toContain('#été');
    expect(r.body).toContain('&lt;script&gt;');
    expect(r.body).not.toContain('<script>alert');
    const retire = await poster({ id: m.id, reseau: 'instagram', legende: 'x', hashtags: 'cuisine batch', geste: 'retirer:batch' });
    expect(retire.body).toContain('#cuisine');
    expect(retire.body).not.toContain('#batch');
  });
  it('la page enregistre : redirection 303 puis confirmation ; un dépassement affiche l’alerte et ne garde rien', async () => {
    const m = await nouveauMontage();
    const ok = await poster({ id: m.id, reseau: 'tiktok', legende: 'Bonjour', hashtags: 'a b', geste: 'enregistrer' });
    expect(ok.statusCode).toBe(303);
    expect(ok.headers.location).toBe(`/montages/legende?id=${m.id}&reseau=tiktok&ok=1`);
    const vue = await voir(ok.headers.location as string);
    expect(vue.body).toContain('role="status"');
    expect(vue.body).toContain('Bonjour');
    const trop = await poster({ id: m.id, reseau: 'instagram', legende: 'x'.repeat(BORNES.reseaux.instagram.legendeMaxCaracteres + 1), hashtags: '', geste: 'enregistrer' });
    expect(trop.statusCode).toBe(200);
    expect(trop.body).toContain('role="alert"');
    expect(trop.body).toContain(`${BORNES.reseaux.instagram.legendeMaxCaracteres} au plus`);
    expect(banc.montages.legendes.some((l) => l.reseau === 'instagram')).toBe(false);
  });
  it('la page est cloisonnée : 404 pour un autre espace ou un identifiant mal formé, 403 sans origine', async () => {
    const m = await nouveauMontage();
    expect((await voir(`/montages/legende?id=${m.id}`, cookieB)).statusCode).toBe(404);
    expect((await voir('/montages/legende?id=../x')).statusCode).toBe(404);
    banc.montages.espacesVisibles = [];
    const autre = await poster({ id: m.id, reseau: 'instagram', legende: 'x', hashtags: '', geste: 'enregistrer' }, cookieB);
    banc.montages.espacesVisibles = undefined;
    expect(autre.statusCode).toBe(404);
    expect((await poster({ id: m.id, reseau: 'instagram', legende: 'x', hashtags: '', geste: 'enregistrer' }, cookieA, {})).statusCode).toBe(403);
    expect(banc.montages.legendes).toHaveLength(0);
  });
});
