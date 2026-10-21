// Histoire 4.5 : jeu d'un script (action script.jouer, exécutant, journal en direct, flux SSE). Aucun navigateur, aucune base.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DernierJeu, EtapeScript } from '@regie/contrats';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import type { Application, Applications } from '../src/infra/applications.ts';
import { serialiserCompte } from '../src/infra/comptes-demo.ts';
import type { Tache } from '../src/infra/file.ts';
import type { Script, Scripts } from '../src/infra/scripts.ts';
import { construireServeur } from '../src/serveur.ts';
import { MATRICE_SECRETS } from '../src/services/passerelle-secrets.ts';
import type { DemandeLanceur, LanceurCapture } from '../src/services/capture.ts';
import { creerExecutantJeuScript } from '../src/services/jeu-script.ts';
import { ENTREES_MAX_PAR_JEU, JournauxJeu, type EntreeJournalJeu } from '../src/services/journaux-jeu.ts';
import { ErreurTache } from '../src/services/travailleur.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const MOT_DE_PASSE = 'M0t-de-passe-TRES-secret';
const ID_APP = '4f2f4d3a-3a0f-4b1b-9e11-0c2f9b5f7a10';
const ID_SCRIPT = '0b1c2d3e-4f50-4162-8374-95a6b7c8d9e0';
const png = Buffer.from([137, 80, 78, 71]).toString('base64');

describe('journaux de jeu', () => {
  const entree = (t: number): EntreeJournalJeu => ({ t, etape: 1, genre: 'clic', cible: 'Valider', x: 500, y: 300 });
  it('garde les entrées par marque, rejoue aux nouveaux abonnés et prévient les abonnés', () => {
    const j = new JournauxJeu();
    const vues: EntreeJournalJeu[] = [];
    const arret = j.abonner('m', 't1', (e) => vues.push(e));
    j.publier('m', 't1', entree(1));
    expect(vues).toHaveLength(1);
    expect(j.lire('m', 't1')).toHaveLength(1);
    arret();
    j.publier('m', 't1', entree(2));
    expect(vues).toHaveLength(1);
    expect(j.lire('m', 't1')).toHaveLength(2);
  });
  it('n’ouvre rien à une autre marque : lecture vide, publication ignorée, abonnement muet', () => {
    const j = new JournauxJeu();
    j.publier('m', 't1', entree(1));
    expect(j.lire('autre', 't1')).toEqual([]);
    const vues: EntreeJournalJeu[] = [];
    j.abonner('autre', 't1', (e) => vues.push(e));
    j.publier('autre', 't1', entree(2));
    j.publier('m', 't1', entree(3));
    expect(vues).toEqual([]);
    expect(j.lire('m', 't1')).toHaveLength(2);
  });
  it('borne le nombre d’entrées par jeu', () => {
    const j = new JournauxJeu();
    for (let i = 0; i < ENTREES_MAX_PAR_JEU + 20; i += 1) j.publier('m', 't1', entree(i));
    expect(j.lire('m', 't1')).toHaveLength(ENTREES_MAX_PAR_JEU);
  });
  it('oublie les jeux anciens et sans abonné', () => {
    const t = { v: 0 };
    const j = new JournauxJeu(() => t.v);
    j.publier('m', 'vieux', entree(1));
    t.v += 2 * 60 * 60_000;
    j.publier('m', 'neuf', entree(1));
    expect(j.lire('m', 'vieux')).toEqual([]);
    expect(j.lire('m', 'neuf')).toHaveLength(1);
  });
});

describe('exécutant du jeu de script', () => {
  const application: Application = { id: ID_APP, espaceId: 'e', nom: 'Démo', accueil: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr'], version: 1, creeLe: new Date(), modifieLe: new Date() };
  const applications = (a: Application | undefined): Applications => ({ lister: async () => [], lire: async (_m, _u, id) => (id === ID_APP ? a : undefined), creer: async () => undefined, remplacer: async () => undefined });
  const tache = { id: 'tache-1', marqueId: 'm', utilisateurId: 'u', type: 'jeu_script', entree: { scriptId: ID_SCRIPT } } as unknown as Tache;
  const aide = { signal: new AbortController().signal, pointDeNonRetour: async () => undefined };
  const etapesPar: EtapeScript[] = [{ verbe: 'aller', url: 'https://demo.exemple.fr/recettes' }, { verbe: 'cliquer', cible: 'Nouvelle recette' }];

  function banc(options: { sortie?: string | Error; lignes?: string[]; etapes?: EtapeScript[]; script?: boolean; version?: number; clair?: string | null; app?: Application | null } = {}) {
    const jeux: { jeu: DernierJeu; version: number | undefined }[] = [];
    const script = { id: ID_SCRIPT, applicationId: ID_APP, etapes: options.etapes ?? etapesPar, version: 3 } as unknown as Script;
    const scripts = {
      lire: async () => (options.script === false ? undefined : script),
      enregistrerJeu: async (_m: string, _u: string, _id: string, jeu: DernierJeu, version?: number) => (jeux.push({ jeu, version }), (options.version ?? 3) === version),
    } as unknown as Scripts;
    const vus: DemandeLanceur[] = [];
    const lanceur: LanceurCapture = {
      lancer: async (d) => {
        vus.push(d);
        for (const l of options.lignes ?? []) d.surLigne?.(l);
        if (options.sortie instanceof Error) throw options.sortie;
        return options.sortie ?? '';
      },
    };
    const journaux = new JournauxJeu();
    const clair = options.clair === undefined ? serialiserCompte({ identifiant: 'demo@exemple.fr', motDePasse: MOT_DE_PASSE }) : options.clair;
    const executant = creerExecutantJeuScript({
      applications: applications(options.app === null ? undefined : (options.app ?? application)),
      scripts,
      passerelle: { lire: async () => clair ?? undefined } as never,
      lanceur,
      journaux,
      cle: randomBytes(32),
      proxy: '10.89.77.2:3128',
    });
    return { jeux, vus, journaux, executant };
  }
  const echec = async (p: Promise<unknown>) => (await p.then(() => undefined, (e: unknown) => e)) as ErreurTache;
  const ok = (extra: object = {}) => `${JSON.stringify({ ok: true, dureeMs: 4200, etapes: 2, hote: 'demo.exemple.fr', ...extra })}\n`;

  it('réussite : envoie le script au conteneur, écrit « réussi » pour la version jouée, pousse le journal', async () => {
    const ligne = JSON.stringify({ journal: { t: 120, etape: 2, genre: 'clic', cible: 'Nouvelle recette', x: 410, y: 220 } });
    const b = banc({ sortie: `${ligne}\n${ok({ video: { octets: 1234 } })}`, lignes: [ligne, 'pas du json', JSON.stringify({ journal: { t: 1, genre: 'inconnu' } })] });
    const r = await b.executant.executer(tache, aide);
    expect(r).toEqual({ dureeMs: 4200, etapes: 2, hote: 'demo.exemple.fr', video: { octets: 1234 } });
    expect(b.jeux).toHaveLength(1);
    expect(b.jeux[0]).toMatchObject({ jeu: { etat: 'reussi' }, version: 3 });
    const demande = JSON.parse(b.vus[0]!.entree);
    expect(demande).toMatchObject({ mode: 'jeu', url: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr'], etapes: etapesPar });
    expect(demande.compte).toBeUndefined();
    expect(b.journaux.lire('m', 'tache-1')).toEqual([{ t: 120, etape: 2, genre: 'clic', cible: 'Nouvelle recette', x: 410, y: 220 }]);
  });
  it('un script qui se connecte reçoit le compte, sans qu’il passe au journal ni dans le nom du conteneur', async () => {
    const ligne = JSON.stringify({ journal: { t: 1, etape: 1, genre: 'saisie', cible: MOT_DE_PASSE } });
    const b = banc({ etapes: [{ verbe: 'connexion' }], sortie: ok(), lignes: [ligne] });
    await b.executant.executer(tache, aide);
    expect(JSON.parse(b.vus[0]!.entree).compte).toEqual({ identifiant: 'demo@exemple.fr', motDePasse: MOT_DE_PASSE });
    expect(b.vus[0]!.nom).not.toContain(MOT_DE_PASSE);
    expect(b.journaux.lire('m', 'tache-1')).toEqual([]);
  });
  it('navigation hors liste : le jeu s’arrête, l’hôte refusé est tracé, aucun nouvel essai', async () => {
    const b = banc({ sortie: `${JSON.stringify({ ok: false, cause: 'HOTE_REFUSE', etape: 2, hote: 'pirate.example.net' })}\n` });
    const e = await echec(b.executant.executer(tache, aide));
    expect(e.cause_).toBe('HOTE_REFUSE');
    expect(e.reessayer).toBe(false);
    expect(b.jeux[0]!.jeu).toMatchObject({ etat: 'hote_refuse', hote: 'pirate.example.net', etape: 2 });
  });
  it('une étape vers un hôte retiré de la liste est refusée avant de lancer un navigateur', async () => {
    const b = banc({ etapes: [{ verbe: 'aller', url: 'https://autre.exemple.net/' }] });
    expect((await echec(b.executant.executer(tache, aide))).cause_).toBe('HOTE_REFUSE');
    expect(b.vus).toEqual([]);
    expect(b.jeux[0]!.jeu).toMatchObject({ etat: 'hote_refuse', hote: 'autre.exemple.net', etape: 1 });
  });
  it('un rendu d’hôte hors liste à la fin du jeu est refusé', async () => {
    const b = banc({ sortie: ok({ hote: 'hors.exemple.net' }) });
    expect((await echec(b.executant.executer(tache, aide))).cause_).toBe('HOTE_REFUSE');
    expect(b.jeux[0]!.jeu).toMatchObject({ etat: 'hote_refuse', hote: 'hors.exemple.net' });
  });
  it('échec d’étape : écrit l’étape et la capture, sans nouvel essai ; la cause est une phrase de regie', async () => {
    const b = banc({ sortie: `${JSON.stringify({ ok: false, cause: 'ETAPE_ECHEC', etape: 2, capture: png })}\n` });
    const e = await echec(b.executant.executer(tache, aide));
    expect(e.cause_).toBe('ETAPE_ECHEC');
    expect(e.reessayer).toBe(false);
    expect(b.jeux[0]!.jeu).toMatchObject({ etat: 'echec', etape: 2, capture: png });
    expect((b.jeux[0]!.jeu as { cause: string }).cause).toContain('L’étape n’a pas pu être jouée');
  });
  it('échec de connexion : nomme l’étape, jamais de capture', async () => {
    const b = banc({ etapes: [{ verbe: 'connexion' }], sortie: `${JSON.stringify({ ok: false, cause: 'CONNEXION_ECHEC', etape: 1, etapeConnexion: 'valider', capture: png })}\n` });
    await echec(b.executant.executer(tache, aide));
    const jeu = b.jeux[0]!.jeu as { etat: string; capture?: string; cause: string };
    expect(jeu.etat).toBe('echec');
    expect(jeu.capture).toBeUndefined();
    expect(jeu.cause).toContain('valider la connexion');
  });
  it('version périmée : le résultat n’est pas écrit sur un script modifié depuis', async () => {
    const b = banc({ sortie: ok(), version: 4 });
    await b.executant.executer(tache, aide);
    expect(b.jeux[0]!.version).toBe(3);
  });
  it('sortie illisible, hors schéma ou citant le mot de passe : CAPTURE_ECHEC', async () => {
    expect((await echec(banc({ sortie: 'pas du json' }).executant.executer(tache, aide))).cause_).toBe('CAPTURE_ECHEC');
    expect((await echec(banc({ sortie: '{"ok":true,"dureeMs":"x"}' }).executant.executer(tache, aide))).cause_).toBe('CAPTURE_ECHEC');
    const fuite = banc({ etapes: [{ verbe: 'connexion' }], sortie: `{"ok":false,"cause":"CAPTURE_ECHEC","etape":1,"note":"${MOT_DE_PASSE}"}` });
    expect((await echec(fuite.executant.executer(tache, aide))).cause_).toBe('CAPTURE_ECHEC');
  });
  it('conteneur en échec : CAPTURE_ECHEC, relançable', async () => {
    const e = await echec(banc({ sortie: new Error('SORTIE_1') }).executant.executer(tache, aide));
    expect(e.cause_).toBe('CAPTURE_ECHEC');
    expect(e.reessayer).toBe(true);
  });
  it('compte absent, script ou application introuvable, entrée invalide : échec sans lancer de conteneur', async () => {
    const sans = banc({ etapes: [{ verbe: 'connexion' }], clair: null });
    expect((await echec(sans.executant.executer(tache, aide))).cause_).toBe('COMPTE_ABSENT');
    expect((await echec(banc({ script: false }).executant.executer(tache, aide))).cause_).toBe('SCRIPT_INTROUVABLE');
    expect((await echec(banc({ app: null }).executant.executer(tache, aide))).cause_).toBe('APPLICATION_INTROUVABLE');
    const b = banc();
    expect((await echec(b.executant.executer({ ...tache, entree: { scriptId: 'x' } } as Tache, aide))).cause_).toBe('ENTREE_INVALIDE');
    expect(sans.vus.concat(b.vus)).toEqual([]);
  });
});

describe('matrice de secrets du jeu', () => {
  it('la matrice de secrets donne le compte de démo au jeu de script et à lui seul parmi les nouvelles tâches', () => {
    expect(MATRICE_SECRETS['jeu_script']).toEqual(['compte_demo']);
    expect(MATRICE_SECRETS['capture']).toBeUndefined();
  });
});

describe('script.jouer et flux en direct', () => {
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let banc: BancDeTest;
  let marqueId: string;
  let espaceA: string;
  let applicationId: string;
  let jetonA: string;
  let jetonB: string;
  let jetonLecture: string;
  let cookieA: string;
  let cookieB: string;
  let utilisateurA: string;
  let scriptId: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const adresse = () => `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

  async function lireFlux(chemin: string, cookie: string | undefined, suffisant: (texte: string) => boolean) {
    const controle = new AbortController();
    const r = await fetch(`${adresse()}${chemin}`, { headers: cookie === undefined ? {} : { cookie }, signal: controle.signal });
    let texte = '';
    if (r.status === 200) {
      const lecteur = r.body!.getReader();
      const fin = Date.now() + 3000;
      try {
        while (Date.now() < fin && !suffisant(texte)) {
          const { value, done } = await lecteur.read();
          if (done) break;
          texte += new TextDecoder().decode(value);
        }
      } finally {
        controle.abort();
      }
    } else {
      await r.text();
    }
    return { statut: r.status, entetes: r.headers, texte };
  }

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
    espaceA = a.espaces[0]!.id;
    utilisateurA = a.utilisateurId;
    const jeton = async (sub: string, utilisateurId: string, espaceIds: string[], portees: ('lecture' | 'ecriture')[]) =>
      (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 'test', portees, espaceIds, dureeJours: 30 })).clair;
    jetonA = await jeton('sub-a', a.utilisateurId, [espaceA], ['lecture', 'ecriture']);
    jetonB = await jeton('sub-b', b.utilisateurId, [b.espaces[0]!.id], ['lecture', 'ecriture']);
    jetonLecture = await jeton('sub-a', a.utilisateurId, [espaceA], ['lecture']);
    cookieA = `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(), espaceActifId: espaceA })}`;
    cookieB = `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub: 'sub-b', email: undefined, authentifieLe: new Date(), espaceActifId: b.espaces[0]!.id })}`;
    app = await construireServeur({ services: banc.services, flux: { intervalleMs: 40, battementMs: 60, dureeMaxMs: 60_000, maxParPersonne: 2 } });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const decl = await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Démo Établia', accueil: 'https://demo.etablia.fr/', hotes: ['demo.etablia.fr'] });
    applicationId = decl.json().donnees.application.id;
  });
  afterAll(async () => app?.close());

  const creerScript = async (nom: string, etapes: unknown[]) => (await appeler(jetonA, 'script/creer', { applicationId, nom, etapes })).json().donnees.script.id as string;

  it('script.jouer enfile une tâche jeu_script et rend de quoi la suivre ; au journal', async () => {
    scriptId = await creerScript('Parcours', [{ verbe: 'aller', url: 'https://demo.etablia.fr/recettes' }, { verbe: 'cliquer', cible: 'Nouvelle recette' }]);
    const r = await appeler(jetonA, 'script/jouer', { id: scriptId });
    expect(r.statusCode).toBe(200);
    const d = r.json().donnees as { tacheId: string; scriptId: string; version: number };
    expect(d).toMatchObject({ scriptId, version: 1 });
    const tache = banc.file.taches.find((t) => t.id === d.tacheId)!;
    expect(tache).toMatchObject({ type: 'jeu_script', utilisateurId: utilisateurA, entree: { scriptId } });
    expect(banc.audit.lignes.some((l) => l.action === 'script_jouer' && l.objet === `script:${scriptId}`)).toBe(true);
    expect(JSON.stringify(r.json())).not.toContain('motDePasse');
  });
  it('refuse un script sans étape, un script d’un autre, une lecture seule, un jeton absent', async () => {
    const vide = await creerScript('Vide', []);
    const r = await appeler(jetonA, 'script/jouer', { id: vide });
    expect(r.statusCode).toBe(422);
    expect(r.json().erreur.code).toBe('SCRIPT_SANS_ETAPE');
    expect((await appeler(jetonB, 'script/jouer', { id: scriptId })).statusCode).toBe(404);
    expect((await appeler(jetonLecture, 'script/jouer', { id: scriptId })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/script/jouer', headers: { 'content-type': 'application/json' }, payload: '{}' })).statusCode).toBe(401);
    expect((await appeler(jetonA, 'script/jouer', { id: 'x' })).statusCode).toBe(400);
  });
  it('refuse un script dont l’hôte a quitté la liste depuis son écriture', async () => {
    const idApp = (await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Mobile', accueil: 'https://m.exemple.fr/', hotes: ['m.exemple.fr'] })).json().donnees.application.id as string;
    const id = (await appeler(jetonA, 'script/creer', { applicationId: idApp, nom: 'Hôte', etapes: [{ verbe: 'aller', url: 'https://m.exemple.fr/' }] })).json().donnees.script.id as string;
    expect((await appeler(jetonA, 'application/modifier', { id: idApp, nom: 'Mobile', accueil: 'https://www.exemple.fr/', hotes: ['www.exemple.fr'] })).statusCode).toBe(200);
    const r = await appeler(jetonA, 'script/jouer', { id });
    expect(r.statusCode).toBe(422);
    expect(r.json().erreur.code).toBe('SCRIPT_HOTE_REFUSE');
  });
  it('un script qui se connecte exige un compte déposé : COMPTE_ABSENT', async () => {
    const app2 = await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Autre', accueil: 'https://autre.exemple.fr/', hotes: ['autre.exemple.fr'] });
    const idApp = app2.json().donnees.application.id as string;
    const s = (await appeler(jetonA, 'script/creer', { applicationId: idApp, nom: 'Connecté', etapes: [{ verbe: 'connexion' }] })).json().donnees.script.id as string;
    const r = await appeler(jetonA, 'script/jouer', { id: s });
    expect(r.statusCode).toBe(409);
    expect(r.json().erreur.code).toBe('COMPTE_ABSENT');
  });
  it('script.jouer est exposé par l’API et par le MCP, avec un schéma d’entrée', async () => {
    const r = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${jetonA}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    expect(r.body).toContain('script_jouer');
  });

  it('le flux /flux/jeu exige une session, une tâche valide et une tâche de jeu à soi', async () => {
    expect((await lireFlux('/flux/jeu?tache=00000000-0000-4000-8000-000000000000', undefined, () => true)).statut).toBe(401);
    expect((await lireFlux('/flux/jeu?tache=pas-un-uuid', cookieA, () => true)).statut).toBe(400);
    expect((await lireFlux('/flux/jeu', cookieA, () => true)).statut).toBe(400);
    expect((await lireFlux('/flux/jeu?tache=00000000-0000-4000-8000-000000000000', cookieA, () => true)).statut).toBe(404);
    const t = (await appeler(jetonA, 'script/jouer', { id: scriptId })).json().donnees.tacheId as string;
    expect((await lireFlux(`/flux/jeu?tache=${t}`, cookieB, () => true)).statut).toBe(404);
    const autre = await banc.file.enfiler(marqueId, utilisateurA, 'rendu', {});
    expect((await lireFlux(`/flux/jeu?tache=${autre.id}`, cookieA, () => true)).statut).toBe(404);
  });
  it('rejoue le journal déjà écrit, pousse les entrées suivantes et annonce la fin avec l’heure estimée', async () => {
    const t = (await appeler(jetonA, 'script/jouer', { id: scriptId })).json().donnees.tacheId as string;
    banc.journauxJeu.publier(marqueId, t, { t: 5, etape: 0, genre: 'navigation', cible: 'demo.etablia.fr' });
    const lecture = lireFlux(`/flux/jeu?tache=${t}`, cookieA, (x) => x.includes('event: fin'));
    await new Promise((r) => setTimeout(r, 150));
    banc.journauxJeu.publier(marqueId, t, { t: 900, etape: 2, genre: 'clic', cible: 'Nouvelle recette', x: 410, y: 220 });
    await new Promise((r) => setTimeout(r, 100));
    // La tâche se termine, le jeu est écrit : le flux annonce la fin et se ferme.
    for (let i = 0; i < 50; i += 1) {
      const prise = await banc.file.prendre(marqueId, 'svc');
      if (prise === undefined) break;
      await banc.file.terminer(marqueId, prise.id, 'svc', {});
      if (prise.id === t) break;
    }
    await banc.scripts.enregistrerJeu(marqueId, utilisateurA, scriptId, { etat: 'reussi', jouLe: new Date().toISOString() });
    const r = await lecture;
    expect(r.statut).toBe(200);
    expect(r.entetes.get('content-type')).toContain('text/event-stream');
    expect(r.entetes.get('cache-control')).toBe('no-store');
    expect(r.texte.indexOf('event: journal')).toBeGreaterThanOrEqual(0);
    expect(r.texte).toContain('"genre":"navigation"');
    expect(r.texte).toContain('"genre":"clic"');
    expect(r.texte).toContain('event: etat');
    const fin = /event: fin\ndata: (.*)\n/.exec(r.texte);
    expect(fin).not.toBeNull();
    expect(JSON.parse(fin![1]!)).toMatchObject({ etat: 'terminee', jeu: { etat: 'reussi' } });
    expect(JSON.parse(fin![1]!).pretVers).toMatch(/^vers \d{1,2} h/);
    expect(r.texte).not.toContain('motDePasse');
  });
  it('un jeu en échec ne promet pas d’heure et dit où il s’est arrêté', async () => {
    const t = (await appeler(jetonA, 'script/jouer', { id: scriptId })).json().donnees.tacheId as string;
    for (let i = 0; i < 50; i += 1) {
      const prise = await banc.file.prendre(marqueId, 'svc');
      if (prise === undefined) break;
      if (prise.id === t) {
        await banc.file.echouer(marqueId, prise.id, 'svc', 'ETAPE_ECHEC', 'verifier', false);
        break;
      }
      await banc.file.terminer(marqueId, prise.id, 'svc', {});
    }
    await banc.scripts.enregistrerJeu(marqueId, utilisateurA, scriptId, { etat: 'echec', etape: 2, cause: 'L’étape n’a pas pu être jouée', jouLe: new Date().toISOString() });
    const r = await lireFlux(`/flux/jeu?tache=${t}`, cookieA, (x) => x.includes('event: fin'));
    const fin = JSON.parse(/event: fin\ndata: (.*)\n/.exec(r.texte)![1]!);
    expect(fin).toMatchObject({ etat: 'echouee', pretVers: null, jeu: { etat: 'echec', etape: 2 } });
  });
});
