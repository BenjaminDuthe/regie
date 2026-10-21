// Histoire 4.3 : compte de démo au coffre, passerelle de secrets, test de connexion. Aucun navigateur, aucune base.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import type { Application, Applications } from '../src/infra/applications.ts';
import { TYPE_SECRET_COMPTE_DEMO, lireCompteSerialise, nomSecretCompteDemo, serialiserCompte } from '../src/infra/comptes-demo.ts';
import type { Tache } from '../src/infra/file.ts';
import { construireServeur } from '../src/serveur.ts';
import { ACTIONS } from '../src/services/actions.ts';
import { EXCEPTIONS_PARITE } from '../src/services/exceptions-parite.ts';
import { actionsExposees } from '../src/services/parite.ts';
import { MATRICE_SECRETS, PasserelleSecretsCoffre, SecretRefuse } from '../src/services/passerelle-secrets.ts';
import type { DemandeLanceur, LanceurCapture } from '../src/services/capture.ts';
import { ETAPES_CONNEXION, causeEtape, creerExecutantTestConnexion } from '../src/services/test-connexion.ts';
import { ErreurTache } from '../src/services/travailleur.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';
import { FileMemoire } from './faux-file.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const MOT_DE_PASSE = 'M0t-de-passe-TRES-secret';
const ID_APP = '4f2f4d3a-3a0f-4b1b-9e11-0c2f9b5f7a10';

describe('passerelle de secrets', () => {
  async function banc() {
    const file = new FileMemoire();
    const t = { v: 1_000_000 };
    file.maintenant = () => t.v;
    const lus: string[] = [];
    const passerelle = new PasserelleSecretsCoffre({ file, service: 'coeur-1', lecteur: async (m, type, nom) => (lus.push(`${m}/${type}/${nom}`), 'clair'), maintenant: () => t.v });
    const enfilee = await file.enfiler('m', 'u', 'test_connexion', { applicationId: ID_APP });
    return { file, t, lus, passerelle, enfilee };
  }

  it('lit le secret pour une tâche en cours sous son identité et son bail, selon la matrice', async () => {
    const b = await banc();
    const prise = (await b.file.prendre('m', 'coeur-1'))!;
    expect(await b.passerelle.lire(prise, TYPE_SECRET_COMPTE_DEMO, 'application:x')).toBe('clair');
    expect(b.lus).toEqual(['m/compte_demo/application:x']);
  });
  it('refuse un type de secret hors matrice et un type de tâche inconnu', async () => {
    const b = await banc();
    const prise = (await b.file.prendre('m', 'coeur-1'))!;
    await expect(b.passerelle.lire(prise, 'cle_reseau', 'n')).rejects.toMatchObject({ raison: 'MATRICE' });
    await expect(b.passerelle.lire({ ...prise, type: 'capture' }, TYPE_SECRET_COMPTE_DEMO, 'n')).rejects.toBeInstanceOf(SecretRefuse);
    expect(MATRICE_SECRETS['capture']).toBeUndefined();
    expect(b.lus).toEqual([]);
  });
  it('refuse une tâche non prise, prise par un autre service, terminée ou au bail expiré', async () => {
    const b = await banc();
    await expect(b.passerelle.lire(b.enfilee, TYPE_SECRET_COMPTE_DEMO, 'n')).rejects.toMatchObject({ raison: 'TACHE_NON_EN_COURS' });
    const prise = (await b.file.prendre('m', 'autre-service'))!;
    await expect(b.passerelle.lire(prise, TYPE_SECRET_COMPTE_DEMO, 'n')).rejects.toMatchObject({ raison: 'TACHE_NON_EN_COURS' });
    const b2 = await banc();
    const p2 = (await b2.file.prendre('m', 'coeur-1'))!;
    b2.t.v += 61_000;
    await expect(b2.passerelle.lire(p2, TYPE_SECRET_COMPTE_DEMO, 'n')).rejects.toMatchObject({ raison: 'BAIL' });
    const b3 = await banc();
    const p3 = (await b3.file.prendre('m', 'coeur-1'))!;
    b3.file.taches[0]!.etat = 'terminee';
    await expect(b3.passerelle.lire(p3, TYPE_SECRET_COMPTE_DEMO, 'n')).rejects.toMatchObject({ raison: 'TACHE_NON_EN_COURS' });
    expect(b.lus).toEqual([]);
  });
  it('ne lit pas pour une autre marque que celle de la tâche', async () => {
    const b = await banc();
    const prise = (await b.file.prendre('m', 'coeur-1'))!;
    await expect(b.passerelle.lire({ ...prise, marqueId: 'autre' }, TYPE_SECRET_COMPTE_DEMO, 'n')).rejects.toMatchObject({ raison: 'TACHE_NON_EN_COURS' });
  });
});

describe('exécutant du test de connexion', () => {
  const application: Application = { id: ID_APP, espaceId: 'e', nom: 'Démo', accueil: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr'], version: 1, creeLe: new Date(), modifieLe: new Date() };
  const applications = (a: Application | undefined): Applications => ({ lister: async () => [], lire: async (_m, _u, id) => (id === ID_APP ? a : undefined), creer: async () => undefined, remplacer: async () => undefined });
  const tache = { id: 'tache-1', marqueId: 'm', utilisateurId: 'u', type: 'test_connexion', entree: { applicationId: ID_APP } } as unknown as Tache;
  const aide = { signal: new AbortController().signal, pointDeNonRetour: async () => undefined };
  const png = Buffer.from([137, 80, 78, 71]).toString('base64');

  function executant(sortie: string | Error, clair: string | null = serialiserCompte({ identifiant: 'demo@exemple.fr', motDePasse: MOT_DE_PASSE }), a: Application | null = application) {
    const vus: DemandeLanceur[] = [];
    const lanceur: LanceurCapture = { lancer: async (d) => (vus.push(d), sortie instanceof Error ? Promise.reject(sortie) : sortie) };
    const passerelle = { lire: async () => clair ?? undefined };
    return { vus, executant: creerExecutantTestConnexion({ applications: applications(a ?? undefined), passerelle, lanceur, cle: randomBytes(32), proxy: '10.89.77.2:3128' }) };
  }
  const echec = async (p: Promise<unknown>) => (await p.then(() => undefined, (e: unknown) => e)) as ErreurTache;

  it('envoie le compte au conteneur par l’entrée standard et rend la mini capture', async () => {
    const e = executant(`${JSON.stringify({ ok: true, hote: 'demo.exemple.fr', titre: 'Accueil', miniature: png })}\n`);
    expect(await e.executant.executer(tache, aide)).toEqual({ hote: 'demo.exemple.fr', titre: 'Accueil', miniature: png });
    const demande = JSON.parse(e.vus[0]!.entree);
    expect(demande).toMatchObject({ mode: 'connexion', url: 'https://demo.exemple.fr/', compte: { identifiant: 'demo@exemple.fr', motDePasse: MOT_DE_PASSE } });
    expect(e.vus[0]!.nom).not.toContain(MOT_DE_PASSE);
  });
  it('nomme l’étape fautive dans la cause, sans valeur du compte', async () => {
    for (const etape of ETAPES_CONNEXION) {
      const erreur = await echec(executant(JSON.stringify({ ok: false, cause: 'CONNEXION_ECHEC', etape })).executant.executer(tache, aide));
      expect(erreur).toBeInstanceOf(ErreurTache);
      expect(erreur.cause_).toBe(causeEtape(etape));
      expect(erreur.reessayer).toBe(false);
      expect(JSON.stringify(erreur)).not.toContain(MOT_DE_PASSE);
    }
  });
  it('compte absent ou illisible : COMPTE_ABSENT ; lecture refusée : SECRET_REFUSE', async () => {
    expect((await echec(executant('', null).executant.executer(tache, aide))).cause_).toBe('COMPTE_ABSENT');
    expect((await echec(executant('', 'pas du json').executant.executer(tache, aide))).cause_).toBe('COMPTE_ABSENT');
    const lanceur: LanceurCapture = { lancer: async () => '' };
    const refus = creerExecutantTestConnexion({ applications: applications(application), passerelle: { lire: async () => { throw new SecretRefuse('BAIL'); } }, lanceur, cle: randomBytes(32), proxy: '10.89.77.2:3128' });
    expect((await echec(refus.executer(tache, aide))).cause_).toBe('SECRET_REFUSE');
  });
  it('refuse une sortie qui cite le mot de passe, une sortie illisible et un hôte rendu hors liste', async () => {
    expect((await echec(executant(`{"ok":false,"cause":"CAPTURE_ECHEC","note":"${MOT_DE_PASSE}"}`).executant.executer(tache, aide))).cause_).toBe('CAPTURE_ECHEC');
    expect((await echec(executant('pas du json').executant.executer(tache, aide))).cause_).toBe('CAPTURE_ECHEC');
    expect((await echec(executant(JSON.stringify({ ok: true, hote: 'hors.exemple.net', titre: 'x', miniature: png })).executant.executer(tache, aide))).cause_).toBe('HOTE_REFUSE');
  });
  it('application introuvable, entrée invalide : échec sans lancer de conteneur', async () => {
    const e = executant('', null, null);
    expect((await echec(e.executant.executer(tache, aide))).cause_).toBe('APPLICATION_INTROUVABLE');
    expect((await echec(e.executant.executer({ ...tache, entree: { applicationId: 'x' } } as Tache, aide))).cause_).toBe('ENTREE_INVALIDE');
    expect(e.vus).toEqual([]);
  });
});

describe('compte de démo : actions, parité, page', () => {
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let b: BancDeTest;
  let marqueId: string;
  let espaceA: string;
  let applicationId: string;
  let jetonA: string;
  let jetonB: string;
  let cookie: string;
  let cookieVieux: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const poster = (c: string, corps: Record<string, string>) =>
    app.inject({ method: 'POST', url: '/demos', headers: { cookie: c, origin: ORIGINE, 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(corps).toString() });

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    b = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await b.marques.creer();
    const a = await b.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const autre = await b.espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
    espaceA = a.espaces[0]!.id;
    const jeton = async (sub: string, utilisateurId: string, espaceId: string) => (await b.jetons.creer({ marqueId, utilisateurId, sub, nom: 'test', portees: ['lecture', 'ecriture'], espaceIds: [espaceId], dureeJours: 30 })).clair;
    jetonA = await jeton('sub-a', a.utilisateurId, espaceA);
    jetonB = await jeton('sub-b', autre.utilisateurId, autre.espaces[0]!.id);
    const session = (authentifieLe: Date) => b.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe, espaceActifId: espaceA });
    cookie = `${COOKIE_SESSION}=${await session(new Date())}`;
    cookieVieux = `${COOKIE_SESSION}=${await session(new Date(Date.now() - 3_600_000))}`;
    app = await construireServeur({ services: b.services });
    applicationId = (await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Démo', accueil: 'https://demo.etablia.fr/', hotes: [] })).json().donnees.application.id;
  });
  afterAll(async () => app?.close());

  it('le dépôt est réservé à l’interface ; état et test sont offerts à l’API et au MCP', () => {
    expect(EXCEPTIONS_PARITE.some((x) => x.action === 'compte.deposer')).toBe(true);
    const exposees = actionsExposees(ACTIONS, EXCEPTIONS_PARITE).map((x) => `${x.domaine}.${x.verbe}`);
    expect(exposees).not.toContain('compte.deposer');
    expect(exposees).toEqual(expect.arrayContaining(['compte.etat', 'compte.tester']));
  });
  it('l’API ne sait ni déposer ni lire un compte', async () => {
    expect((await appeler(jetonA, 'compte/deposer', { applicationId, identifiant: 'a', motDePasse: 'b' })).statusCode).toBe(404);
    expect((await appeler(jetonA, 'compte/lire', { applicationId })).statusCode).toBe(404);
  });
  it('sans compte déposé : état « non déposé », test refusé en COMPTE_ABSENT (409)', async () => {
    expect((await appeler(jetonA, 'compte/etat', { applicationId })).json().donnees).toMatchObject({ depose: false, modifieLe: null });
    const r = await appeler(jetonA, 'compte/tester', { applicationId });
    expect(r.statusCode).toBe(409);
    expect(r.json().erreur.code).toBe('COMPTE_ABSENT');
  });
  it('l’interface dépose le compte : chiffré au coffre, ni réaffiché, ni journalisé', async () => {
    const r = await poster(cookie, { geste: 'compte', id: applicationId, identifiant: 'demo@etablia.fr', motDePasse: MOT_DE_PASSE });
    expect(r.statusCode).toBe(303);
    expect(b.comptesDemo.lire(marqueId, applicationId)).toEqual({ identifiant: 'demo@etablia.fr', motDePasse: MOT_DE_PASSE });
    const etat = (await appeler(jetonA, 'compte/etat', { applicationId })).json();
    expect(etat.donnees).toMatchObject({ depose: true });
    expect(JSON.stringify(etat)).not.toContain(MOT_DE_PASSE);
    expect(b.audit.lignes.some((l) => l.action === 'compte_deposer' && l.objet === `application:${applicationId}`)).toBe(true);
    expect(JSON.stringify(b.audit.lignes)).not.toContain(MOT_DE_PASSE);
    const page = await app.inject({ method: 'GET', url: '/demos', headers: { cookie } });
    expect(page.body).not.toContain(MOT_DE_PASSE);
    expect(page.body).not.toContain('demo@etablia.fr');
    expect(page.body).toContain('type="password"');
  });
  it('une connexion de plus de 10 minutes est renvoyée vers l’authentification, rien n’est remplacé', async () => {
    const r = await poster(cookieVieux, { geste: 'compte', id: applicationId, identifiant: 'pirate@etablia.fr', motDePasse: 'autre' });
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toContain('/connexion?recente=1');
    expect(b.comptesDemo.lire(marqueId, applicationId)?.identifiant).toBe('demo@etablia.fr');
  });
  it('champs vides refusés ; application d’un autre espace introuvable', async () => {
    expect((await poster(cookie, { geste: 'compte', id: applicationId, identifiant: ' ', motDePasse: 'x' })).statusCode).toBe(200);
    expect((await appeler(jetonB, 'compte/etat', { applicationId })).statusCode).toBe(404);
    expect((await appeler(jetonB, 'compte/tester', { applicationId })).statusCode).toBe(404);
    expect(b.comptesDemo.lire(marqueId, applicationId)?.identifiant).toBe('demo@etablia.fr');
  });
  it('« Tester » enfile une tâche test_connexion, sans le compte dans son entrée', async () => {
    const r = await appeler(jetonA, 'compte/tester', { applicationId });
    expect(r.statusCode).toBe(200);
    const tache = b.file.taches.find((t) => t.id === r.json().donnees.tacheId)!;
    expect(tache).toMatchObject({ type: 'test_connexion', classe: 'interactive', entree: { applicationId } });
    expect(JSON.stringify(tache.entree)).not.toContain(MOT_DE_PASSE);
    const suivi = await app.inject({ method: 'GET', url: `/demos?test=${tache.id}`, headers: { cookie } });
    expect(suivi.statusCode).toBe(200);
    const redir = await poster(cookie, { geste: 'tester', id: applicationId });
    expect(redir.statusCode).toBe(303);
    expect(redir.headers.location).toMatch(/^\/demos\?test=[0-9a-f-]{36}$/);
  });
  it('affiche la cause d’échec traduite et la miniature d’un test réussi', async () => {
    const reussi = await b.file.enfiler(marqueId, (await b.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia')).utilisateurId, 'test_connexion', { applicationId });
    const t = b.file.taches.find((x) => x.id === reussi.id)!;
    Object.assign(t, { etat: 'terminee', resultat: { hote: 'demo.etablia.fr', titre: 'Accueil connecté', miniature: 'iVBORw0KGgo=' } });
    const ok = await app.inject({ method: 'GET', url: `/demos?test=${t.id}`, headers: { cookie } });
    expect(ok.body).toContain('data:image/png;base64,iVBORw0KGgo=');
    Object.assign(t, { resultat: { hote: 'demo.etablia.fr', titre: 'x', miniature: '"><script>alert(1)</script>' } });
    const mal = await app.inject({ method: 'GET', url: `/demos?test=${t.id}`, headers: { cookie } });
    expect(mal.body).not.toContain('<script>alert(1)');
    Object.assign(t, { etat: 'echouee', resultat: undefined, cause: causeEtape('saisir') });
    const ko = await app.inject({ method: 'GET', url: `/demos?test=${t.id}`, headers: { cookie } });
    expect(ko.body).toContain('class="probleme"');
  });
});

describe('sérialisation du compte', () => {
  it('relit un compte valide et rejette le reste', () => {
    const c = { identifiant: 'a@b.fr', motDePasse: ' avec espaces ' };
    expect(lireCompteSerialise(serialiserCompte(c))).toEqual(c);
    for (const mauvais of ['', 'x', '{}', '{"identifiant":1,"motDePasse":"x"}', '[]']) expect(lireCompteSerialise(mauvais)).toBeUndefined();
    expect(nomSecretCompteDemo(ID_APP)).toBe(`application:${ID_APP}`);
  });
});
