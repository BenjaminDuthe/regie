// regie — garde des pages (histoire 1.14, FR-72) : toute route qui n'est pas dans routes-publiques.ts exige une
// session valide, sinon redirection vers /connexion avec le chemin d'origine (relatif, jamais une adresse absolue).
// Appelée par le middleware d'Astro ; sans import d'env.ts ni de la base, pour rester testable seule.

import { COOKIE_SESSION, lireCookie } from './auth/cookies.ts';
import type { MagasinSessions, Session } from './infra/sessions.ts';
import { estPublique, retourSur } from './routes-publiques.ts';

export type DecisionGarde = Readonly<{ session: Session | undefined; redirection: string | undefined }>;

export async function decider(
  requete: Readonly<{ chemin: string; recherche: string; cookie: string | null | undefined }>,
  sessions: Pick<MagasinSessions, 'trouver'> | undefined,
): Promise<DecisionGarde> {
  const valeur = lireCookie(requete.cookie, COOKIE_SESSION);
  // Une session valide est attachée même sur une route publique : l'en-tête sait alors montrer « Se déconnecter ».
  const session = valeur !== undefined && sessions !== undefined ? await sessions.trouver(valeur) : undefined;
  if (session !== undefined || estPublique(requete.chemin)) return { session, redirection: undefined };
  const retour = retourSur(`${requete.chemin}${requete.recherche}`);
  return { session: undefined, redirection: retour === '/' ? '/connexion' : `/connexion?retour=${encodeURIComponent(retour)}` };
}
