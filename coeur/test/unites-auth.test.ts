// Histoire 1.14 : briques sans réseau ni base — cookies, sessions, journal chaîné, adresses signées, garde.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signerAdresse, verifierAdresse, DUREE_MAX_ADRESSE_S } from '../src/auth/adresses-signees.ts';
import { COOKIE_SESSION, lireCookie, serialiserCookie } from '../src/auth/cookies.ts';
import { HACHE_INITIAL, chainer, jsonCanonique, verifierChaine, verifierSansSecret, type LigneAudit } from '../src/infra/audit.ts';
import { composerCookie, decomposerCookie, hacherIdentifiant, nouvelIdentifiant } from '../src/infra/sessions.ts';
import { decider } from '../src/garde.ts';
import { estPublique, retourSur } from '../src/routes-publiques.ts';
import { creerServicesDeTest } from './faux-auth.ts';

const MARQUE = '3f2b8c1e-5a4d-4e6f-9a1b-0c2d3e4f5a6b';

describe('cookies', () => {
  it('serialise __Host- HttpOnly Secure SameSite=Lax Path=/ sans Domain', () => {
    const c = serialiserCookie(COOKIE_SESSION, 'abc', 60);
    expect(c).toBe('__Host-regie_session=abc; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax');
    expect(c).not.toMatch(/Domain/i);
  });
  it('lit le bon cookie parmi plusieurs et ignore les autres', () => {
    expect(lireCookie('a=1; __Host-regie_session=zzz; b=2', COOKIE_SESSION)).toBe('zzz');
    expect(lireCookie('a=1', COOKIE_SESSION)).toBeUndefined();
    expect(lireCookie(undefined, COOKIE_SESSION)).toBeUndefined();
  });
});

describe('identifiant de session', () => {
  it('32 octets aléatoires (43 caractères base64url), jamais deux fois le même', () => {
    const a = nouvelIdentifiant();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nouvelIdentifiant()).not.toBe(a);
  });
  it('seul le SHA-256 est calculé pour le stockage', () => {
    expect(hacherIdentifiant('x')).toHaveLength(32);
  });
  it('compose et décompose le cookie, refuse tout ce qui n’a pas la forme', () => {
    const id = nouvelIdentifiant();
    expect(decomposerCookie(composerCookie(MARQUE, id))).toEqual({ marqueId: MARQUE, identifiant: id });
    for (const mauvais of [undefined, '', 'abc', `${MARQUE}.court`, `pas-un-uuid.${id}`, `${MARQUE}.${id}.extra`, `${MARQUE}.${id}'--`]) {
      expect(decomposerCookie(mauvais)).toBeUndefined();
    }
  });
});

describe('journal d’audit chaîné', () => {
  const ligne = (precedent: string | undefined, action: string) =>
    chainer(MARQUE, { acteur: 'sub-1', action, objet: 'session', details: { origine: 'interface' } }, precedent, new Date('2026-10-21T10:00:00Z'));

  it('chaîne chaque ligne à la précédente par SHA-256', () => {
    const a = ligne(undefined, 'connexion');
    const b = ligne(a.hache, 'deconnexion');
    expect(a.hachePrecedent).toBe(HACHE_INITIAL);
    expect(b.hachePrecedent).toBe(a.hache);
    expect(a.hache).toMatch(/^[0-9a-f]{64}$/);
    expect(verifierChaine([a, b])).toBeUndefined();
  });
  it('détecte une ligne modifiée, supprimée ou réordonnée', () => {
    const a = ligne(undefined, 'connexion');
    const b = ligne(a.hache, 'deconnexion');
    const c = ligne(b.hache, 'connexion');
    const falsifiee: LigneAudit = { ...b, acteur: 'autre' };
    expect(verifierChaine([a, falsifiee, c])).toBe(1);
    expect(verifierChaine([a, c])).toBe(1);
    expect(verifierChaine([b, a, c])).toBe(0);
  });
  it('le JSON canonique ne dépend pas de l’ordre des clés', () => {
    expect(jsonCanonique({ b: 1, a: { d: 2, c: 3 } })).toBe(jsonCanonique({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it('refuse d’écrire un secret, une clé sensible ou un jeton dans les détails', () => {
    expect(() => verifierSansSecret({ origine: 'interface' })).not.toThrow();
    expect(() => verifierSansSecret({ token: 'x' })).toThrow();
    expect(() => verifierSansSecret({ imbrique: { code_verifier: 'x' } })).toThrow();
    expect(() => verifierSansSecret({ note: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln' })).toThrow();
    expect(() => verifierSansSecret({ note: 'Bearer abcdefghijkl' })).toThrow();
    expect(() => chainer(MARQUE, { acteur: 'a', action: 'x', objet: 'y', details: { secret: 1 } }, undefined, new Date())).toThrow();
  });
});

describe('adresses signées /v/*', () => {
  const cle = randomBytes(32);
  const MAINTENANT = Date.UTC(2026, 9, 21, 10, 0, 0);
  const analyser = (adresse: string) => {
    const u = new URL(adresse, 'http://x');
    return { chemin: u.pathname, e: u.searchParams.get('e'), s: u.searchParams.get('s') };
  };

  it('valide une adresse fraîche, refuse une signature d’un autre chemin ou d’une autre clé', () => {
    const { chemin, e, s } = analyser(signerAdresse(cle, '/v/a/b.mp4', { maintenant: MAINTENANT, dureeS: 600 }));
    expect(verifierAdresse(cle, chemin, e, s, MAINTENANT)).toBe('valide');
    expect(verifierAdresse(cle, '/v/autre.mp4', e, s, MAINTENANT)).toBe('signature');
    expect(verifierAdresse(randomBytes(32), chemin, e, s, MAINTENANT)).toBe('signature');
    expect(verifierAdresse(cle, chemin, String(Number(e) + 1), s, MAINTENANT)).toBe('signature');
  });
  it('expire', () => {
    const { chemin, e, s } = analyser(signerAdresse(cle, '/v/x.mp4', { maintenant: MAINTENANT, dureeS: 60 }));
    expect(verifierAdresse(cle, chemin, e, s, MAINTENANT + 61_000)).toBe('expiree');
  });
  it('refuse de signer plus d’une heure, et de croire une signature de plus d’une heure', () => {
    expect(() => signerAdresse(cle, '/v/x', { dureeS: DUREE_MAX_ADRESSE_S + 1 })).toThrow(RangeError);
    expect(() => signerAdresse(cle, '/v/x', { dureeS: 0 })).toThrow(RangeError);
    const { chemin, e, s } = analyser(signerAdresse(cle, '/v/x', { maintenant: MAINTENANT, dureeS: DUREE_MAX_ADRESSE_S }));
    expect(verifierAdresse(cle, chemin, e, s, MAINTENANT)).toBe('valide');
    expect(verifierAdresse(cle, chemin, e, s, MAINTENANT - 5_000)).toBe('trop_longue');
  });
  it('refuse les paramètres absents ou mal formés', () => {
    expect(verifierAdresse(cle, '/v/x', null, null)).toBe('mal_formee');
    expect(verifierAdresse(cle, '/v/x', 'abc', 'courte')).toBe('mal_formee');
  });
});

describe('routes publiques et retour sûr', () => {
  it('reconnaît les routes déclarées, avec ou sans barre finale', () => {
    for (const p of ['/sante', '/connexion', '/connexion/retour', '/confidentialite', '/conditions', '/conditions/', '/mcp', '/v/a/b']) expect(estPublique(p)).toBe(true);
    for (const p of ['/', '/reglages', '/v', '/v/', '/mcp/x', '/connexion/autre/chose', '/deconnexion']) expect(estPublique(p)).toBe(false);
  });
  it('ne redirige jamais hors de regie', () => {
    for (const mauvais of ['//pirate.example', 'https://pirate.example', '/\\pirate.example', '/\t/pirate.example', 'javascript:alert(1)', `/${'a'.repeat(600)}`, '/connexion', '/connexion/retour?x=1', '', null, undefined]) {
      expect(retourSur(mauvais)).toBe('/');
    }
    expect(retourSur('/relire?x=1&y=2')).toBe('/relire?x=1&y=2');
  });
});

describe('garde', () => {
  it('laisse passer une route publique sans session, renvoie les autres vers /connexion avec le chemin relatif', async () => {
    const banc = creerServicesDeTest(undefined);
    expect(await decider({ chemin: '/confidentialite', recherche: '', cookie: undefined }, banc.sessions)).toEqual({ session: undefined, redirection: undefined });
    expect((await decider({ chemin: '/', recherche: '', cookie: undefined }, banc.sessions)).redirection).toBe('/connexion');
    expect((await decider({ chemin: '/relire', recherche: '?id=3', cookie: undefined }, banc.sessions)).redirection).toBe('/connexion?retour=%2Frelire%3Fid%3D3');
    expect((await decider({ chemin: '//pirate.example', recherche: '', cookie: undefined }, banc.sessions)).redirection).toBe('/connexion');
  });
  it('laisse passer avec une session valide, refuse une session inconnue, expirée ou révoquée', async () => {
    const banc = creerServicesDeTest(undefined);
    const marqueId = await banc.marques.creer();
    const valeur = await banc.sessions.creer({ marqueId, sub: 's', email: undefined, authentifieLe: new Date() });
    const avec = (v: string) => ({ chemin: '/reglages', recherche: '', cookie: `${COOKIE_SESSION}=${v}` });
    expect((await decider(avec(valeur), banc.sessions)).session).toMatchObject({ sub: 's' });
    expect((await decider(avec(`${marqueId}.${nouvelIdentifiant()}`), banc.sessions)).redirection).toBe('/connexion?retour=%2Freglages');
    banc.horloge.t += 8 * 24 * 3600_000;
    expect((await decider(avec(valeur), banc.sessions)).redirection).toBeDefined();
    const frais = creerServicesDeTest(undefined);
    const m = await frais.marques.creer();
    const v = await frais.sessions.creer({ marqueId: m, sub: 's', email: undefined, authentifieLe: new Date() });
    await frais.sessions.revoquer(v);
    expect((await decider(avec(v), frais.sessions)).redirection).toBeDefined();
  });
});
