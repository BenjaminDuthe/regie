// Histoire 1.9 : espace personnel dès la première connexion, espace actif, changement d'espace, cloisonnement.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { terminerConnexion, demarrerConnexion } from '../src/auth/connexion.ts';
import { COOKIE_FLUX, COOKIE_SESSION, lireCookie } from '../src/auth/cookies.ts';
import { idUtilisateur } from '../src/infra/espaces.ts';
import { ClientOidc } from '../src/infra/oidc.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerServicesDeTest, demarrerFauxFournisseur, EspacesMemoire, type BancDeTest, type FauxFournisseur } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';

describe('espaces', () => {
  let faux: FauxFournisseur;
  let banc: BancDeTest;
  let app: Awaited<ReturnType<typeof construireServeur>>;

  const cookie = (cookies: readonly string[], nom: string) => lireCookie(cookies.find((c) => c.startsWith(`${nom}=`))?.split(';')[0], nom);

  async function seConnecter(): Promise<string> {
    const debut = await demarrerConnexion(banc.services, { retour: undefined, recente: false });
    const adresse = new URL(debut.location);
    faux.poserCode('code-esp', faux.jetonValide(adresse.searchParams.get('nonce')!), adresse.searchParams.get('code_challenge')!);
    const r = await terminerConnexion(banc.services, {
      code: 'code-esp',
      state: adresse.searchParams.get('state')!,
      erreur: undefined,
      cookieFlux: cookie(debut.cookies, COOKIE_FLUX),
      cookieSession: undefined,
    });
    if (!r.ok) throw new Error('connexion attendue');
    return `${COOKIE_SESSION}=${cookie(r.cookies, COOKIE_SESSION)}`;
  }

  beforeAll(async () => {
    faux = await demarrerFauxFournisseur();
    banc = creerServicesDeTest(new ClientOidc({ emetteur: faux.emetteur, clientId: faux.clientId, clientSecret: faux.clientSecret, urlPublique: ORIGINE }));
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await faux?.arreter();
  });

  it('crée l’espace personnel et celui de la marque à la première connexion, sans les dupliquer à la suivante', async () => {
    const cookieSession = await seConnecter();
    const marqueId = banc.marques.ids[0]!;
    const espaces = await banc.services.espaces.lister(marqueId, 'sub-benjamin');
    expect(espaces.map((e) => e.genre)).toEqual(['personnel', 'marque']);
    expect(espaces.every((e) => e.proprietaireId === idUtilisateur(marqueId, 'sub-benjamin'))).toBe(true);
    // L'espace actif de départ est l'espace personnel.
    const session = await banc.services.sessions.trouver(cookieSession.split('=')[1]!);
    expect(session?.espaceActifId).toBe(espaces[0]!.id);
    await seConnecter();
    expect(await banc.services.espaces.lister(marqueId, 'sub-benjamin')).toHaveLength(2);
    expect(banc.audit.lignes.filter((l) => l.action === 'espace_cree')).toHaveLength(2);
  });

  it('l’en-tête rappelle l’espace actif ; un geste (POST) change d’espace et l’écrit au journal', async () => {
    const cookieSession = await seConnecter();
    const marqueId = banc.marques.ids[0]!;
    const [personnel, marque] = await banc.services.espaces.lister(marqueId, 'sub-benjamin');
    const page = await app.inject({ method: 'GET', url: '/', headers: { cookie: cookieSession } });
    expect(page.body).toMatch(/aria-current="true"[^>]*>Personnel</);
    expect(page.body).toContain(`/espaces/${marque!.id}/activer`);
    expect(page.body).not.toContain(`/espaces/${personnel!.id}/activer`);

    const bascule = await app.inject({ method: 'POST', url: `/espaces/${marque!.id}/activer?retour=%2Frelire`, headers: { cookie: cookieSession, origin: ORIGINE } });
    expect(bascule.statusCode).toBe(303);
    expect(bascule.headers['location']).toBe('/relire');
    const apres = await app.inject({ method: 'GET', url: '/', headers: { cookie: cookieSession } });
    expect(apres.body).toMatch(/aria-current="true"[^>]*>Établia</);
    expect(banc.audit.lignes.at(-1)).toMatchObject({ action: 'espace_change', objet: `espace:${marque!.id}` });
  });

  it('refuse le changement sans Origin, avec une autre Origin, sans session, et vers l’espace d’un autre', async () => {
    const cookieSession = await seConnecter();
    const marqueId = banc.marques.ids[0]!;
    const [personnel] = await banc.services.espaces.lister(marqueId, 'sub-benjamin');
    const url = `/espaces/${personnel!.id}/activer`;
    expect((await app.inject({ method: 'POST', url, headers: { cookie: cookieSession } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url, headers: { cookie: cookieSession, origin: 'https://pirate.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url, headers: { origin: ORIGINE } })).statusCode).toBe(401);
    // L'espace d'une autre personne ne se distingue pas d'un espace inexistant.
    const autre = await banc.services.espaces.assurer(marqueId, 'sub-autre', undefined, 'Établia');
    const refus = await app.inject({ method: 'POST', url: `/espaces/${autre.espaces[0]!.id}/activer`, headers: { cookie: cookieSession, origin: ORIGINE } });
    expect(refus.statusCode).toBe(404);
    expect(refus.statusCode).toBe((await app.inject({ method: 'POST', url: `/espaces/${crypto.randomUUID()}/activer`, headers: { cookie: cookieSession, origin: ORIGINE } })).statusCode);
  });

  it('le faux en mémoire cloisonne comme la RLS : A ne voit pas les espaces de B', async () => {
    const espaces = new EspacesMemoire();
    const marqueId = crypto.randomUUID();
    await espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    await espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
    const deA = await espaces.lister(marqueId, 'sub-a');
    const deB = await espaces.lister(marqueId, 'sub-b');
    expect(deA).toHaveLength(2);
    expect(deA.some((a) => deB.some((b) => b.id === a.id))).toBe(false);
    expect(idUtilisateur(marqueId, 'sub-a')).not.toBe(idUtilisateur(marqueId, 'sub-b'));
    expect(idUtilisateur(marqueId, 'sub-a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
