// Histoire 7.1 : administration des réseaux. La clé d'application va au coffre, ne se réaffiche jamais ; seul son état se voit.
// Tout appel à Meta vise un faux serveur local (127.0.0.1).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { LimiteDebit } from '../src/auth/limite-debit.ts';
import { RESEAUX_ACTIFS, RESEAUX_DECLARES, estReseauActif, lireReseaux, redirectUri } from '../src/domaine/reseaux.ts';
import { ConnecteurInstagram } from '../src/publication/connecteur-instagram.ts';
import { ErreurReseau } from '../src/publication/connecteur.ts';
import { construireServeur } from '../src/serveur.ts';
import { ACTIONS } from '../src/services/actions.ts';
import { EXCEPTIONS_PARITE } from '../src/services/exceptions-parite.ts';
import { actionsExposees } from '../src/services/parite.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';
import { demarrerFauxMeta, type FauxMeta } from './faux-reseaux.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const SECRET = 'secret-valide-123';

describe('limite de débit par adresse', () => {
  it('laisse passer jusqu’au plafond puis refuse, par clé, et oublie hors fenêtre', () => {
    let t = 0;
    const l = new LimiteDebit(2, 1000, () => t);
    expect(l.permettre('a')).toBe(true);
    expect(l.permettre('a')).toBe(true);
    expect(l.permettre('a')).toBe(false);
    expect(l.permettre('b')).toBe(true);
    t = 1001;
    expect(l.permettre('a')).toBe(true);
  });
});

describe('deploiement/reseaux.json', () => {
  it('déclare Instagram seul, avec portées et chemin de retour fixe', () => {
    expect(RESEAUX_ACTIFS).toEqual(['instagram']);
    expect(RESEAUX_DECLARES.instagram?.portees).toContain('instagram_business_content_publish');
    expect(redirectUri('https://regie.exemple.fr', 'instagram')).toBe('https://regie.exemple.fr/reseaux/instagram/retour');
    expect(redirectUri(undefined, 'instagram')).toBeUndefined();
    expect(estReseauActif('instagram')).toBe(true);
    expect(estReseauActif('tiktok')).toBe(false);
    expect(estReseauActif('../x')).toBe(false);
  });
  it('refuse un fichier mal formé ou un chemin de retour hors /reseaux/<réseau>/retour', () => {
    const base = { nom: 'I', service: 'publication', portees: ['a_b'], cheminRetour: '/reseaux/instagram/retour' };
    expect(() => lireReseaux({ version: 1, reseaux: { instagram: base } })).not.toThrow();
    expect(() => lireReseaux({ version: 1, reseaux: { instagram: { ...base, cheminRetour: 'https://evil.exemple/' } } })).toThrow();
    expect(() => lireReseaux({ version: 1, reseaux: { instagram: { ...base, cheminRetour: '/autre' } } })).toThrow();
    expect(() => lireReseaux({ version: 1, reseaux: { instagram: { ...base, portees: [] } } })).toThrow();
    expect(() => lireReseaux({ version: 1, reseaux: { inconnu: base } })).toThrow();
  });
});

describe('connecteur Instagram contre le faux Meta', () => {
  let meta: FauxMeta;
  let c: ConnecteurInstagram;
  const cle = { idApplication: '1234567890', secret: SECRET };
  beforeAll(async () => {
    meta = await demarrerFauxMeta();
    c = new ConnecteurInstagram({ adresses: meta.adresses, pauseMs: 0, relevesMax: 3, delaiMs: 2000 });
  });
  afterAll(async () => meta?.fermer());

  it('accepte une clé valide', async () => {
    await expect(c.tester(cle)).resolves.toBeUndefined();
  });
  it('refuse une clé fausse avec RESEAU_CLE_REFUSEE (définitif)', async () => {
    const e = await c.tester({ ...cle, secret: 'faux-secret-xx' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurReseau);
    expect(e).toMatchObject({ code: 'RESEAU_CLE_REFUSEE', definitive: true });
  });
  it('un réseau injoignable donne RESEAU_INJOIGNABLE, sans détail', async () => {
    const mort = new ConnecteurInstagram({ adresses: { ...meta.adresses, application: 'http://127.0.0.1:1/x' }, delaiMs: 500 });
    const e = await mort.tester(cle).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'RESEAU_INJOIGNABLE', definitive: false });
    expect(String((e as Error).message)).not.toContain(SECRET);
  });
  it('construit l’adresse d’autorisation avec state et redirect_uri fournis', () => {
    const u = new URL(c.urlAutorisation({ cle, state: 'abc', redirectUri: 'https://regie.exemple.fr/reseaux/instagram/retour', portees: ['p1', 'p2'] }));
    expect(u.searchParams.get('state')).toBe('abc');
    expect(u.searchParams.get('redirect_uri')).toBe('https://regie.exemple.fr/reseaux/instagram/retour');
    expect(u.searchParams.get('scope')).toBe('p1,p2');
    expect(u.searchParams.get('client_secret')).toBeNull();
  });
});

describe('administration des réseaux : actions, parité, page', () => {
  let meta: FauxMeta;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let b: BancDeTest;
  let marqueId: string;
  let jetonA: string;
  let jetonLecture: string;
  let cookie: string;
  let cookieVieux: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const poster = (c: string, corps: Record<string, string>) =>
    app.inject({ method: 'POST', url: '/reseaux', headers: { cookie: c, origin: ORIGINE, 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(corps).toString() });

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    meta = await demarrerFauxMeta();
    b = creerServicesDeTest(undefined, { urlPublique: ORIGINE, connecteurs: { instagram: new ConnecteurInstagram({ adresses: meta.adresses, pauseMs: 0, delaiMs: 2000 }) } });
    marqueId = await b.marques.creer();
    const a = await b.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const espaceA = a.espaces[0]!.id;
    const jeton = async (portees: ('lecture' | 'ecriture')[]) => (await b.jetons.creer({ marqueId, utilisateurId: a.utilisateurId, sub: 'sub-a', nom: 'test', portees, espaceIds: [espaceA], dureeJours: 30 })).clair;
    jetonA = await jeton(['lecture', 'ecriture']);
    jetonLecture = await jeton(['lecture']);
    const session = (authentifieLe: Date) => b.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe, espaceActifId: espaceA });
    cookie = `${COOKIE_SESSION}=${await session(new Date())}`;
    cookieVieux = `${COOKIE_SESSION}=${await session(new Date(Date.now() - 3_600_000))}`;
    app = await construireServeur({ services: b.services });
  });
  afterAll(async () => {
    await app?.close();
    await meta?.fermer();
  });

  it('le dépôt est réservé à l’interface ; état et test sont offerts à l’API et au MCP', () => {
    expect(EXCEPTIONS_PARITE.some((x) => x.action === 'reseau.deposer')).toBe(true);
    const exposees = actionsExposees(ACTIONS, EXCEPTIONS_PARITE).map((x) => `${x.domaine}.${x.verbe}`);
    expect(exposees).not.toContain('reseau.deposer');
    expect(exposees).toEqual(expect.arrayContaining(['reseau.etat', 'reseau.tester']));
  });
  it('l’API ne sait pas déposer la clé', async () => {
    expect((await appeler(jetonA, 'reseau/deposer', { reseau: 'instagram', idApplication: '123456', secret: SECRET })).statusCode).toBe(404);
    expect(b.reseaux.cles.size).toBe(0);
  });
  it('sans clé : état « non déposée », test refusé en RESEAU_CLE_ABSENTE (409)', async () => {
    const e = await appeler(jetonLecture, 'reseau/etat');
    expect(e.statusCode).toBe(200);
    expect(e.json().donnees.reseaux).toEqual([expect.objectContaining({ reseau: 'instagram', cleDeposee: false, cleModifieeLe: null, connecteur: true })]);
    const t = await appeler(jetonA, 'reseau/tester', { reseau: 'instagram' });
    expect(t.statusCode).toBe(409);
    expect(t.json().erreur.code).toBe('RESEAU_CLE_ABSENTE');
  });
  it('un jeton en lecture seule ne peut pas tester (portée écriture)', async () => {
    expect((await appeler(jetonLecture, 'reseau/tester', { reseau: 'instagram' })).statusCode).toBe(403);
  });
  it('l’interface dépose la clé : chiffrée au coffre, ni réaffichée, ni dans l’état, ni dans l’audit', async () => {
    const r = await poster(cookie, { geste: 'cle', reseau: 'instagram', idApplication: '1234567890', secret: SECRET });
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toBe('/reseaux?cle=1');
    expect(await b.reseaux.lireCle(marqueId, 'instagram')).toEqual({ idApplication: '1234567890', secret: SECRET });
    const etat = await appeler(jetonLecture, 'reseau/etat');
    expect(etat.json().donnees.reseaux[0]).toMatchObject({ cleDeposee: true });
    expect(etat.body).not.toContain(SECRET);
    expect(JSON.stringify(b.audit.lignes)).not.toContain(SECRET);
    expect(b.audit.lignes.some((l) => l.action === 'reseau_deposer' && l.objet === 'reseau:instagram')).toBe(true);
    const page = await app.inject({ method: 'GET', url: '/reseaux?cle=1', headers: { cookie } });
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain(SECRET);
    expect(page.body).not.toContain('1234567890');
    expect(page.body).toContain('type="password"');
    expect(page.body).toContain('Clé déposée le');
  });
  it('une connexion de plus de 10 minutes est renvoyée vers l’authentification, rien n’est remplacé', async () => {
    const r = await poster(cookieVieux, { geste: 'cle', reseau: 'instagram', idApplication: 'pirate-123', secret: 'pirate-secret-1' });
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toContain('/connexion?recente=1');
    expect((await b.reseaux.lireCle(marqueId, 'instagram'))?.idApplication).toBe('1234567890');
  });
  it('champs vides, forme invalide, réseau inconnu : refusés, rien n’est remplacé', async () => {
    for (const corps of [
      { geste: 'cle', reseau: 'instagram', idApplication: ' ', secret: SECRET },
      { geste: 'cle', reseau: 'instagram', idApplication: 'ok-123', secret: 'court' },
      { geste: 'cle', reseau: 'instagram', idApplication: 'avec espace', secret: SECRET },
      { geste: 'cle', reseau: 'tiktok', idApplication: 'ok-123', secret: SECRET },
    ]) {
      const r = await poster(cookie, corps);
      expect(r.statusCode, JSON.stringify(corps)).toBe(200);
      expect(r.body).toContain('role="alert"');
    }
    expect((await b.reseaux.lireCle(marqueId, 'instagram'))?.idApplication).toBe('1234567890');
  });
  it('le test d’une clé valide réussit ; une clé refusée est dite refusée, sans la montrer', async () => {
    const ok = await appeler(jetonA, 'reseau/tester', { reseau: 'instagram' });
    expect(ok.json().donnees).toEqual({ reseau: 'instagram', valide: true, cause: null });
    await poster(cookie, { geste: 'cle', reseau: 'instagram', idApplication: '1234567890', secret: 'secret-perime-1' });
    const ko = await appeler(jetonA, 'reseau/tester', { reseau: 'instagram' });
    expect(ko.json().donnees).toEqual({ reseau: 'instagram', valide: false, cause: 'RESEAU_CLE_REFUSEE' });
    expect(ko.body).not.toContain('secret-perime-1');
    const page = await poster(cookie, { geste: 'tester', reseau: 'instagram' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Le test a échoué');
    expect(page.body).not.toContain('secret-perime-1');
    // Le secret n'est parti que dans la requête de test au faux Meta (jamais dans l'adresse d'un journal de regie).
    expect(meta.requetes.some((q) => q.chemin === '/fb/oauth/access_token')).toBe(true);
    await poster(cookie, { geste: 'cle', reseau: 'instagram', idApplication: '1234567890', secret: SECRET });
  });
  it('réseau inconnu ou entrée en trop : 400', async () => {
    expect((await appeler(jetonA, 'reseau/tester', { reseau: 'tiktok' })).statusCode).toBe(400);
    expect((await appeler(jetonA, 'reseau/tester', { reseau: 'instagram', extra: 1 })).statusCode).toBe(400);
  });
  it('sans session, la page redirige vers la connexion', async () => {
    const r = await app.inject({ method: 'GET', url: '/reseaux' });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toContain('/connexion');
  });
});
