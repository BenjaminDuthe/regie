// regie — déroulé de la connexion par Authentik (histoire 1.14, FR-72).
// démarrer : state, nonce et vérificateur PKCE tirés au hasard, scellés dans un cookie court (coffre AES-GCM) —
//            aucun état côté serveur — puis renvoi vers Authentik.
// terminer : le retour d'Authentik est vérifié (state, code, id_token), l'utilisateur doit être celui que
//            REGIE_ADMIN_SUB / REGIE_ADMIN_EMAIL désigne, la session est créée (nouvel identifiant : pas de fixation).
// déconnecter : la session est révoquée ; Authentik est prévenu s'il annonce une fin de session.
// Chaque issue (connexion, échec, déconnexion) est écrite au journal d'audit chaîné.

import { timingSafeEqual } from 'node:crypto';
import { ErreurOidc, aleatoire, defiPkce } from '../infra/oidc.ts';
import { NOM_MARQUE_UNIQUE } from '../infra/marques.ts';
import { DUREE_SESSION_MS, decomposerCookie } from '../infra/sessions.ts';
import { retourSur } from '../routes-publiques.ts';
import { AUTH_RECENTE_MAX_S } from './auth-recente.ts';
import { COOKIE_FLUX, COOKIE_SESSION, DUREE_FLUX_S, effacerCookie, serialiserCookie } from './cookies.ts';
import type { Services } from './services.ts';

export type Motif =
  | 'non_configuree'
  | 'fournisseur'
  | 'flux'
  | 'refuse'
  | 'jeton'
  | 'auth_ancienne'
  | 'non_autorise'
  | 'marque'
  | 'deconnecte';

export class ErreurConnexion extends Error {
  readonly motif: Motif;

  constructor(motif: Motif) {
    super(`connexion impossible : ${motif}`);
    this.name = 'ErreurConnexion';
    this.motif = motif;
  }
}

/** `max_age` d'une connexion ordinaire : la durée d'une session. */
const MAX_AGE_SESSION_S = Math.floor(DUREE_SESSION_MS / 1000);

type Flux = Readonly<{ s: string; n: string; v: string; r: string; m: number | null; e: number }>;

const CONTEXTE_FLUX = Object.freeze({ secretId: 'flux-connexion', marqueId: 'connexion', type: 'flux' });

function egal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type RedirectionAvecCookies = Readonly<{ location: string; cookies: readonly string[] }>;

/** Début de la connexion. `recente` : l'action sensible exige une authentification de moins de 10 minutes. */
export async function demarrerConnexion(services: Services, options: { retour: string | null | undefined; recente: boolean }): Promise<RedirectionAvecCookies> {
  if (services.oidc === undefined) throw new ErreurConnexion('non_configuree');
  const flux: Flux = {
    s: aleatoire(),
    n: aleatoire(),
    v: aleatoire(),
    r: retourSur(options.retour),
    m: options.recente ? AUTH_RECENTE_MAX_S : null,
    e: services.maintenant() + DUREE_FLUX_S * 1000,
  };
  let location: string;
  try {
    location = await services.oidc.urlAutorisation({
      state: flux.s,
      nonce: flux.n,
      challenge: defiPkce(flux.v),
      // Toujours demandé : Authentik renvoie alors auth_time, dont la session s'appuie.
      maxAge: flux.m ?? MAX_AGE_SESSION_S,
    });
  } catch (erreur) {
    if (erreur instanceof ErreurOidc) throw new ErreurConnexion('fournisseur');
    throw erreur;
  }
  const scelle = services.coffre.chiffrer(JSON.stringify(flux), CONTEXTE_FLUX).toString('base64url');
  return { location, cookies: [serialiserCookie(COOKIE_FLUX, scelle, DUREE_FLUX_S)] };
}

function ouvrirFlux(services: Services, valeur: string | undefined): Flux | undefined {
  if (valeur === undefined || !/^[A-Za-z0-9_-]+$/.test(valeur)) return undefined;
  try {
    const flux = JSON.parse(services.coffre.dechiffrer(Buffer.from(valeur, 'base64url'), CONTEXTE_FLUX).toString('utf8')) as Flux;
    if (typeof flux.s !== 'string' || typeof flux.n !== 'string' || typeof flux.v !== 'string' || typeof flux.r !== 'string') return undefined;
    if (typeof flux.e !== 'number' || flux.e < services.maintenant()) return undefined;
    return flux;
  } catch {
    return undefined;
  }
}

function autorise(services: Services, sub: string, email: string | undefined, emailVerifie: boolean): boolean {
  const { sub: subAutorise, email: emailAutorise } = services.admin;
  // Si REGIE_ADMIN_SUB est défini, seul le sub compte : l'e-mail n'ouvre jamais la porte.
  if (subAutorise !== undefined) return egal(sub, subAutorise);
  // Repli opt-in (REGIE_ADMIN_EMAIL seul) : l'e-mail n'engage qu'une fois vérifié par Authentik (email_verified).
  return emailAutorise !== undefined && email !== undefined && emailVerifie && egal(email.toLowerCase(), emailAutorise.toLowerCase());
}

/** Écrit un échec au journal si une marque existe déjà ; ne masque jamais le refus par une panne du journal. */
async function journaliserEchec(services: Services, cause: string, sub?: string): Promise<void> {
  try {
    const marque = await services.marques.trouverUnique();
    if (marque.etat !== 'une') return;
    await services.audit.ajouter(marque.id, {
      acteur: 'inconnu',
      action: 'connexion_echec',
      objet: 'session',
      details: { origine: 'interface', cause, ...(sub !== undefined ? { sub } : {}) },
    });
  } catch {
    // le refus prime
  }
}

export type ResultatRetour =
  | Readonly<{ ok: true; location: string; cookies: readonly string[] }>
  | Readonly<{ ok: false; motif: Motif; cookies: readonly string[] }>;

export async function terminerConnexion(
  services: Services,
  recu: Readonly<{ code: string | undefined; state: string | undefined; erreur: string | undefined; cookieFlux: string | undefined; cookieSession: string | undefined }>,
): Promise<ResultatRetour> {
  const nettoyer = [effacerCookie(COOKIE_FLUX)];
  const echec = async (motif: Motif, cause: string, sub?: string): Promise<ResultatRetour> => {
    await journaliserEchec(services, cause, sub);
    return { ok: false, motif, cookies: nettoyer };
  };
  if (services.oidc === undefined) return { ok: false, motif: 'non_configuree', cookies: nettoyer };

  const flux = ouvrirFlux(services, recu.cookieFlux);
  if (flux === undefined) return echec('flux', 'flux_absent_ou_expire');
  if (recu.erreur !== undefined) return echec('refuse', 'refuse_par_authentik');
  if (recu.state === undefined || !egal(recu.state, flux.s)) return echec('flux', 'state_different');
  if (recu.code === undefined || recu.code === '' || recu.code.length > 2048) return echec('flux', 'code_absent');

  let claims;
  try {
    const idToken = await services.oidc.echangerCode(recu.code, flux.v);
    claims = await services.oidc.verifierJeton(idToken, { nonce: flux.n, maxAge: flux.m ?? MAX_AGE_SESSION_S });
  } catch (erreur) {
    if (!(erreur instanceof ErreurOidc)) throw erreur;
    if (erreur.code === 'auth_trop_ancienne') return echec('auth_ancienne', erreur.code);
    if (erreur.code === 'echange' || erreur.code === 'decouverte' || erreur.code === 'jwks') return echec('fournisseur', erreur.code);
    return echec('jeton', erreur.code);
  }

  if (!autorise(services, claims.sub, claims.email, claims.emailVerifie)) return echec('non_autorise', 'utilisateur_non_autorise', claims.sub);

  // Une seule marque en V1 : Établia, créée à la première connexion de l'utilisateur autorisé.
  const marque = await services.marques.trouverUnique();
  if (marque.etat === 'plusieurs') return echec('marque', 'plusieurs_marques', claims.sub);
  const marqueId = marque.etat === 'une' ? marque.id : await services.marques.creer(NOM_MARQUE_UNIQUE);

  const maintenant = services.maintenant();
  // Sans auth_time exploitable, la session est tenue pour ancienne (époque) : toute action sensible exigera une réauthentification.
  const authentifieLe = claims.authTime !== undefined && claims.authTime * 1000 <= maintenant ? new Date(claims.authTime * 1000) : new Date(0);
  // Espace personnel (dont la personne est propriétaire) et espace de la marque, créés à la première connexion.
  const { espaces, crees } = await services.espaces.assurer(marqueId, claims.sub, claims.email, NOM_MARQUE_UNIQUE);
  const espacePersonnel = espaces.find((espace) => espace.genre === 'personnel');
  const valeur = await services.sessions.creer({ marqueId, sub: claims.sub, email: claims.email, authentifieLe, espaceActifId: espacePersonnel?.id });
  // Reconnexion (par exemple après une authentification récente) : l'ancienne session ne sert plus.
  if (recu.cookieSession !== undefined) await services.sessions.revoquer(recu.cookieSession);
  for (const espace of crees) {
    await services.audit.ajouter(marqueId, { acteur: claims.sub, action: 'espace_cree', objet: `espace:${espace.id}`, details: { origine: 'interface', genre: espace.genre } });
  }
  await services.audit.ajouter(marqueId, {
    acteur: claims.sub,
    action: 'connexion',
    objet: 'session',
    details: { origine: 'interface', recente: flux.m !== null },
  });
  return {
    ok: true,
    location: flux.r,
    cookies: [...nettoyer, serialiserCookie(COOKIE_SESSION, valeur, Math.floor(DUREE_SESSION_MS / 1000))],
  };
}

/** Révoque la session et rend l'adresse où renvoyer la personne (fin de session Authentik si annoncée). */
export async function deconnecter(services: Services, cookieSession: string | undefined): Promise<RedirectionAvecCookies> {
  const cookies = [effacerCookie(COOKIE_SESSION)];
  const session = cookieSession === undefined ? undefined : await services.sessions.trouver(cookieSession);
  if (cookieSession !== undefined && session !== undefined) {
    await services.sessions.revoquer(cookieSession);
    const cookie = decomposerCookie(cookieSession);
    if (cookie !== undefined) {
      await services.audit.ajouter(cookie.marqueId, { acteur: session.sub, action: 'deconnexion', objet: 'session', details: { origine: 'interface' } });
    }
  }
  let fin: string | undefined;
  try {
    fin = await services.oidc?.urlFinSession();
  } catch {
    fin = undefined;
  }
  return { location: fin ?? '/connexion/message?motif=deconnecte', cookies };
}
