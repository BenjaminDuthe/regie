// Histoire 4.4 : liste des scripts de démo et éditeur d'étapes, par l'interface, l'API et le MCP.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
type App = Awaited<ReturnType<typeof construireServeur>>;

describe('script : liste et éditeur d’étapes', () => {
  let app: App;
  let banc: BancDeTest;
  let espaceA: string;
  let jetonA: string;
  let jetonB: string;
  let jetonLecture: string;
  let cookieA: string;
  let applicationId: string;
  let scriptId: string;
  let marqueId: string;
  let utilisateurA: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const lire = async () => (await appeler(jetonA, 'script/lire', { id: scriptId })).json().donnees.script;

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
    espaceA = a.espaces[0]!.id;
    utilisateurA = a.utilisateurId;
    const espaceB = b.espaces[0]!.id;
    const jeton = async (sub: string, utilisateurId: string, espaceIds: string[], portees: ('lecture' | 'ecriture')[]) =>
      (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 'test', portees, espaceIds, dureeJours: 30 })).clair;
    jetonA = await jeton('sub-a', a.utilisateurId, [espaceA], ['lecture', 'ecriture']);
    jetonB = await jeton('sub-b', b.utilisateurId, [espaceB], ['lecture', 'ecriture']);
    jetonLecture = await jeton('sub-a', a.utilisateurId, [espaceA], ['lecture']);
    cookieA = `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(), espaceActifId: espaceA })}`;
    app = await construireServeur({ services: banc.services });
    const decl = await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Démo Établia', accueil: 'https://demo.etablia.fr/', hotes: ['demo.etablia.fr', 'cdn.etablia.fr'] });
    applicationId = decl.json().donnees.application.id;
  });
  afterAll(async () => app?.close());

  it('crée un script avec ses étapes (origine Claude par défaut), au journal', async () => {
    const r = await appeler(jetonA, 'script/creer', {
      applicationId,
      nom: 'Parcours recette',
      etapes: [{ verbe: 'aller', url: 'https://demo.etablia.fr/recettes' }, { verbe: 'cliquer', cible: 'Nouvelle recette' }, { verbe: 'pause', secondes: 1.5 }],
    });
    expect(r.statusCode).toBe(200);
    const s = r.json().donnees.script;
    scriptId = s.id;
    expect(s).toMatchObject({ nom: 'Parcours recette', origine: 'claude', version: 1, dernierJeu: null });
    expect(s.etapes).toHaveLength(3);
    expect(banc.audit.lignes.some((l) => l.action === 'script_creer' && l.objet === `script:${s.id}`)).toBe(true);
    const liste = (await appeler(jetonA, 'script/lister')).json().donnees.scripts;
    expect(liste).toHaveLength(1);
    expect((await appeler(jetonB, 'script/lister')).json().donnees.scripts).toHaveLength(0);
  });

  it('un nom déjà pris pour cette application : 409', async () => {
    const r = await appeler(jetonA, 'script/creer', { applicationId, nom: 'Parcours recette' });
    expect(r.statusCode).toBe(409);
    expect(r.json().erreur.code).toBe('SCRIPT_NOM_PRIS');
  });

  it('ajoute à la fin puis à une position ; monte, descend, retire ; la version monte à chaque geste', async () => {
    let v = (await lire()).version;
    let r = await appeler(jetonA, 'script/ajouteretape', { id: scriptId, version: v, etape: { verbe: 'narration', texte: 'Voici la recette' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees.script.version).toBe(v + 1);
    v += 1;
    r = await appeler(jetonA, 'script/ajouteretape', { id: scriptId, version: v, position: 1, etape: { verbe: 'attendre', cible: 'Accueil' } });
    v += 1;
    expect((await lire()).etapes.map((e: { verbe: string }) => e.verbe)).toEqual(['attendre', 'aller', 'cliquer', 'pause', 'narration']);
    r = await appeler(jetonA, 'script/deplaceretape', { id: scriptId, version: v, position: 5, sens: 'monter' });
    v += 1;
    expect((await lire()).etapes.map((e: { verbe: string }) => e.verbe)).toEqual(['attendre', 'aller', 'cliquer', 'narration', 'pause']);
    r = await appeler(jetonA, 'script/deplaceretape', { id: scriptId, version: v, position: 1, sens: 'descendre' });
    v += 1;
    expect((await lire()).etapes[0].verbe).toBe('aller');
    r = await appeler(jetonA, 'script/retireretape', { id: scriptId, version: v, position: 2 });
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees.retiree).toEqual({ verbe: 'attendre', cible: 'Accueil' });
    v += 1;
    // « Annuler » remet l'étape retirée à sa place.
    r = await appeler(jetonA, 'script/ajouteretape', { id: scriptId, version: v, position: 2, etape: r.json().donnees.retiree });
    expect(r.statusCode).toBe(200);
    expect((await lire()).etapes[1]).toEqual({ verbe: 'attendre', cible: 'Accueil' });
    expect(banc.audit.lignes.filter((l) => l.action === 'script_retireretape')).toHaveLength(1);
  });

  it('une version périmée est refusée (409) et ne change rien', async () => {
    const avant = await lire();
    const r = await appeler(jetonA, 'script/retireretape', { id: scriptId, version: avant.version - 1, position: 1 });
    expect(r.statusCode).toBe(409);
    expect(r.json().erreur.code).toBe('SCRIPT_VERSION_PERIMEE');
    expect((await lire()).etapes).toHaveLength(avant.etapes.length);
  });

  it('une étape vers un hôte non déclaré est refusée en nommant l’hôte, par chaque action', async () => {
    const v = (await lire()).version;
    const cas: [string, Record<string, unknown>][] = [
      ['script/ajouteretape', { id: scriptId, version: v, etape: { verbe: 'aller', url: 'https://pistage.exemple.com/x' } }],
      ['script/modifieretape', { id: scriptId, version: v, position: 1, etape: { verbe: 'aller', url: 'https://pistage.exemple.com/x' } }],
      ['script/creer', { applicationId, nom: 'Autre', etapes: [{ verbe: 'aller', url: 'https://pistage.exemple.com/x' }] }],
    ];
    for (const [chemin, corps] of cas) {
      const r = await appeler(jetonA, chemin, corps);
      expect(r.statusCode, chemin).toBe(422);
      expect(r.json().erreur.code).toBe('SCRIPT_HOTE_REFUSE');
      expect(r.json().erreur.message).toContain('pistage.exemple.com');
    }
    expect((await lire()).version).toBe(v);
  });

  it('une étape invalide est refusée en nommant son numéro, son verbe et la cause', async () => {
    const r = await appeler(jetonA, 'script/creer', { applicationId, nom: 'Cassé', etapes: [{ verbe: 'aller', url: 'https://demo.etablia.fr/' }, { verbe: 'cliquer' }, { verbe: 'danser' }] });
    expect(r.statusCode).toBe(422);
    expect(r.json().erreur.code).toBe('SCRIPT_ETAPE_INVALIDE');
    expect(r.json().erreur.message).toMatch(/Étape 2/);
    const seule = await appeler(jetonA, 'script/ajouteretape', { id: scriptId, version: (await lire()).version, etape: { verbe: 'saisir', cible: 'Nom' } });
    expect(seule.statusCode).toBe(422);
    expect(seule.json().erreur.code).toBe('SCRIPT_ETAPE_INVALIDE');
  });

  it('refuse un tournage incohérent et une position hors du script (404)', async () => {
    const v = (await lire()).version;
    const double = await appeler(jetonA, 'script/definir', { id: scriptId, version: v, nom: 'Parcours recette', etapes: [{ verbe: 'filmer', mode: 'demarrer' }, { verbe: 'filmer', mode: 'demarrer' }] });
    expect(double.statusCode).toBe(422);
    const hors = await appeler(jetonA, 'script/retireretape', { id: scriptId, version: v, position: 99 });
    expect(hors.statusCode).toBe(404);
    expect(hors.json().erreur.code).toBe('SCRIPT_ETAPE_INTROUVABLE');
  });

  it('un geste remet à vide le dernier jeu ; le jeu en échec rend la cause non fiable et jamais la capture', async () => {
    await banc.scripts.enregistrerJeu(marqueId, utilisateurA, scriptId, { etat: 'echec', etape: 2, cause: 'Élément introuvable : « Nouvelle recette »', capture: 'AAAA', jouLe: new Date().toISOString() });
    const s = await lire();
    expect(s.dernierJeu).toMatchObject({ etat: 'echec', etape: 2, captureDisponible: true });
    expect(JSON.stringify(s)).not.toContain('AAAA');
    expect(JSON.stringify(s.dernierJeu.cause)).toContain('non_fiable');
    await appeler(jetonA, 'script/ajouteretape', { id: scriptId, version: s.version, etape: { verbe: 'pause', secondes: 1 } });
    expect((await lire()).dernierJeu).toBeNull();
  });

  it('droits : espace étranger 404, jeton en lecture 403, sans jeton 401, champ inconnu 400', async () => {
    expect((await appeler(jetonB, 'script/lire', { id: scriptId })).statusCode).toBe(404);
    expect((await appeler(jetonB, 'script/creer', { applicationId, nom: 'Intrus' })).statusCode).toBe(404);
    expect((await appeler(jetonLecture, 'script/creer', { applicationId, nom: 'Lecture' })).statusCode).toBe(403);
    expect((await appeler(jetonLecture, 'script/lister')).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/script/lister', headers: { 'content-type': 'application/json' }, payload: '{}' })).statusCode).toBe(401);
    expect((await appeler(jetonA, 'script/lire', { id: scriptId, extra: 1 })).statusCode).toBe(400);
  });

  it('la page liste les scripts avec origine et état du dernier jeu, ouvre l’éditeur et le pilote par les mêmes actions', async () => {
    const liste = await app.inject({ method: 'GET', url: '/scripts', headers: { cookie: cookieA } });
    expect(liste.statusCode).toBe(200);
    expect(liste.body).toContain('Parcours recette');
    expect(liste.body).toContain('Écrit par Claude');
    expect(liste.body).toContain('Jamais joué');
    const editeur = await app.inject({ method: 'GET', url: `/scripts?id=${scriptId}`, headers: { cookie: cookieA } });
    expect(editeur.statusCode).toBe(200);
    expect(editeur.body).toContain('Nouvelle recette');
    expect(editeur.body).toContain('demo.etablia.fr');
    const poster = (corps: Record<string, string>, entetes: Record<string, string> = { origin: ORIGINE }) =>
      app.inject({ method: 'POST', url: '/scripts', headers: { cookie: cookieA, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });
    let v = (await lire()).version;
    const monte = await poster({ geste: 'monter', id: scriptId, version: String(v), position: '2' });
    expect(monte.statusCode).toBe(303);
    v += 1;
    const refus = await poster({ geste: 'ajouter', id: scriptId, version: String(v), verbe: 'aller', url: 'https://pistage.exemple.com/' });
    expect(refus.statusCode).toBe(200);
    expect(refus.body).toContain('pistage.exemple.com');
    const retire = await poster({ geste: 'retirer', id: scriptId, version: String(v), position: '1' });
    expect(retire.statusCode).toBe(303);
    const cookieRetrait = String(retire.headers['set-cookie']);
    expect(cookieRetrait).toContain('regie_etape_retiree=');
    const apres = await app.inject({ method: 'GET', url: `/scripts?id=${scriptId}`, headers: { cookie: `${cookieA}; ${cookieRetrait.split(';')[0]}` } });
    expect(apres.body).toContain('Annuler');
    expect((await poster({ geste: 'monter', id: scriptId, version: '1', position: '1' }, {})).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/scripts' })).statusCode).not.toBe(200);
  });

  it('l’étape en panne est mise en avant avec sa capture et les actions « Viser le … » et « Retirer l’étape »', async () => {
    const s = await lire();
    await banc.scripts.enregistrerJeu(marqueId, utilisateurA, scriptId, { etat: 'echec', etape: 2, cause: 'Élément introuvable', capture: 'iVBORw0KGgo=', jouLe: new Date().toISOString() });
    const page = await app.inject({ method: 'GET', url: `/scripts?id=${scriptId}`, headers: { cookie: cookieA } });
    expect(page.body).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(page.body).toContain('etape-panne');
    expect(page.body).toContain('Retirer l’étape');
    expect(page.body).toMatch(/Viser le/);
    const liste = await app.inject({ method: 'GET', url: '/scripts', headers: { cookie: cookieA } });
    expect(liste.body).toContain('Échec à l’étape 2');
    expect(s.version).toBeGreaterThan(0);
  });

  it('le MCP expose les huit outils script_*', async () => {
    const r = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${jetonA}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    expect(r.statusCode).toBe(200);
    for (const o of ['script_lister', 'script_lire', 'script_creer', 'script_definir', 'script_ajouteretape', 'script_deplaceretape', 'script_retireretape', 'script_modifieretape']) expect(r.body).toContain(o);
  });
});
