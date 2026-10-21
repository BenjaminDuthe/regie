// Histoire 3.10 : éditer les textes, l'ordre et les durées d'une vidéo (action, page, aperçu, parité).
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

describe('éditeur de montage', () => {
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

  it('montage.editer : un texte et une durée changent, une nouvelle version immuable est créée, l’ancienne ne bouge pas, pas de rendu lancé', async () => {
    const m = await nouveauMontage();
    const avant = JSON.stringify(m.timeline);
    const rendus = banc.montages.rendus.length;
    const [a] = m.timeline.scenes;
    const r = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'texte', sceneId: a!.id, accroche: '  Nouvelle accroche  ' }, { op: 'duree', sceneId: a!.id, dureeMs: a!.dureeMs + 500 }] });
    expect(r.statusCode).toBe(200);
    const { montage, violations } = r.json().donnees as { montage: { id: string; numero: number; origine: string; parentId: string; timeline: { scenes: { accroche: string; dureeMs: number }[] } }; violations: unknown[] };
    expect(montage).toMatchObject({ numero: 2, origine: 'edition', parentId: m.id });
    expect(montage.timeline.scenes[0]).toMatchObject({ accroche: 'Nouvelle accroche', dureeMs: a!.dureeMs + 500 });
    expect(violations).toEqual([]);
    expect(JSON.stringify(banc.montages.montages.find((x) => x.id === m.id)!.timeline)).toBe(avant);
    expect(banc.montages.rendus).toHaveLength(rendus);
  });
  it('déplace, duplique et retire des scènes', async () => {
    const m = await nouveauMontage();
    const [a, b] = m.timeline.scenes.map((s) => s.id) as [string, string];
    const r = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'deplacer', sceneId: b, sens: 'monter' }, { op: 'dupliquer', sceneId: a }] });
    expect(r.json().donnees.montage.timeline.scenes.map((s: { id: string }) => s.id)).toEqual([b, a, 'sc-3']);
    const r2 = await appeler(jetonA, 'montage/editer', { id: r.json().donnees.montage.id, operations: [{ op: 'retirer', sceneId: 'sc-3' }] });
    expect(r2.json().donnees.montage.timeline.scenes).toHaveLength(2);
  });
  it('la garde nomme la scène fautive à l’enregistrement, sans empêcher la nouvelle version', async () => {
    const m = await nouveauMontage();
    (m.gabarit.definition as { couleurs: string[] }).couleurs = ['#FFFFFF', '#FEFEFE', '#FFFFFF', '#FFFFFF'];
    const sceneId = m.timeline.scenes[1]!.id;
    const r = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'texte', sceneId, texteEcran: 'Un texte illisible' }] });
    expect(r.statusCode).toBe(200);
    const violations = r.json().donnees.violations as { segment: string; code: string; phrase: string }[];
    expect(violations.some((v) => v.segment === sceneId && v.code === 'CONTRASTE')).toBe(true);
    expect(violations[0]!.phrase).toMatch(/seuil/);
  });
  it('refuse une scène inconnue, la dernière scène, une durée impossible, une version périmée et un autre espace', async () => {
    const m = await nouveauMontage();
    const [a, b] = m.timeline.scenes.map((s) => s.id) as [string, string];
    expect((await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'texte', sceneId: 'zz-9', accroche: 'x' }] })).statusCode).toBe(404);
    const duree = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'duree', sceneId: a, dureeMs: 500 }] });
    expect(duree.statusCode).toBe(422);
    expect(duree.json().erreur.code).toBe('TIMELINE_INVALIDE');
    expect((await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'texte', sceneId: a, accroche: 'x'.repeat(81) }] })).statusCode).toBe(400);
    expect((await appeler(jetonA, 'montage/editer', { id: m.id, operations: [] })).statusCode).toBe(400);
    expect((await appeler(jetonB, 'montage/editer', { id: m.id, operations: [{ op: 'retirer', sceneId: a }] })).statusCode).toBe(404);
    const seule = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'retirer', sceneId: a }] });
    expect(seule.statusCode).toBe(200);
    const derniere = await appeler(jetonA, 'montage/editer', { id: seule.json().donnees.montage.id, operations: [{ op: 'retirer', sceneId: b }] });
    expect(derniere.statusCode).toBe(409);
    expect(derniere.json().erreur.code).toBe('DERNIERE_SCENE');
    const perime = await appeler(jetonA, 'montage/editer', { id: m.id, operations: [{ op: 'texte', sceneId: b, accroche: 'tard' }] });
    expect(perime.statusCode).toBe(409);
    expect(perime.json().erreur.code).toBe('MONTAGE_VERSION_PERIMEE');
  });

  it('la page montre les scènes dans l’ordre, avec durée, textes, aperçu et gestes', async () => {
    const m = await nouveauMontage();
    const r = await voir(`/montages/editer?id=${m.id}`);
    expect(r.statusCode).toBe(200);
    const [a, b] = m.timeline.scenes.map((s) => s.id) as [string, string];
    expect(r.body.indexOf(`name="accroche-${a}"`)).toBeGreaterThan(-1);
    expect(r.body.indexOf(`name="accroche-${a}"`)).toBeLessThan(r.body.indexOf(`name="accroche-${b}"`));
    for (const champ of ['accroche', 'ecran', 'voix', 'duree']) expect(r.body).toContain(`name="${champ}-${a}"`);
    expect(r.body).toContain(`/montages/apercu.svg?id=${m.id}`);
    expect(r.body).toContain(`value="deplacer:${b}:monter"`);
    expect(r.body).toContain(`value="dupliquer:${a}"`);
    expect(r.body).toContain(`value="retirer:${a}"`);
    expect(r.body).toContain('Actualiser l’aperçu');
  });
  it('enregistre par la page : redirige vers la nouvelle version, ou dit que rien n’a changé', async () => {
    const m = await nouveauMontage();
    const a = m.timeline.scenes[0]!;
    const champs = { id: m.id, geste: 'enregistrer', [`accroche-${a.id}`]: 'Titre revu', [`duree-${a.id}`]: String(a.dureeMs / 1000).replace('.', ',') };
    const ok = await poster(champs);
    expect(ok.statusCode).toBe(303);
    const suite = banc.montages.montages.find((x) => x.parentId === m.id)!;
    expect(ok.headers.location).toBe(`/montages/editer?id=${suite.id}&ok=1`);
    expect(suite.timeline.scenes[0]!.accroche).toBe('Titre revu');
    const rien = await poster({ id: m.id, geste: 'enregistrer', [`accroche-${a.id}`]: a.accroche });
    expect(rien.statusCode).toBe(200);
    expect(rien.body).toContain('Rien n’a changé');
  });
  it('un geste de la page (déplacer) enregistre une version ; une durée illisible est refusée sur la bonne scène', async () => {
    const m = await nouveauMontage();
    const [a, b] = m.timeline.scenes.map((s) => s.id) as [string, string];
    expect((await poster({ id: m.id, geste: `deplacer:${b}:monter` })).statusCode).toBe(303);
    expect(banc.montages.montages.find((x) => x.parentId === m.id)!.timeline.scenes[0]!.id).toBe(b);
    const m2 = await nouveauMontage();
    const mauvais = await poster({ id: m2.id, geste: 'enregistrer', [`duree-${a}`]: 'beaucoup' });
    expect(mauvais.statusCode).toBe(200);
    expect(mauvais.body).toContain('invalide');
    expect(mauvais.body).toContain('sc-1');
    expect(banc.montages.montages.some((x) => x.parentId === m2.id)).toBe(false);
  });
  it('l’aperçu suit les champs sans rien enregistrer ; les scènes fautives sont marquées en direct', async () => {
    const m = await nouveauMontage();
    (m.gabarit.definition as { couleurs: string[] }).couleurs = ['#FFFFFF', '#FEFEFE', '#FFFFFF', '#FFFFFF'];
    const a = m.timeline.scenes[0]!.id;
    const page = await voir(`/montages/editer?id=${m.id}&accroche-${a}=Coucou`);
    expect(page.body).toContain('Scène fautive');
    expect(page.body).toContain('value="Coucou"');
    const svg = await voir(`/montages/apercu.svg?id=${m.id}&scene=${a}&accroche-${a}=Coucou%20%26%20toi`);
    expect(svg.statusCode).toBe(200);
    expect(String(svg.headers['content-type'])).toContain('image/svg+xml');
    expect(svg.body).toContain('Coucou &amp; toi');
    expect(svg.body).toContain('#E5484D');
    expect(String(svg.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(banc.montages.montages.some((x) => x.parentId === m.id)).toBe(false);
  });
  it('cloisonne et exige une session, une origine et un identifiant valides', async () => {
    const m = await nouveauMontage();
    const a = m.timeline.scenes[0]!.id;
    expect((await voir(`/montages/editer?id=${m.id}`, cookieB)).statusCode).toBe(404);
    expect((await voir(`/montages/apercu.svg?id=${m.id}&scene=${a}`, cookieB)).statusCode).toBe(404);
    expect((await voir(`/montages/apercu.svg?id=pas-un-uuid&scene=${a}`)).statusCode).toBe(404);
    expect((await voir(`/montages/apercu.svg?id=${m.id}&scene=zz-9`)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/montages/editer?id=${m.id}` })).statusCode).not.toBe(200);
    expect((await poster({ id: m.id, geste: `retirer:${a}` }, cookieA, {})).statusCode).toBe(403);
    banc.montages.espacesVisibles = [];
    expect((await poster({ id: m.id, geste: `retirer:${a}` }, cookieB)).statusCode).toBe(404);
    banc.montages.espacesVisibles = undefined;
    expect(banc.montages.montages.some((x) => x.parentId === m.id)).toBe(false);
  });
});
