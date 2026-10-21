// Histoire 2.7 : gabarit de départ à chaque espace, trois choix, gardes à l'enregistrement, par l'interface, l'API et le MCP.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { GABARIT_DE_DEPART } from '../src/domaine/gabarit.ts';
import { construireServeur } from '../src/serveur.ts';
import { ACTIONS } from '../src/services/actions.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
type App = Awaited<ReturnType<typeof construireServeur>>;

describe('gabarit : départ, trois choix, gardes', () => {
  let app: App;
  let banc: BancDeTest;
  let marqueId: string;
  let espaceA: string;
  let espaceB: string;
  let jetonA: string;
  let jetonB: string;
  let jetonLecture: string;
  let cookieA: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const choix = { couleurPrincipale: '#2a4d8f', police: 'montserrat', styleSousTitres: 'impact' };

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await banc.marques.creer();
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

  it('un espace reçoit le gabarit de départ, une seule fois, et chacun ne voit que les siens', async () => {
    const r = await appeler(jetonA, 'gabarit/lister');
    expect(r.statusCode).toBe(200);
    const { gabarits } = r.json().donnees;
    expect(gabarits).toHaveLength(1);
    expect(gabarits[0]).toMatchObject({ espaceId: espaceA, parDefaut: true, version: 1, definition: GABARIT_DE_DEPART });
    expect((await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits).toHaveLength(1);
    expect((await appeler(jetonB, 'gabarit/lister')).json().donnees.gabarits[0].espaceId).toBe(espaceB);
  });

  it('les trois choix changent la couleur, la police et le style ; la version monte et l’action est au journal', async () => {
    const id = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].id;
    const r = await appeler(jetonA, 'gabarit/personnaliser', { id, ...choix });
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees.gabarit).toMatchObject({ version: 2, definition: { couleurs: ['#2A4D8F', '#FFFFFF', '#101820', '#F2B705'], policeTitres: 'montserrat', policeSousTitres: 'montserrat', styleSousTitres: 'impact' } });
    expect(banc.audit.lignes.some((l) => l.action === 'gabarit_personnaliser' && l.objet === `gabarit:${id}`)).toBe(true);
  });

  it('une couleur qui rompt le contraste est refusée en 422 : scène, code temporel, élément, mesure, seuil ; rien n’est enregistré', async () => {
    const id = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].id;
    const avant = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].version;
    const r = await appeler(jetonA, 'gabarit/personnaliser', { id, ...choix, couleurPrincipale: '#ffd700' });
    expect(r.statusCode).toBe(422);
    const e = r.json().erreur;
    expect(e.code).toBe('GARDE_NON_RESPECTEE');
    expect(e.message).toMatch(/scène scene-1 \(00:00\.0\), scene-1-titre/);
    expect(e.message).toMatch(/seuil 4,5:1/);
    expect(e.contexte.violations[0]).toMatchObject({ code: 'CONTRASTE', segment: 'scene-1', element: 'scene-1-titre', seuil: 4.5 });
    expect((await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].version).toBe(avant);
  });

  it('aucune action n’accepte de forcer une garde', async () => {
    const id = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].id;
    const r = await appeler(jetonA, 'gabarit/personnaliser', { id, ...choix, couleurPrincipale: '#ffd700', forcer: true });
    expect(r.statusCode).toBe(400);
    expect(r.json().erreur.code).toBe('ENTREE_INVALIDE');
    for (const a of ACTIONS) {
      const forme = JSON.stringify((a.entree as unknown as { toJSONSchema: () => unknown }).toJSONSchema?.() ?? {});
      expect(forme, `${a.domaine}.${a.verbe}`).not.toMatch(/forc|ignor|contourn/i);
    }
  });

  it('un gabarit d’un autre espace n’existe pas pour ce jeton ; une police inconnue ou une couleur mal formée est refusée', async () => {
    const autre = (await appeler(jetonB, 'gabarit/lister')).json().donnees.gabarits[0].id;
    const r = await appeler(jetonA, 'gabarit/personnaliser', { id: autre, ...choix });
    expect(r.statusCode).toBe(404);
    expect(r.json().erreur.code).toBe('GABARIT_INTROUVABLE');
    const id = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].id;
    expect((await appeler(jetonA, 'gabarit/personnaliser', { id, ...choix, police: 'comic' })).statusCode).toBe(400);
    expect((await appeler(jetonA, 'gabarit/personnaliser', { id, ...choix, couleurPrincipale: 'rouge' })).statusCode).toBe(400);
  });

  it('un jeton en lecture ne peut pas écrire ; sans jeton, 401', async () => {
    const id = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].id;
    expect((await appeler(jetonLecture, 'gabarit/personnaliser', { id, ...choix })).statusCode).toBe(403);
    expect((await appeler(jetonLecture, 'gabarit/lister')).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/gabarit/lister', headers: { 'content-type': 'application/json' }, payload: '{}' })).statusCode).toBe(401);
  });

  it('la page propose les trois choix, enregistre par la même action et montre le refus des gardes', async () => {
    const page = await app.inject({ method: 'GET', url: '/gabarit', headers: { cookie: cookieA } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('name="couleurPrincipale"');
    expect(page.body).toContain('name="police"');
    expect(page.body).toContain('name="styleSousTitres"');
    const id = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].id;
    const poster = (corps: Record<string, string>, entetes: Record<string, string> = { origin: ORIGINE }) =>
      app.inject({ method: 'POST', url: '/gabarit', headers: { cookie: cookieA, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });
    const bon = await poster({ id, couleurPrincipale: '#1b6b5a', police: 'inter', styleSousTitres: 'karaoke' });
    expect(bon.statusCode).toBe(303);
    const refus = await poster({ id, couleurPrincipale: '#ffd700', police: 'inter', styleSousTitres: 'karaoke' });
    expect(refus.statusCode).toBe(200);
    expect(refus.body).toContain('seuil 4,5:1');
    expect((await poster({ id, couleurPrincipale: '#1b6b5a', police: 'inter', styleSousTitres: 'karaoke' }, {})).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/gabarit' })).statusCode).not.toBe(200);
  });

  it('le MCP expose gabarit_lister et gabarit_personnaliser', async () => {
    const r = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${jetonA}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('gabarit_lister');
    expect(r.body).toContain('gabarit_personnaliser');
  });
});
