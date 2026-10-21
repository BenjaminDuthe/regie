// Histoires 2.7 et 2.8 : gabarit de départ, trois choix, éditeur complet, aperçu et gardes, par l'interface, l'API et le MCP.
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
    expect(page.body).toContain('name="policeTitres"');
    expect(page.body).toContain('name="policeSousTitres"');
    expect(page.body).toContain('name="styleSousTitres"');
    expect(page.body).toContain('name="carteFinTitre"');
    expect(page.body).toContain('name="hashtags"');
    expect(page.body).toContain('/gabarit/apercu.svg?');
    const id = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].id;
    const base = { couleurPrincipale: '#1b6b5a', couleurTexte: '#ffffff', couleurFond: '#101820', couleurAccent: '#f2b705', policeTitres: 'inter', policeSousTitres: 'inter', styleSousTitres: 'karaoke', carteFinTitre: 'À bientôt', carteFinSousTitre: 'Abonne-toi', legende: '', hashtags: '' };
    const poster = (corps: Record<string, string>, entetes: Record<string, string> = { origin: ORIGINE }) =>
      app.inject({ method: 'POST', url: '/gabarit', headers: { cookie: cookieA, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams({ ...base, geste: 'enregistrer', nom: 'Gabarit de départ', ...corps }).toString() });
    const bon = await poster({ id });
    expect(bon.statusCode).toBe(303);
    const refus = await poster({ id, couleurPrincipale: '#ffd700' });
    expect(refus.statusCode).toBe(200);
    expect(refus.body).toContain('seuil 4,5:1');
    expect((await poster({ id }, {})).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/gabarit' })).statusCode).not.toBe(200);
  });

  const definitionBelle = { couleurs: ['#2a4d8f', '#ffffff', '#101820'], policeTitres: 'playfair', policeSousTitres: 'montserrat', styleSousTitres: 'impact', carteFin: { titre: 'Merci', sousTitre: 'À la semaine prochaine' }, legende: 'Ma semaine', hashtags: ['#batchcooking', '#batchcooking', '#recette'] };

  it('gabarit.creer : autant de gabarits que l’on veut (plus de trois), couleurs normalisées, mots-clics sans doublon, au journal', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await appeler(jetonA, 'gabarit/creer', { espaceId: espaceA, nom: `Série ${i}`, definition: definitionBelle });
      expect(r.statusCode).toBe(200);
      if (i === 0) {
        expect(r.json().donnees.gabarit).toMatchObject({ parDefaut: false, version: 1, definition: { couleurs: ['#2A4D8F', '#FFFFFF', '#101820'], hashtags: ['#batchcooking', '#recette'] } });
        expect(banc.audit.lignes.some((l) => l.action === 'gabarit_creer' && l.objet === `gabarit:${r.json().donnees.gabarit.id}`)).toBe(true);
      }
    }
    expect((await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits.length).toBeGreaterThan(4);
  });

  it('gabarit.creer refuse un espace étranger (404), un contraste trop faible (422, élément et seuil nommés) et une définition mal formée (400)', async () => {
    expect((await appeler(jetonA, 'gabarit/creer', { espaceId: espaceB, nom: 'X', definition: definitionBelle })).statusCode).toBe(404);
    const faible = await appeler(jetonA, 'gabarit/creer', { espaceId: espaceA, nom: 'Pâle', definition: { ...definitionBelle, couleurs: ['#ffffff', '#f0f0f0'] } });
    expect(faible.statusCode).toBe(422);
    expect(faible.json().erreur.message).toMatch(/scene-1-titre.*seuil 4,5:1/);
    expect((await appeler(jetonA, 'gabarit/creer', { espaceId: espaceA, nom: 'X', definition: { ...definitionBelle, couleurs: ['#fff'] } })).statusCode).toBe(400);
    expect((await appeler(jetonA, 'gabarit/creer', { espaceId: espaceA, nom: 'X', definition: { ...definitionBelle, hashtags: ['#a', '#b', '#c', '#d', '#e', '#f'] } })).statusCode).toBe(400);
    expect((await appeler(jetonLecture, 'gabarit/creer', { espaceId: espaceA, nom: 'X', definition: definitionBelle })).statusCode).toBe(403);
  });

  it('gabarit.definir remplace la définition et monte la version ; un autre espace est introuvable ; un enregistrement hors garde est refusé et ne change rien', async () => {
    const cree = (await appeler(jetonA, 'gabarit/creer', { espaceId: espaceA, nom: 'À régler', definition: definitionBelle })).json().donnees.gabarit;
    const r = await appeler(jetonA, 'gabarit/definir', { id: cree.id, nom: 'Réglé', definition: { ...definitionBelle, legende: 'Nouvelle légende' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees.gabarit).toMatchObject({ nom: 'Réglé', version: 2, definition: { legende: 'Nouvelle légende' } });
    expect(banc.audit.lignes.some((l) => l.action === 'gabarit_definir' && l.objet === `gabarit:${cree.id}`)).toBe(true);
    const refus = await appeler(jetonA, 'gabarit/definir', { id: cree.id, definition: { ...definitionBelle, couleurs: ['#ffffff', '#fafafa'] } });
    expect(refus.statusCode).toBe(422);
    expect(refus.json().erreur.contexte.violations[0]).toMatchObject({ code: 'CONTRASTE', seuil: 4.5 });
    const apres = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits.find((g: { id: string }) => g.id === cree.id);
    expect(apres.version).toBe(2);
    const autre = (await appeler(jetonB, 'gabarit/lister')).json().donnees.gabarits[0].id;
    expect((await appeler(jetonA, 'gabarit/definir', { id: autre, definition: definitionBelle })).statusCode).toBe(404);
  });

  it('gabarit.apercu dessine trois scènes sans rien enregistrer, échappe les textes et liste les gardes enfreintes', async () => {
    const avant = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits.length;
    const r = await appeler(jetonA, 'gabarit/apercu', { definition: { ...definitionBelle, carteFin: { titre: '<script>x</script>', sousTitre: 'a & b' } } });
    expect(r.statusCode).toBe(200);
    const { svg, violations } = r.json().donnees;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect((svg.match(/stroke-dasharray/g) ?? []).length).toBe(3);
    expect(violations).toEqual([]);
    expect((await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits.length).toBe(avant);
    const faible = await appeler(jetonA, 'gabarit/apercu', { definition: { ...definitionBelle, couleurs: ['#ffffff', '#fafafa'] } });
    expect(faible.statusCode).toBe(200);
    expect(faible.json().donnees.violations[0]).toMatchObject({ code: 'CONTRASTE' });
    expect(faible.json().donnees.violations[0].phrase).toContain('seuil 4,5:1');
    expect((await app.inject({ method: 'POST', url: '/api/v1/gabarit/apercu', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ definition: definitionBelle }) })).statusCode).toBe(401);
  });

  it('/gabarit/apercu.svg : image SVG pour une session, refus sans session, 400 pour une définition mal formée', async () => {
    const q = new URLSearchParams({ couleurPrincipale: '#2a4d8f', couleurTexte: '#ffffff', couleurFond: '#101820', couleurAccent: '#f2b705', policeTitres: 'bebas', carteFinTitre: 'Fin <b>' }).toString();
    const ok = await app.inject({ method: 'GET', url: `/gabarit/apercu.svg?${q}`, headers: { cookie: cookieA } });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('image/svg+xml');
    expect(ok.headers['content-security-policy']).toContain("default-src 'none'");
    expect(ok.body).toContain('<svg');
    expect(ok.body).not.toContain('<b>');
    expect((await app.inject({ method: 'GET', url: `/gabarit/apercu.svg?${q}` })).statusCode).not.toBe(200);
    expect((await app.inject({ method: 'GET', url: '/gabarit/apercu.svg?couleurPrincipale=rouge', headers: { cookie: cookieA } })).statusCode).toBe(400);
  });

  it('la page crée un gabarit avec les réglages du formulaire et refuse un réglage hors garde en nommant l’élément, la mesure et le seuil', async () => {
    const id = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits[0].id;
    const champs = { id, espaceId: espaceA, nom: 'Départ', couleurPrincipale: '#2a4d8f', couleurTexte: '#ffffff', couleurFond: '#101820', couleurAccent: '#f2b705', policeTitres: 'bebas', policeSousTitres: 'inter', styleSousTitres: 'impact', carteFinTitre: 'Merci', carteFinSousTitre: 'À bientôt', legende: '', hashtags: 'recette #batch' };
    const poster = (corps: Record<string, string>) => app.inject({ method: 'POST', url: '/gabarit', headers: { cookie: cookieA, origin: ORIGINE, 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ ...champs, ...corps }).toString() });
    const cree = await poster({ geste: 'creer', nouveauNom: 'Depuis la page' });
    expect(cree.statusCode).toBe(303);
    const liste = (await appeler(jetonA, 'gabarit/lister')).json().donnees.gabarits;
    expect(liste.find((g: { nom: string }) => g.nom === 'Depuis la page')).toMatchObject({ definition: { policeTitres: 'bebas', hashtags: ['#recette', '#batch'] } });
    const refus = await poster({ geste: 'enregistrer', couleurPrincipale: '#ffd700' });
    expect(refus.statusCode).toBe(200);
    expect(refus.body).toContain('scene-1-titre');
    expect(refus.body).toContain('seuil 4,5:1');
    expect(refus.body).toContain('value="#ffd700"');
  });

  it('le MCP expose les cinq outils du gabarit', async () => {
    const r = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${jetonA}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('gabarit_lister');
    expect(r.body).toContain('gabarit_personnaliser');
    for (const outil of ['gabarit_creer', 'gabarit_definir', 'gabarit_apercu']) expect(r.body).toContain(outil);
  });
});
