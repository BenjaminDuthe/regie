// Histoire 4.1 : déclaration de l'application et de ses hôtes autorisés, par l'interface, l'API et le MCP.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
type App = Awaited<ReturnType<typeof construireServeur>>;

describe('application : déclaration et liste stricte d’hôtes', () => {
  let app: App;
  let banc: BancDeTest;
  let espaceA: string;
  let espaceB: string;
  let jetonA: string;
  let jetonB: string;
  let jetonLecture: string;
  let cookieA: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const demo = { nom: 'Démo Établia', accueil: 'https://demo.etablia.fr/accueil', hotes: ['Demo.Etablia.fr', 'cdn.etablia.fr'] };

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    const marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
    espaceA = a.espaces[0]!.id;
    espaceB = b.espaces[0]!.id;
    const jeton = async (sub: string, utilisateurId: string, espaceIds: string[], portees: ('lecture' | 'ecriture')[]) =>
      (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 'test', portees, espaceIds, dureeJours: 30 })).clair;
    jetonA = await jeton('sub-a', a.utilisateurId, [espaceA], ['lecture', 'ecriture']);
    jetonB = await jeton('sub-b', b.utilisateurId, [espaceB], ['lecture', 'ecriture']);
    jetonLecture = await jeton('sub-a', a.utilisateurId, [espaceA], ['lecture']);
    cookieA = `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(), espaceActifId: espaceA })}`;
    app = await construireServeur({ services: banc.services });
  });
  afterAll(async () => app?.close());

  it('déclare une application : hôtes normalisés, hôte d’accueil ajouté, au journal ; la liste ne montre que mes espaces', async () => {
    const r = await appeler(jetonA, 'application/declarer', { espaceId: espaceA, ...demo });
    expect(r.statusCode).toBe(200);
    const a = r.json().donnees.application;
    expect(a).toMatchObject({ espaceId: espaceA, nom: 'Démo Établia', version: 1, hotes: ['cdn.etablia.fr', 'demo.etablia.fr'] });
    expect(banc.audit.lignes.some((l) => l.action === 'application_declarer' && l.objet === `application:${a.id}`)).toBe(true);
    expect((await appeler(jetonA, 'application/lister')).json().donnees.applications).toHaveLength(1);
    expect((await appeler(jetonB, 'application/lister')).json().donnees.applications).toHaveLength(0);
  });

  it('refuse un hôte joker, une IP, un nom local, un port : 422 qui nomme l’hôte fautif, rien n’est enregistré', async () => {
    for (const mauvais of ['*.etablia.fr', '192.168.1.20', '127.0.0.1', 'nas.local', 'localhost', 'demo.etablia.fr:8443', 'https://x.fr']) {
      const r = await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Mauvaise', accueil: 'https://demo.etablia.fr/', hotes: [mauvais] });
      expect(r.statusCode, mauvais).toBe(422);
      expect(r.json().erreur.code).toBe('HOTE_REFUSE');
      expect(r.json().erreur.message).toContain(mauvais);
    }
    expect((await appeler(jetonA, 'application/lister')).json().donnees.applications).toHaveLength(1);
  });

  it('refuse une adresse d’accueil http, avec identifiants, en IP ou illisible', async () => {
    for (const accueil of ['http://demo.etablia.fr/', 'https://u:p@demo.etablia.fr/', 'https://10.0.0.5/', 'pas une adresse', 'https://demo.etablia.fr:8443/']) {
      const r = await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Mauvaise', accueil, hotes: [] });
      expect(r.statusCode, accueil).toBe(422);
      expect(r.json().erreur.code).toBe('ACCUEIL_REFUSE');
    }
  });

  it('plus de vingt hôtes : refusé ; un nom déjà pris dans l’espace : 409', async () => {
    const trop = Array.from({ length: 21 }, (_, i) => `h${i}.etablia.fr`);
    expect((await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Trop', accueil: 'https://demo.etablia.fr/', hotes: trop })).json().erreur.code).toBe('HOTES_TROP_NOMBREUX');
    const doublon = await appeler(jetonA, 'application/declarer', { espaceId: espaceA, ...demo });
    expect(doublon.statusCode).toBe(409);
    expect(doublon.json().erreur.code).toBe('APPLICATION_NOM_PRIS');
  });

  it('modifie : la version monte, les hôtes changent ; une application d’un autre espace est introuvable (404)', async () => {
    const id = (await appeler(jetonA, 'application/lister')).json().donnees.applications[0].id;
    const r = await appeler(jetonA, 'application/modifier', { id, ...demo, hotes: ['demo.etablia.fr'] });
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees.application).toMatchObject({ version: 2, hotes: ['demo.etablia.fr'] });
    expect((await appeler(jetonB, 'application/modifier', { id, ...demo })).statusCode).toBe(404);
    expect((await appeler(jetonA, 'application/modifier', { id, ...demo, hotes: ['*.etablia.fr'] })).json().erreur.code).toBe('HOTE_REFUSE');
    expect((await appeler(jetonA, 'application/lister')).json().donnees.applications[0].version).toBe(2);
  });

  it('un espace étranger au jeton est refusé (404) ; un jeton en lecture n’écrit pas ; sans jeton, 401 ; champ inconnu refusé', async () => {
    expect((await appeler(jetonA, 'application/declarer', { espaceId: espaceB, ...demo, nom: 'Intrus' })).statusCode).toBe(404);
    expect((await appeler(jetonLecture, 'application/declarer', { espaceId: espaceA, ...demo, nom: 'Lecture' })).statusCode).toBe(403);
    expect((await appeler(jetonLecture, 'application/lister')).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/application/lister', headers: { 'content-type': 'application/json' }, payload: '{}' })).statusCode).toBe(401);
    expect((await appeler(jetonA, 'application/declarer', { espaceId: espaceA, ...demo, nom: 'Extra', preuve: true })).statusCode).toBe(400);
  });

  it('la page « Démos d’app » liste les applications et les hôtes, déclare et modifie par les mêmes actions, grille en 1/2/3 colonnes', async () => {
    const page = await app.inject({ method: 'GET', url: '/demos', headers: { cookie: cookieA } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Démo Établia');
    expect(page.body).toContain('<code>demo.etablia.fr</code>');
    expect(page.body).toMatch(/width>=900px/);
    expect(page.body).toMatch(/width>=1240px/);
    const poster = (corps: Record<string, string>, entetes: Record<string, string> = { origin: ORIGINE }) =>
      app.inject({ method: 'POST', url: '/demos', headers: { cookie: cookieA, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });
    const ok = await poster({ geste: 'declarer', espaceId: espaceA, nom: 'Deuxième', accueil: 'https://autre.etablia.fr/', hotes: 'autre.etablia.fr\nstatique.etablia.fr' });
    expect(ok.statusCode).toBe(303);
    const refus = await poster({ geste: 'declarer', espaceId: espaceA, nom: 'Mauvaise', accueil: 'https://autre.etablia.fr/', hotes: '10.0.0.1' });
    expect(refus.statusCode).toBe(200);
    expect(refus.body).toContain('10.0.0.1');
    expect((await poster({ geste: 'declarer', espaceId: espaceA, nom: 'X', accueil: 'https://a.etablia.fr/', hotes: '' }, {})).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/demos' })).statusCode).not.toBe(200);
  });
});
