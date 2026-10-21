// regie — raccorder un compte de réseau par OAuth (histoire 7.6, FR-41, AR-22). Deux temps :
// départ : un `state` tiré au hasard est scellé dans un cookie court, LIÉ À LA SESSION (empreinte du cookie de session),
//          puis la personne est renvoyée vers le réseau. L'adresse de retour (`redirect_uri`) est fixe, tirée de
//          deploiement/reseaux.json : aucune entrée ne la compose.
// retour : le state est comparé en temps constant, la session doit être celle du départ, le code est échangé contre le jeton
//          long, qui va au coffre par l'action `reseau.connecter` (réservée à l'interface). La redirection finale est
//          un chemin fixe de regie, jamais une adresse tirée de la requête.
// Rien de ce qui vient du réseau (code, jeton, corps de réponse) n'est journalisé ni renvoyé à la personne.

import { createHash, timingSafeEqual } from 'node:crypto';
import { RESEAUX_DECLARES, estReseauActif, redirectUri } from '../domaine/reseaux.ts';
import type { Reseau } from '../domaine/bornes.ts';
import { COOKIE_FLUX_RESEAU, DUREE_FLUX_S, effacerCookie, serialiserCookie } from '../auth/cookies.ts';
import { exigerAuthRecente } from '../auth/auth-recente.ts';
import type { Services } from '../auth/services.ts';
import { aleatoire } from '../infra/oidc.ts';
import type { Session } from '../infra/sessions.ts';
import { reseauConnecter } from '../services/actions-reseau.ts';
import { contexteInterface } from '../services/contextes.ts';
import { ErreurMetier } from '../services/erreurs.ts';
import { executerAction } from '../services/registre.ts';
import { estErreurReseau } from './connecteur.ts';

/** Les seules issues que la page sait dire : jamais un texte venu du réseau. */
export const ISSUES_RACCORDEMENT = ['ok', 'refusee', 'session', 'etat', 'echange', 'sans_cle', 'sans_connecteur', 'espace', 'auth_ancienne'] as const;
export type IssueRaccordement = (typeof ISSUES_RACCORDEMENT)[number];

/** Là où l'on revient, toujours : un chemin fixe. */
export const CHEMIN_RESEAUX = '/reseaux';
export const versIssue = (issue: IssueRaccordement): string => `${CHEMIN_RESEAUX}?connexion=${issue}`;

const CONTEXTE_FLUX_RESEAU = Object.freeze({ secretId: 'flux-reseau', marqueId: 'reseau', type: 'flux' });

type FluxReseau = Readonly<{ s: string; h: string; r: Reseau; p: string; e: number }>;

/** Empreinte du cookie de session : lie le state à CETTE session sans jamais copier le cookie. */
export const empreinteSession = (valeurCookieSession: string): string => createHash('sha256').update(valeurCookieSession).digest('hex');

function egal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type SuiteRaccordement = Readonly<{ location: string; cookies: readonly string[] }>;

export async function demarrerRaccordement(
  services: Services,
  p: Readonly<{ reseau: string; session: Session; valeurCookieSession: string }>,
): Promise<SuiteRaccordement> {
  const fin = (issue: IssueRaccordement): SuiteRaccordement => ({ location: versIssue(issue), cookies: [] });
  if (!estReseauActif(p.reseau)) return fin('sans_connecteur');
  const reseau = p.reseau;
  const maintenant = services.maintenant();
  // Relier un compte est sensible (AD-15) : même exigence que saisir une clé.
  const aRefaire = exigerAuthRecente(p.session, CHEMIN_RESEAUX, { maintenant });
  if (aRefaire !== undefined) return { location: aRefaire, cookies: [] };
  const connecteur = services.connecteurs[reseau];
  const uri = redirectUri(services.urlPublique, reseau);
  if (connecteur === undefined || uri === undefined) return fin('sans_connecteur');
  const cle = await services.reseaux.lireCle(p.session.marqueId, reseau);
  if (cle === undefined) return fin('sans_cle');
  // L'espace actif doit être l'un de ceux de la personne (la RLS ne montre rien d'autre).
  const espaceId = p.session.espaceActifId;
  const espaces = await services.espaces.lister(p.session.marqueId, p.session.sub);
  if (espaceId === undefined || !espaces.some((e) => e.id === espaceId)) return fin('espace');
  const state = aleatoire();
  const flux: FluxReseau = { s: state, h: empreinteSession(p.valeurCookieSession), r: reseau, p: espaceId, e: maintenant + DUREE_FLUX_S * 1000 };
  const scelle = services.coffre.chiffrer(JSON.stringify(flux), CONTEXTE_FLUX_RESEAU).toString('base64url');
  const location = connecteur.urlAutorisation({ cle, state, redirectUri: uri, portees: RESEAUX_DECLARES[reseau]!.portees });
  return { location, cookies: [serialiserCookie(COOKIE_FLUX_RESEAU, scelle, DUREE_FLUX_S)] };
}

function ouvrirFlux(services: Services, valeur: string | undefined): FluxReseau | undefined {
  if (valeur === undefined || valeur.length > 2048) return undefined;
  try {
    const flux = JSON.parse(services.coffre.dechiffrer(Buffer.from(valeur, 'base64url'), CONTEXTE_FLUX_RESEAU).toString('utf8')) as Partial<FluxReseau>;
    if (typeof flux.s !== 'string' || typeof flux.h !== 'string' || typeof flux.r !== 'string' || typeof flux.p !== 'string' || typeof flux.e !== 'number') return undefined;
    return flux as FluxReseau;
  } catch {
    return undefined;
  }
}

export async function terminerRaccordement(
  services: Services,
  p: Readonly<{
    reseau: string;
    /** Absente quand la requête n'a pas de session valide. */
    session: Session | undefined;
    valeurCookieSession: string | undefined;
    cookieFlux: string | undefined;
    code: string | undefined;
    state: string | undefined;
    erreur: string | undefined;
  }>,
): Promise<SuiteRaccordement> {
  // Le cookie de flux sert une fois : il est effacé quelle que soit l'issue.
  const clore = (issue: IssueRaccordement): SuiteRaccordement => ({ location: versIssue(issue), cookies: [effacerCookie(COOKIE_FLUX_RESEAU)] });
  if (p.session === undefined || p.valeurCookieSession === undefined) return clore('session');
  if (!estReseauActif(p.reseau)) return clore('sans_connecteur');
  const reseau = p.reseau;
  const flux = ouvrirFlux(services, p.cookieFlux);
  const maintenant = services.maintenant();
  // Le state doit venir de CE navigateur, pour CETTE session, pour CE réseau, et ne pas être périmé.
  if (
    flux === undefined || flux.e <= maintenant || flux.r !== reseau || p.state === undefined || p.state.length > 200 ||
    !egal(flux.s, p.state) || !egal(flux.h, empreinteSession(p.valeurCookieSession))
  ) {
    return clore('etat');
  }
  if (p.erreur !== undefined) return clore('refusee');
  if (p.code === undefined || p.code.length === 0 || p.code.length > 2048) return clore('refusee');
  const connecteur = services.connecteurs[reseau];
  const uri = redirectUri(services.urlPublique, reseau);
  if (connecteur === undefined || uri === undefined) return clore('sans_connecteur');
  const cle = await services.reseaux.lireCle(p.session.marqueId, reseau);
  if (cle === undefined) return clore('sans_cle');
  let obtenu;
  try {
    obtenu = await connecteur.echangerCode({ cle, code: p.code, redirectUri: uri, maintenant: new Date(maintenant) });
  } catch (e) {
    if (!estErreurReseau(e)) throw e;
    return clore('echange');
  }
  try {
    await executerAction(contexteInterface(services, p.session), reseauConnecter, {
      reseau,
      espaceId: flux.p,
      compteExterne: obtenu.compteExterne,
      nom: obtenu.nom,
      jeton: obtenu.jeton,
      expireLe: obtenu.expireLe.toISOString(),
    });
  } catch (e) {
    if (!(e instanceof ErreurMetier)) throw e;
    return clore('espace');
  }
  return clore('ok');
}
