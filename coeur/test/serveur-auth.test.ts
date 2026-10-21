// Histoire 1.14 : la garde, les routes d'authentification et la liste unique des routes publiques, de bout en bout.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signerAdresse } from '../src/auth/adresses-signees.ts';
import { COOKIE_FLUX, COOKIE_SESSION, lireCookie } from '../src/auth/cookies.ts';
import { idUtilisateur } from '../src/infra/espaces.ts';
import { ClientOidc } from '../src/infra/oidc.ts';
import { ROUTES_AVEC_SESSION_PROPRE, ROUTES_PUBLIQUES, ROUTES_STATIQUES, estPublique, normaliser } from '../src/routes-publiques.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerServicesDeTest, demarrerFauxFournisseur, type BancDeTest, type FauxFournisseur } from './faux-auth.ts';

const RACINE_COEUR = fileURLToPath(new URL('..', import.meta.url));
const ENTREE = join(RACINE_COEUR, 'dist/server/entry.mjs');
const ORIGINE = 'http://127.0.0.1:4321';

type App = Awaited<ReturnType<typeof construireServeur>>;
type Route = { methode: string; chemin: string };

/** Routes d'interface : un fichier .astro de coeur/src/pages = une route (les routes dynamiques sont refusées). */
function routesAstro(dossier = join(RACINE_COEUR, 'src/pages'), prefixe = ''): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const complet = join(dossier, nom);
    if (statSync(complet).isDirectory()) return routesAstro(complet, `${prefixe}/${nom}`);
    if (!nom.endsWith('.astro')) return [];
    if (nom.includes('[')) throw new Error(`route dynamique ${prefixe}/${nom} : à déclarer explicitement dans le test`);
    const base = nom.slice(0, -'.astro'.length);
    return [base === 'index' ? prefixe || '/' : `${prefixe}/${base}`];
  });
}

/**
 * Toute route qui répond sans session (ni redirection vers /connexion, ni 401/403) doit figurer dans
 * routes-publiques.ts. Rend les chemins fautifs.
 */
async function routesOuvertesNonDeclarees(app: App, routes: readonly Route[]): Promise<string[]> {
  const fautives: string[] = [];
  for (const { methode, chemin } of routes) {
    const reponse = await app.inject({ method: methode as 'GET', url: chemin.replace('/*', '/exemple') });
    const location = String(reponse.headers['location'] ?? '');
    const protegee = (reponse.statusCode === 303 || reponse.statusCode === 302) && location.startsWith('/connexion') ? location.startsWith('/connexion?retour=') || location === '/connexion' : false;
    const refusee = reponse.statusCode === 401 || reponse.statusCode === 403;
    if (!protegee && !refusee && !estPublique(chemin) && !ROUTES_AVEC_SESSION_PROPRE.includes(chemin)) fautives.push(`${methode} ${chemin} (${reponse.statusCode})`);
  }
  return fautives;
}

describe('garde et routes d’authentification', () => {
  let app: App;
  let banc: BancDeTest;
  let faux: FauxFournisseur;
  const vues: Route[] = [];
  let cookieSession = '';
  let jetonValide = '';

  beforeAll(async () => {
    if (!existsSync(ENTREE)) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    faux = await demarrerFauxFournisseur({ finSession: true });
    banc = creerServicesDeTest(new ClientOidc({ emetteur: faux.emetteur, clientId: faux.clientId, clientSecret: faux.clientSecret, urlPublique: ORIGINE }));
    const marqueId = await banc.marques.creer();
    jetonValide = (await banc.jetons.creer({ marqueId, utilisateurId: idUtilisateur(marqueId, 'sub-benjamin'), sub: 'sub-benjamin', nom: 'test', portees: ['lecture'], espaceIds: [crypto.randomUUID()], dureeJours: 30 })).clair;
    cookieSession = `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub: 'sub-benjamin', email: undefined, authentifieLe: new Date() })}`;
    app = await construireServeur({
      services: banc.services,
      surRoute: (route) => {
        for (const methode of [route.method].flat()) if (methode !== 'HEAD' && methode !== 'OPTIONS') vues.push({ methode, chemin: route.url });
      },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await faux?.arreter();
  });

  it('renvoie une page protégée vers /connexion avec le chemin relatif demandé', async () => {
    const accueil = await app.inject({ method: 'GET', url: '/' });
    expect(accueil.statusCode).toBeGreaterThanOrEqual(300);
    expect(accueil.statusCode).toBeLessThan(400);
    expect(accueil.headers['location']).toBe('/connexion');
    const autre = await app.inject({ method: 'GET', url: '/?x=1' });
    expect(autre.headers['location']).toBe('/connexion?retour=%2F%3Fx%3D1');
  });

  it('ne se laisse pas tromper par une barre finale ou une redirection ouverte', async () => {
    const pirate = await app.inject({ method: 'GET', url: '//pirate.example/' });
    expect(String(pirate.headers['location'] ?? '')).not.toMatch(/pirate/);
    const retour = await app.inject({ method: 'GET', url: '/connexion?retour=//pirate.example' });
    expect(String(retour.headers['location'])).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/application\/o\/authorize\//);
    expect(retour.headers['cache-control']).toBe('no-store');
  });

  it('laisse passer avec une session, en cache privé', async () => {
    const r = await app.inject({ method: 'GET', url: '/', headers: { cookie: cookieSession } });
    expect(r.statusCode).toBe(200);
    expect(String(r.headers['cache-control'])).toContain('no-store');
    expect(r.body).toContain('/deconnexion');
  });

  it('sert les pages légales sans session, en français', async () => {
    for (const chemin of ['/confidentialite', '/conditions']) {
      const r = await app.inject({ method: 'GET', url: chemin });
      expect(r.statusCode).toBe(200);
      expect(r.body).toContain('lang="fr"');
    }
  });

  it('parcourt la connexion entière par HTTP : /connexion, Authentik, /connexion/retour, session', async () => {
    const debut = await app.inject({ method: 'GET', url: '/connexion?retour=%2Freglages' });
    expect(debut.statusCode).toBe(303);
    const adresse = new URL(String(debut.headers['location']));
    const setCookies = [debut.headers['set-cookie']].flat().map(String);
    const flux = lireCookie(setCookies.find((c) => c.startsWith(COOKIE_FLUX))!.split(';')[0], COOKIE_FLUX)!;
    const code = 'code-http';
    faux.poserCode(code, faux.jetonValide(adresse.searchParams.get('nonce')!), adresse.searchParams.get('code_challenge')!);
    const retour = await app.inject({
      method: 'GET',
      url: `/connexion/retour?code=${code}&state=${adresse.searchParams.get('state')}`,
      headers: { cookie: `${COOKIE_FLUX}=${flux}` },
    });
    expect(retour.statusCode).toBe(303);
    expect(retour.headers['location']).toBe('/reglages');
    const cookies = [retour.headers['set-cookie']].flat().map(String);
    const session = cookies.find((c) => c.startsWith(`${COOKIE_SESSION}=`))!;
    expect(session).toMatch(/HttpOnly; Secure; SameSite=Lax$/);
    const page = await app.inject({ method: 'GET', url: '/', headers: { cookie: session.split(';')[0] } });
    expect(page.statusCode).toBe(200);
  });

  it('retour sans flux : message de refus, rien n’est créé', async () => {
    const avant = banc.sessions.lignes.size;
    const r = await app.inject({ method: 'GET', url: '/connexion/retour?code=x&state=y' });
    expect(r.headers['location']).toBe('/connexion/message?motif=flux');
    expect(banc.sessions.lignes.size).toBe(avant);
    const message = await app.inject({ method: 'GET', url: '/connexion/message?motif=flux' });
    expect(message.statusCode).toBe(200);
  });

  it('POST /deconnexion : refuse sans Origin, avec une autre Origin et sans session ; révoque sinon', async () => {
    const sans = await app.inject({ method: 'POST', url: '/deconnexion', headers: { cookie: cookieSession } });
    expect(sans.statusCode).toBe(403);
    const autre = await app.inject({ method: 'POST', url: '/deconnexion', headers: { cookie: cookieSession, origin: 'https://pirate.example' } });
    expect(autre.statusCode).toBe(403);
    const sansSession = await app.inject({ method: 'POST', url: '/deconnexion', headers: { origin: ORIGINE } });
    expect(sansSession.statusCode).toBe(401);
    const get = await app.inject({ method: 'GET', url: '/deconnexion', headers: { cookie: cookieSession } });
    expect(get.statusCode).toBe(404);
    expect(banc.audit.lignes.some((l) => l.action === 'deconnexion')).toBe(false);

    const ok = await app.inject({ method: 'POST', url: '/deconnexion', headers: { cookie: cookieSession, origin: ORIGINE, 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    expect(ok.statusCode).toBe(303);
    expect(ok.headers['location']).toBe(faux.finSession);
    expect(String([ok.headers['set-cookie']].flat()[0])).toContain('Max-Age=0');
    const apres = await app.inject({ method: 'GET', url: '/', headers: { cookie: cookieSession } });
    expect(apres.headers['location']).toContain('/connexion');
    expect(banc.audit.lignes.at(-1)).toMatchObject({ action: 'deconnexion' });
  });

  it('/mcp : 401 sans jeton ou avec un mauvais, passe avec le bon', async () => {
    const sans = await app.inject({ method: 'POST', url: '/mcp' });
    expect(sans.statusCode).toBe(401);
    expect(sans.headers['www-authenticate']).toMatch(/^Bearer/);
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: 'Bearer mauvais-jeton' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: 'Basic abcdefghij' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${jetonValide}` } })).statusCode).not.toBe(401);
  });

  it('/v/* : 403 sans signature valide, signature expirée ou chemin différent', async () => {
    expect((await app.inject({ method: 'GET', url: '/v/a.mp4' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v/a.mp4?e=9999999999&s=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })).statusCode).toBe(403);
    const bonne = signerAdresse(banc.services.cleAdresses, '/v/a.mp4', { maintenant: banc.horloge.t, dureeS: 600 });
    expect((await app.inject({ method: 'GET', url: bonne })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: bonne.replace('/v/a.mp4', '/v/b.mp4') })).statusCode).toBe(403);
    const vieille = signerAdresse(banc.services.cleAdresses, '/v/a.mp4', { maintenant: banc.horloge.t - 7200_000, dureeS: 600 });
    expect((await app.inject({ method: 'GET', url: vieille })).statusCode).toBe(403);
  });

  describe('liste unique des routes publiques', () => {
    it('toute route de l’interface et de fastify qui répond sans session est déclarée dans routes-publiques.ts', async () => {
      const routes: Route[] = [
        ...routesAstro().map((chemin) => ({ methode: 'GET', chemin })),
        ...vues.filter((r) => !ROUTES_STATIQUES.includes(r.chemin)),
      ];
      expect(routes.length).toBeGreaterThan(5);
      expect(await routesOuvertesNonDeclarees(app, routes)).toEqual([]);
    });

    it('toute route déclarée publique existe vraiment (page ou route fastify) : pas de déclaration oubliée', () => {
      const existantes = new Set([...routesAstro(), ...vues.map((r) => normaliser(r.chemin))]);
      for (const { chemin } of ROUTES_PUBLIQUES) expect(existantes.has(chemin), chemin).toBe(true);
    });

    it('échoue sur une route non déclarée qui répondrait sans session', async () => {
      const autre = await construireServeur({ services: banc.services });
      autre.get('/secret', async () => ({ donnee: 'confidentielle' }));
      await autre.ready();
      try {
        expect(await routesOuvertesNonDeclarees(autre, [{ methode: 'GET', chemin: '/secret' }])).toEqual(['GET /secret (200)']);
      } finally {
        await autre.close();
      }
    });
  });
});
