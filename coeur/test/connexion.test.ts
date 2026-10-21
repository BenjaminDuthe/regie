// Histoire 1.14 : déroulé complet de la connexion contre le faux Authentik, avec des magasins en mémoire.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exigerAuthRecente } from '../src/auth/auth-recente.ts';
import { deconnecter, demarrerConnexion, terminerConnexion } from '../src/auth/connexion.ts';
import { COOKIE_FLUX, COOKIE_SESSION, lireCookie } from '../src/auth/cookies.ts';
import type { Services } from '../src/auth/services.ts';
import { verifierChaine } from '../src/infra/audit.ts';
import { ClientOidc } from '../src/infra/oidc.ts';
import { creerServicesDeTest, demarrerFauxFournisseur, type BancDeTest, type FauxFournisseur } from './faux-auth.ts';

describe('connexion par Authentik', () => {
  let faux: FauxFournisseur;
  let banc: BancDeTest;

  beforeAll(async () => {
    faux = await demarrerFauxFournisseur({ finSession: true });
  });
  afterAll(async () => {
    await faux.arreter();
  });
  beforeEach(() => {
    banc = creerServicesDeTest(new ClientOidc({ emetteur: faux.emetteur, clientId: faux.clientId, clientSecret: faux.clientSecret, urlPublique: 'http://127.0.0.1:4321' }));
  });

  const valeurCookie = (cookies: readonly string[], nom: string) => lireCookie(cookies.find((c) => c.startsWith(`${nom}=`))?.split(';')[0], nom);

  /** Joue le début, puis Authentik : rend ce que le navigateur renverrait sur /connexion/retour. */
  async function parcours(options: { retour?: string; recente?: boolean; claims?: Record<string, unknown>; nonceFaux?: boolean } = {}) {
    const debut = await demarrerConnexion(banc.services, { retour: options.retour, recente: options.recente ?? false });
    const adresse = new URL(debut.location);
    const code = `code-${Math.random().toString(36).slice(2)}`;
    const nonce = options.nonceFaux ? 'autre' : adresse.searchParams.get('nonce')!;
    faux.poserCode(code, faux.jetonValide(nonce, options.claims), adresse.searchParams.get('code_challenge')!);
    const cookieFlux = valeurCookie(debut.cookies, COOKIE_FLUX)!;
    return { debut, adresse, code, cookieFlux, state: adresse.searchParams.get('state')! };
  }
  type P = Awaited<ReturnType<typeof parcours>>;
  const retour = (p: P, surcharge: Partial<Parameters<typeof terminerConnexion>[1]> = {}, services: Services = banc.services) =>
    terminerConnexion(services, { code: p.code, state: p.state, erreur: undefined, cookieFlux: p.cookieFlux, cookieSession: undefined, ...surcharge });

  it('démarre : PKCE S256, state et nonce aléatoires, cookie de flux __Host- HttpOnly Secure Lax', async () => {
    const { debut, adresse, state } = await parcours();
    expect(adresse.searchParams.get('code_challenge_method')).toBe('S256');
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(adresse.searchParams.get('redirect_uri')).toBe(faux.redirectUri);
    expect(debut.cookies[0]).toMatch(/^__Host-regie_flux=[A-Za-z0-9_-]+; Max-Age=600; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    expect((await parcours()).state).not.toBe(state);
  });

  it('connecte l’utilisateur autorisé : crée la marque Établia, la session et écrit « connexion » au journal', async () => {
    const r = await retour(await parcours({ retour: '/relire?x=1' }));
    expect(r).toMatchObject({ ok: true, location: '/relire?x=1' });
    if (!r.ok) return;
    expect(r.cookies.find((c) => c.startsWith(`${COOKIE_SESSION}=`))).toMatch(/; Max-Age=604800; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    expect(r.cookies).toContain(`${COOKIE_FLUX}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
    expect(banc.marques.ids).toHaveLength(1);
    const session = await banc.sessions.trouver(valeurCookie(r.cookies, COOKIE_SESSION)!);
    expect(session).toMatchObject({ sub: 'sub-benjamin', email: 'benjamin@exemple.test', marqueId: banc.marques.ids[0] });
    expect(banc.audit.lignes.map((l) => l.action)).toEqual(['espace_cree', 'espace_cree', 'connexion']);
    expect(banc.audit.lignes[2]).toMatchObject({ acteur: 'sub-benjamin', action: 'connexion', objet: 'session' });
  });

  it('ne stocke que le SHA-256 de l’identifiant de session', async () => {
    const r = await retour(await parcours());
    if (!r.ok) throw new Error('connexion attendue');
    const identifiant = valeurCookie(r.cookies, COOKIE_SESSION)!.split('.')[1]!;
    expect(banc.sessions.lignes.size).toBe(1);
    for (const empreinte of banc.sessions.lignes.keys()) {
      expect(empreinte).toHaveLength(64);
      expect(empreinte).not.toContain(identifiant);
    }
  });

  it('refuse un autre sub et l’écrit au journal (échec) sans le jeton', async () => {
    await banc.marques.creer();
    const r = await retour(await parcours({ claims: { sub: 'sub-pirate', email: 'pirate@exemple.test' } }));
    expect(r).toMatchObject({ ok: false, motif: 'non_autorise' });
    expect(banc.sessions.lignes.size).toBe(0);
    expect(banc.audit.lignes).toHaveLength(1);
    expect(banc.audit.lignes[0]).toMatchObject({ action: 'connexion_echec', details: { cause: 'utilisateur_non_autorise', sub: 'sub-pirate' } });
    expect(JSON.stringify(banc.audit.lignes)).not.toMatch(/eyJ/);
  });

  it('accepte l’e-mail autorisé seulement s’il est vérifié par Authentik', async () => {
    const services: Services = { ...banc.services, admin: { sub: undefined, email: 'benjamin@exemple.test' } };
    const ok = await parcours({ claims: { sub: 'autre-sub' } });
    expect(await retour(ok, {}, services)).toMatchObject({ ok: true });
    const non = await parcours({ claims: { sub: 'autre-sub', email_verified: false } });
    expect(await retour(non, {}, services)).toMatchObject({ ok: false, motif: 'non_autorise' });
  });

  it('refuse tout le monde quand aucun utilisateur n’est désigné', async () => {
    const services: Services = { ...banc.services, admin: { sub: undefined, email: undefined } };
    expect(await retour(await parcours(), {}, services)).toMatchObject({ ok: false, motif: 'non_autorise' });
  });

  it('refuse un state différent, un flux absent, expiré ou falsifié', async () => {
    const p = await parcours();
    expect(await retour(p, { state: 'autre-state' })).toMatchObject({ ok: false, motif: 'flux' });
    expect(await retour(p, { state: undefined })).toMatchObject({ ok: false, motif: 'flux' });
    expect(await retour(p, { cookieFlux: undefined })).toMatchObject({ ok: false, motif: 'flux' });
    expect(await retour(p, { cookieFlux: `${p.cookieFlux.slice(0, -4)}AAAA` })).toMatchObject({ ok: false, motif: 'flux' });
    banc.horloge.t += 11 * 60_000;
    expect(await retour(p)).toMatchObject({ ok: false, motif: 'flux' });
    expect(banc.sessions.lignes.size).toBe(0);
  });

  it('refuse un id_token au nonce étranger et une erreur renvoyée par Authentik', async () => {
    expect(await retour(await parcours({ nonceFaux: true }))).toMatchObject({ ok: false, motif: 'jeton' });
    expect(await retour(await parcours(), { code: undefined, erreur: 'access_denied' })).toMatchObject({ ok: false, motif: 'refuse' });
  });

  it('refuse un code rejoué (usage unique)', async () => {
    const p = await parcours();
    expect(await retour(p)).toMatchObject({ ok: true });
    expect(await retour(p)).toMatchObject({ ok: false, motif: 'fournisseur' });
  });

  it('sans Authentik configuré, la connexion est impossible', async () => {
    const services: Services = { ...banc.services, oidc: undefined };
    await expect(demarrerConnexion(services, { retour: '/', recente: false })).rejects.toMatchObject({ motif: 'non_configuree' });
  });

  it('refuse plusieurs marques en V1', async () => {
    await banc.marques.creer();
    await banc.marques.creer();
    expect(await retour(await parcours())).toMatchObject({ ok: false, motif: 'marque' });
  });

  it('un retour vers une adresse étrangère est ramené à /', async () => {
    expect(await retour(await parcours({ retour: 'https://pirate.example/' }))).toMatchObject({ ok: true, location: '/' });
  });

  it('une connexion récente exige un auth_time de moins de 10 minutes et remplace l’ancienne session', async () => {
    const r1 = await retour(await parcours());
    if (!r1.ok) throw new Error('connexion attendue');
    const ancienne = valeurCookie(r1.cookies, COOKIE_SESSION)!;

    const vieille = await parcours({ recente: true, claims: { auth_time: Math.floor(Date.now() / 1000) - 3600 } });
    expect(vieille.adresse.searchParams.get('max_age')).toBe('600');
    expect(await retour(vieille, { cookieSession: ancienne })).toMatchObject({ ok: false, motif: 'auth_ancienne' });
    expect(await banc.sessions.trouver(ancienne)).toBeDefined();

    expect(await retour(await parcours({ recente: true }), { cookieSession: ancienne })).toMatchObject({ ok: true });
    expect(await banc.sessions.trouver(ancienne)).toBeUndefined();
  });

  it('déconnecte : révoque la session, écrit « deconnexion », renvoie vers la fin de session d’Authentik', async () => {
    const r = await retour(await parcours());
    if (!r.ok) throw new Error('connexion attendue');
    const cookie = valeurCookie(r.cookies, COOKIE_SESSION)!;
    const fin = await deconnecter(banc.services, cookie);
    expect(fin.location).toBe(faux.finSession);
    expect(fin.cookies[0]).toContain('Max-Age=0');
    expect(await banc.sessions.trouver(cookie)).toBeUndefined();
    expect(banc.audit.lignes.map((l) => l.action)).toEqual(['espace_cree', 'espace_cree', 'connexion', 'deconnexion']);
    expect(verifierChaine(banc.audit.lignes)).toBeUndefined();
  });

  it('sans fin de session annoncée, la déconnexion renvoie vers la page de message', async () => {
    const services: Services = { ...banc.services, oidc: { urlFinSession: async () => undefined } as unknown as Services['oidc'] };
    expect((await deconnecter(services, undefined)).location).toBe('/connexion/message?motif=deconnecte');
  });
});

describe('authentification récente', () => {
  const session = (ilYa: number) => ({ authentifieLe: new Date(Date.now() - ilYa) });
  it('laisse passer sous 10 minutes', () => {
    expect(exigerAuthRecente(session(60_000), '/cles')).toBeUndefined();
  });
  it('renvoie vers Authentik avec le chemin de retour au-delà de 10 minutes', () => {
    expect(exigerAuthRecente(session(11 * 60_000), '/cles?x=1')).toBe('/connexion?recente=1&retour=%2Fcles%3Fx%3D1');
  });
  it('ne renvoie jamais vers une adresse extérieure', () => {
    expect(exigerAuthRecente(session(3600_000), 'https://pirate.example/')).toBe('/connexion?recente=1&retour=%2F');
  });
});
