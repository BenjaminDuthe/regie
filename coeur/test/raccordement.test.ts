// Histoire 7.6 : connexion d'un compte Instagram par OAuth (state lié à la session, redirection fixe), jeton au coffre,
// rappels d'échéance, bornes de la vidéo. Tout contre le faux Meta (127.0.0.1) : aucun jeton réel.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_FLUX_RESEAU, COOKIE_SESSION } from '../src/auth/cookies.ts';
import { BORNES, bornesVideoDepassees } from '../src/domaine/bornes.ts';
import { idUtilisateur } from '../src/infra/espaces.ts';
import { lireObjetRappel, rappelsDu } from '../src/infra/comptes-reseau.ts';
import { ConnecteurInstagram } from '../src/publication/connecteur-instagram.ts';
import { RACCORDEMENTS_PAR_FENETRE } from '../src/publication/routes-reseau.ts';
import { construireServeur } from '../src/serveur.ts';
import { gestionnaireRappelConnexion } from '../src/services/gestionnaires.ts';
import { EXCEPTIONS_PARITE } from '../src/services/exceptions-parite.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';
import { demarrerFauxMeta, type FauxMeta } from './faux-reseaux.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const SECRET = 'secret-valide-123';

describe('bornes de la vidéo publiée (Instagram)', () => {
  it('une vidéo dans les bornes n’en dépasse aucune', () => {
    expect(bornesVideoDepassees('instagram', { dureeS: 30, tailleOctets: 10_000_000 })).toEqual([]);
  });
  it('nomme chaque borne dépassée avec sa limite', () => {
    const b = BORNES.publication.instagram;
    expect(bornesVideoDepassees('instagram', { dureeS: b.dureeMaxS + 1, tailleOctets: 1 })).toEqual([{ borne: 'dureeMaxS', valeur: b.dureeMaxS + 1, limite: b.dureeMaxS }]);
    expect(bornesVideoDepassees('instagram', { dureeS: 1, tailleOctets: 1 })).toEqual([{ borne: 'dureeMinS', valeur: 1, limite: b.dureeMinS }]);
    expect(bornesVideoDepassees('instagram', { dureeS: 30, tailleOctets: b.tailleMaxOctets + 1 })).toEqual([{ borne: 'tailleMaxOctets', valeur: b.tailleMaxOctets + 1, limite: b.tailleMaxOctets }]);
    expect(bornesVideoDepassees('instagram', { dureeS: 0, tailleOctets: b.tailleMaxOctets + 1 }).map((x) => x.borne)).toEqual(['dureeMinS', 'tailleMaxOctets']);
  });
  it('un réseau sans borne de publication ne laisse rien passer en silence', () => {
    expect(() => bornesVideoDepassees('tiktok' as never, { dureeS: 30, tailleOctets: 1 })).toThrow();
  });
});

describe('rappels d’échéance de connexion', () => {
  const compte = '11111111-1111-4111-8111-111111111111';
  const personne = '22222222-2222-4222-8222-222222222222';
  const expire = new Date('2026-12-31T12:00:00Z');
  it('inscrit J-7 et la veille, avec une clé unique par échéance', () => {
    const r = rappelsDu(compte, personne, expire, new Date('2026-10-21T00:00:00Z'));
    expect(r.map((x) => x.instant.toISOString())).toEqual(['2026-12-24T12:00:00.000Z', '2026-12-30T12:00:00.000Z']);
    expect(new Set(r.map((x) => x.cle)).size).toBe(2);
    expect(lireObjetRappel(r[0]!.objet)).toMatchObject({ compteId: compte, utilisateurId: personne, suffixe: 'j7' });
  });
  it('écarte un rappel déjà passé (connexion à moins de 7 jours de l’échéance)', () => {
    expect(rappelsDu(compte, personne, expire, new Date('2026-12-27T00:00:00Z')).map((x) => x.objet.split(':').at(-1))).toEqual(['j1']);
    expect(rappelsDu(compte, personne, expire, new Date('2026-12-31T00:00:00Z'))).toEqual([]);
  });
  it('refuse un objet mal formé', () => {
    expect(lireObjetRappel('nimporte quoi')).toBeUndefined();
    expect(lireObjetRappel(`${compte}:${personne}:12:j9`)).toBeUndefined();
  });
});

describe('raccordement OAuth contre le faux Meta', () => {
  let meta: FauxMeta;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let b: BancDeTest;
  let marqueId: string;
  let espaceId: string;
  let personne: string;
  let jetonApi: string;
  let cookieA: string;
  let cookieB: string;

  const departEtFlux = async (cookie: string) => {
    const r = await app.inject({ method: 'GET', url: '/reseaux/instagram/depart', headers: { cookie } });
    const pose = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE_FLUX_RESEAU}=`));
    return { r, flux: pose === undefined ? undefined : pose.split(';')[0]!, state: r.headers.location === undefined || !r.headers.location.startsWith('http') ? undefined : new URL(r.headers.location).searchParams.get('state') };
  };
  const retour = (cookie: string, flux: string | undefined, requete: string) =>
    app.inject({ method: 'GET', url: `/reseaux/instagram/retour?${requete}`, headers: { cookie: flux === undefined ? cookie : `${cookie}; ${flux}` } });

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    meta = await demarrerFauxMeta();
    b = creerServicesDeTest(undefined, { urlPublique: ORIGINE, connecteurs: { instagram: new ConnecteurInstagram({ adresses: meta.adresses, pauseMs: 0, delaiMs: 2000 }) } });
    marqueId = await b.marques.creer();
    const a = await b.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    espaceId = a.espaces[0]!.id;
    personne = idUtilisateur(marqueId, 'sub-a');
    jetonApi = (await b.jetons.creer({ marqueId, utilisateurId: a.utilisateurId, sub: 'sub-a', nom: 'test', portees: ['lecture', 'ecriture'], espaceIds: [espaceId], dureeJours: 30 })).clair;
    await b.reseaux.remplacerCle(marqueId, 'instagram', { idApplication: '1234567890', secret: SECRET });
    cookieA = `${COOKIE_SESSION}=${await b.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(), espaceActifId: espaceId })}`;
    cookieB = `${COOKIE_SESSION}=${await b.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(), espaceActifId: espaceId })}`;
    app = await construireServeur({ services: b.services });
  });
  afterAll(async () => {
    await app?.close();
    await meta?.fermer();
  });

  it('sans session, le départ et le retour renvoient vers la connexion, sans rien relier', async () => {
    const d = await app.inject({ method: 'GET', url: '/reseaux/instagram/depart' });
    expect(d.statusCode).toBe(303);
    expect(d.headers.location).toBe('/connexion?retour=%2Freseaux');
    const r = await app.inject({ method: 'GET', url: '/reseaux/instagram/retour?code=code-valide&state=x' });
    expect(r.headers.location).toBe('/reseaux?connexion=session');
    expect(b.comptesReseau.lignes).toHaveLength(0);
  });
  it('une connexion ancienne est renvoyée vers l’authentification avant le départ', async () => {
    const vieux = `${COOKIE_SESSION}=${await b.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(Date.now() - 3_600_000), espaceActifId: espaceId })}`;
    const d = await app.inject({ method: 'GET', url: '/reseaux/instagram/depart', headers: { cookie: vieux } });
    expect(d.headers.location).toContain('/connexion?recente=1');
  });
  it('le départ pose un cookie de flux court et renvoie vers le réseau avec un state', async () => {
    const { r, flux, state } = await departEtFlux(cookieA);
    expect(r.statusCode).toBe(303);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers.location).toContain(meta.adresses.autorisation);
    expect(state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(flux).toBeDefined();
    const pose = ([] as string[]).concat(r.headers['set-cookie'] ?? []).join(';');
    expect(pose).toContain('HttpOnly');
    expect(pose).toContain('Secure');
    expect(pose).toContain('Max-Age=600');
    // Le state n'est pas écrit en clair dans le cookie (scellé), ni le cookie de session.
    expect(flux).not.toContain(state!);
  });
  it('le parcours complet relie le compte : jeton au coffre, jamais dans la page ni l’audit, rappels inscrits', async () => {
    const { flux, state } = await departEtFlux(cookieA);
    const r = await retour(cookieA, flux, `code=code-valide&state=${state}`);
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toBe('/reseaux?connexion=ok');
    expect(([] as string[]).concat(r.headers['set-cookie'] ?? []).join(';')).toContain(`${COOKIE_FLUX_RESEAU}=;`);
    expect(b.comptesReseau.lignes).toHaveLength(1);
    const compte = b.comptesReseau.lignes[0]!;
    expect(compte).toMatchObject({ reseau: 'instagram', etat: 'connecte', espaceId, utilisateurId: personne });
    expect(await b.comptesReseau.lireJeton(marqueId, compte.id)).toBe(meta.reglages.jetonLong);
    expect(b.comptesReseau.echeances.map((e) => e.type)).toEqual(['rappel_connexion', 'rappel_connexion']);
    expect(JSON.stringify(b.audit.lignes)).not.toContain(meta.reglages.jetonLong);
    expect(b.audit.lignes.some((l) => l.action === 'reseau_connecter')).toBe(true);
    const page = await app.inject({ method: 'GET', url: '/reseaux?connexion=ok', headers: { cookie: cookieA } });
    expect(page.body).toContain('Compte relié.');
    expect(page.body).toContain('Reconnecter');
    expect(page.body).not.toContain(meta.reglages.jetonLong);
    const api = await app.inject({ method: 'POST', url: '/api/v1/reseau/comptes', headers: { authorization: `Bearer ${jetonApi}`, 'content-type': 'application/json' }, payload: '{}' });
    expect(api.statusCode).toBe(200);
    expect(api.json().donnees.comptes).toEqual([expect.objectContaining({ reseau: 'instagram', etat: 'connecte' })]);
    expect(api.body).not.toContain(meta.reglages.jetonLong);
  });
  it('reconnecter le même compte le met à jour sans le dupliquer', async () => {
    const { flux, state } = await departEtFlux(cookieA);
    await retour(cookieA, flux, `code=code-valide&state=${state}`);
    expect(b.comptesReseau.lignes).toHaveLength(1);
  });
  it('state erroné, absent ou rejoué : refusé, rien n’est relié', async () => {
    const avant = JSON.stringify(b.comptesReseau.lignes);
    const { flux, state } = await departEtFlux(cookieA);
    expect((await retour(cookieA, flux, 'code=code-valide&state=autre')).headers.location).toBe('/reseaux?connexion=etat');
    expect((await retour(cookieA, flux, 'code=code-valide')).headers.location).toBe('/reseaux?connexion=etat');
    expect((await retour(cookieA, undefined, `code=code-valide&state=${state}`)).headers.location).toBe('/reseaux?connexion=etat');
    expect(JSON.stringify(b.comptesReseau.lignes)).toBe(avant);
  });
  it('un state lancé par une autre session est refusé (state lié à la session)', async () => {
    const { flux, state } = await departEtFlux(cookieA);
    const r = await retour(cookieB, flux, `code=code-valide&state=${state}`);
    expect(r.headers.location).toBe('/reseaux?connexion=etat');
  });
  it('un flux expiré est refusé', async () => {
    const { flux, state } = await departEtFlux(cookieA);
    b.horloge.t += 11 * 60_000;
    const r = await retour(cookieA, flux, `code=code-valide&state=${state}`);
    b.horloge.t -= 11 * 60_000;
    expect(r.headers.location).toBe('/reseaux?connexion=etat');
  });
  it('un refus du réseau (error=…) ou un code faux ne relie rien et n’expose aucun texte du réseau', async () => {
    const un = await departEtFlux(cookieA);
    const refus = await retour(cookieA, un.flux, `error=access_denied&error_description=${encodeURIComponent('<script>x</script>')}&state=${un.state}`);
    expect(refus.headers.location).toBe('/reseaux?connexion=refusee');
    const deux = await departEtFlux(cookieA);
    const faux = await retour(cookieA, deux.flux, `code=mauvais&state=${deux.state}`);
    expect(faux.headers.location).toBe('/reseaux?connexion=echange');
  });
  it('la redirection finale est toujours un chemin fixe de regie, jamais tiré de la requête', async () => {
    const { flux, state } = await departEtFlux(cookieA);
    const r = await retour(cookieA, flux, `code=code-valide&state=${state}&retour=https://evil.exemple/&redirect_uri=https://evil.exemple/`);
    expect(r.headers.location).toMatch(/^\/reseaux\?connexion=[a-z_]+$/);
  });
  it('sans clé d’application, le départ est refusé proprement', async () => {
    const autre = creerServicesDeTest(undefined, { urlPublique: ORIGINE, connecteurs: { instagram: new ConnecteurInstagram({ adresses: meta.adresses, pauseMs: 0, delaiMs: 2000 }) } });
    const m = await autre.marques.creer();
    const e = await autre.espaces.assurer(m, 'sub-z', undefined, 'Z');
    const c = `${COOKIE_SESSION}=${await autre.sessions.creer({ marqueId: m, sub: 'sub-z', email: undefined, authentifieLe: new Date(), espaceActifId: e.espaces[0]!.id })}`;
    const app2 = await construireServeur({ services: autre.services });
    const r = await app2.inject({ method: 'GET', url: '/reseaux/instagram/depart', headers: { cookie: c } });
    expect(r.headers.location).toBe('/reseaux?connexion=sans_cle');
    await app2.close();
  });
  it('reseau.connecter est réservé à l’interface : l’API répond 404 et ne relie rien', async () => {
    expect(EXCEPTIONS_PARITE.some((x) => x.action === 'reseau.connecter')).toBe(true);
    const n = b.comptesReseau.lignes.length;
    const r = await app.inject({ method: 'POST', url: '/api/v1/reseau/connecter', headers: { authorization: `Bearer ${jetonApi}`, 'content-type': 'application/json' }, payload: JSON.stringify({ reseau: 'instagram', espaceId, compteExterne: 'x1', nom: 'pirate', jeton: 'jeton-pirate-1', expireLe: '2027-01-01T00:00:00Z' }) });
    expect(r.statusCode).toBe(404);
    expect(b.comptesReseau.lignes).toHaveLength(n);
  });
  it('déconnecter efface le jeton du coffre ; un compte étranger est introuvable', async () => {
    const compte = b.comptesReseau.lignes[0]!;
    const etranger = await app.inject({ method: 'POST', url: '/api/v1/reseau/deconnecter', headers: { authorization: `Bearer ${jetonApi}`, 'content-type': 'application/json' }, payload: JSON.stringify({ compteId: crypto.randomUUID() }) });
    expect(etranger.statusCode).toBe(404);
    const ok = await app.inject({ method: 'POST', url: '/api/v1/reseau/deconnecter', headers: { authorization: `Bearer ${jetonApi}`, 'content-type': 'application/json' }, payload: JSON.stringify({ compteId: compte.id }) });
    expect(ok.statusCode).toBe(200);
    expect(await b.comptesReseau.lireJeton(marqueId, compte.id)).toBeUndefined();
    expect(b.comptesReseau.lignes[0]!.etat).toBe('deconnecte');
  });
  it('la limite de débit par adresse protège départ et retour', async () => {
    let dernier = 0;
    for (let i = 0; i < RACCORDEMENTS_PAR_FENETRE + 2; i += 1) dernier = (await app.inject({ method: 'GET', url: '/reseaux/instagram/depart', headers: { cookie: cookieA } })).statusCode;
    expect(dernier).toBe(429);
  });
});

describe('gestionnaire des rappels de connexion', () => {
  const lancer = async (modifier?: (b: BancDeTest, compteId: string) => void) => {
    const b = creerServicesDeTest(undefined);
    const marqueId = await b.marques.creer();
    const a = await b.espaces.assurer(marqueId, 'sub-a', undefined, 'E');
    const espaceId = a.espaces[0]!.id;
    const utilisateurId = idUtilisateur(marqueId, 'sub-a');
    const expireLe = new Date(Date.now() + 30 * 86_400_000);
    const compte = (await b.comptesReseau.connecter({ marqueId, utilisateurId, espaceId, reseau: 'instagram', compteExterne: '1', nom: 'Compte', jeton: 'jeton-long-xx', expireLe }, new Date()))!;
    modifier?.(b, compte.id);
    const g = gestionnaireRappelConnexion({ comptes: b.comptesReseau, notifications: b.notifications })['rappel_connexion']!;
    const travaux = b.comptesReseau.echeances.map((e) => ({ id: 't', marqueId, echeanceId: 'e', type: e.type, objet: e.objet, etat: 'en_cours', tentatives: 1, cause: undefined }) as never);
    return { b, g, travaux, compte };
  };
  it('crée une notification par rappel, sans doublon si le rappel est rejoué', async () => {
    const { b, g, travaux } = await lancer();
    for (const t of travaux) await g(t);
    for (const t of travaux) await g(t);
    expect(b.notifications.lignes.map((n) => n.genre).sort()).toEqual(['connexion_expire_bientot', 'connexion_expire_demain']);
    expect(b.notifications.lignes.every((n) => n.etape === 'instagram')).toBe(true);
  });
  it('un compte déconnecté ou reconnecté (nouvelle échéance) rend l’ancien rappel muet', async () => {
    const dec = await lancer();
    await dec.b.comptesReseau.deconnecter(dec.compte.marqueId ?? (dec.travaux[0] as unknown as { marqueId: string }).marqueId, idUtilisateur((dec.travaux[0] as unknown as { marqueId: string }).marqueId, 'sub-a'), dec.compte.id);
    for (const t of dec.travaux) await dec.g(t);
    expect(dec.b.notifications.lignes).toHaveLength(0);
    const re = await lancer();
    const marque = (re.travaux[0] as unknown as { marqueId: string }).marqueId;
    await re.b.comptesReseau.connecter({ marqueId: marque, utilisateurId: idUtilisateur(marque, 'sub-a'), espaceId: re.compte.espaceId, reseau: 'instagram', compteExterne: '1', nom: 'Compte', jeton: 'jeton-long-yy', expireLe: new Date(Date.now() + 60 * 86_400_000) }, new Date());
    for (const t of re.travaux) await re.g(t);
    expect(re.b.notifications.lignes).toHaveLength(0);
  });
  it('un objet illisible fait échouer le travail', async () => {
    const { g } = await lancer();
    await expect(g({ id: 't', marqueId: 'm', echeanceId: 'e', type: 'rappel_connexion', objet: 'x', etat: 'en_cours', tentatives: 1, cause: undefined } as never)).rejects.toThrow();
  });
});
