// Histoire 2.12 : la page des vidéos (liste, aperçu, lecteur natif, rendu bloqué, cloisonnement).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import type { Tache } from '../src/infra/file.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerMontageDuJeu } from '../src/services/film-jeu.ts';
import { creerExecutantRendu } from '../src/services/rendu.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40, 7)]);
const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 6000, genre: 'film_fin' },
];

describe('pages des vidéos', () => {
  let banc: BancDeTest;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let marqueId: string;
  let utilisateurA: string;
  let cookieA: string;
  let cookieB: string;
  let pret: string;
  let bloque: string;
  let enFile: string;
  let sceneBloquee: string;

  const aide = { signal: new AbortController().signal } as never;
  const tacheDe = (renduId: string): Tache =>
    ({ id: randomUUID(), marqueId, utilisateurId: utilisateurA, type: 'rendu', classe: 'lot', gpu: true, reprise: 'verifier', delaiGardeS: 900, tentativesMax: 3, entree: { renduId }, etat: 'en_cours', tentatives: 1, reprises: 0, disponibleLe: new Date(), pointDeNonRetour: false, creeLe: new Date() }) as unknown as Tache;

  async function creer(contrasteFaible: boolean, rendre: boolean) {
    const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };
    const espaceId = (await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia')).espaces[0]!.id;
    const r = await creerMontageDuJeu(
      { montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file },
      { marqueId, utilisateurId: utilisateurA },
      { id: randomUUID(), espaceId, nom: 'Parcours recette' },
      film, WEBM.length, journal, 6000,
    );
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    const m = banc.montages.montages.find((x) => x.id === r.montageId)!;
    if (contrasteFaible) (m.gabarit.definition as { couleurs: string[] }).couleurs = ['#FFFFFF', '#FEFEFE', '#FFFFFF', '#FFFFFF'];
    const rendu = banc.montages.rendus.find((x) => x.montageId === r.montageId)!;
    if (rendre) await creerExecutantRendu({ montages: banc.montages, stockage: banc.stockage, lanceur: { rendre: async () => MP4 }, avecTexte: true }).executer(tacheDe(rendu.id), aide);
    return { montageId: r.montageId, renduId: rendu.id, sceneId: m.timeline.scenes[0]!.id };
  }
  // Le faux dépôt ne connaît que les espaces visibles ; en vrai, la sécurité par ligne de PostgreSQL les tire de la personne.
  const voir = async (url: string, cookie = cookieA) => {
    banc.montages.espacesVisibles = cookie === cookieB ? [] : undefined;
    try {
      return await app.inject({ method: 'GET', url, headers: { cookie } });
    } finally {
      banc.montages.espacesVisibles = undefined;
    }
  };

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: 'http://127.0.0.1:4321' });
    marqueId = await banc.marques.creer();
    utilisateurA = (await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia')).utilisateurId;
    await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Autre');
    const session = async (sub: string) => `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub, email: undefined, authentifieLe: new Date() })}`;
    cookieA = await session('sub-a');
    cookieB = await session('sub-b');
    pret = (await creer(false, true)).montageId;
    const b = await creer(true, true);
    bloque = b.montageId;
    sceneBloquee = b.sceneId;
    enFile = (await creer(false, false)).montageId;
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => app?.close());

  it('liste les vidéos de la personne avec un lien vers chaque aperçu', async () => {
    const r = await voir('/montages');
    expect(r.statusCode).toBe(200);
    for (const id of [pret, bloque, enFile]) expect(r.body).toContain(`/montages?id=${id}`);
  });
  it('ne liste rien à une personne sans vidéo', async () => {
    const r = await voir('/montages', cookieB);
    expect(r.body).not.toContain('/montages?id=');
    expect(r.body).toContain('Aucune vidéo');
  });
  it('montre un lecteur vidéo natif sur une adresse signée de même origine, sans script ni source tierce', async () => {
    const r = await voir(`/montages?id=${pret}`);
    expect(r.body).toMatch(/<video[^>]*controls/);
    const src = /<source src="([^"]+)"/.exec(r.body)?.[1];
    expect(src).toMatch(/^\/v\/session\//);
    expect(r.body).not.toMatch(/<video[^>]*src="https?:/);
    const csp = String(r.headers['content-security-policy']);
    expect(csp).toMatch(/media-src[^;]*'self'/);
    const fichier = await app.inject({ method: 'GET', url: src!.replaceAll('&amp;', '&') });
    expect(fichier.statusCode).toBe(200);
    expect(fichier.rawPayload.equals(MP4)).toBe(true);
    expect(r.body).not.toContain('http-equiv="refresh"');
  });
  it('marque « bloquée » une vidéo qui viole une garde : lisible, scène fautive en avant, mesure et seuil', async () => {
    const r = await voir(`/montages?id=${bloque}`);
    expect(r.body).toMatch(/<video[^>]*controls/);
    expect(r.body).toContain('Bloquée');
    expect(r.body).toContain('Bloquée par les garde-fous');
    expect(r.body).toContain('Scène fautive');
    expect(r.body).toContain(`id="scene-${sceneBloquee}"`);
    expect(r.body).toMatch(/seuil/);
  });
  it('une vidéo en attente de rendu n’a pas de lecteur et se rafraîchit seule', async () => {
    const r = await voir(`/montages?id=${enFile}`);
    expect(r.body).not.toContain('<video');
    expect(r.body).toContain('Rendu en attente');
    expect(r.body).toContain('http-equiv="refresh"');
  });
  it('cloisonne : un autre lecteur, un identifiant inconnu ou mal formé ne montrent rien', async () => {
    for (const id of [pret, randomUUID(), 'pas-un-uuid']) {
      const r = await voir(`/montages?id=${id}`, cookieB);
      expect(r.body).not.toContain('<video');
      expect(r.body).not.toContain('Prête');
      expect(r.body).toContain('n’existe pas');
    }
    expect((await voir(`/montages?id=${pret}`, cookieB)).body).not.toMatch(/\/v\/session\//);
  });
  it('exige une session', async () => {
    const r = await app.inject({ method: 'GET', url: '/montages' });
    expect(r.statusCode).not.toBe(200);
  });
});
