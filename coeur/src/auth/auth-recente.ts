// regie — réauthentification pour les actions sensibles (histoire 1.14, AD-15).
// Saisir une clé, connecter un compte réseau, créer un jeton : si la dernière authentification Authentik date de
// plus de 10 minutes, on renvoie vers Authentik avec max_age=600 avant d'agir. Utilisé par 1.11, 4.3 et 7.1.

import { retourSur } from '../routes-publiques.ts';
import type { Session } from '../infra/sessions.ts';

export const AUTH_RECENTE_MAX_S = 600;

/**
 * Rend `undefined` si l'authentification est assez récente pour agir ; sinon le chemin vers lequel renvoyer
 * la personne (`/connexion?recente=1&retour=…`), qui la redirige vers Authentik avec max_age=600 puis la ramène
 * sur `retour` pour qu'elle recommence l'action.
 */
export function exigerAuthRecente(
  session: Pick<Session, 'authentifieLe'>,
  retour: string,
  options: { maintenant?: number; dureeMaxS?: number } = {},
): string | undefined {
  const maintenant = options.maintenant ?? Date.now();
  const dureeMaxS = options.dureeMaxS ?? AUTH_RECENTE_MAX_S;
  if (maintenant - session.authentifieLe.getTime() <= dureeMaxS * 1000) return undefined;
  return `/connexion?recente=1&retour=${encodeURIComponent(retourSur(retour))}`;
}
