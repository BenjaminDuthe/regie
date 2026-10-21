// regie — routes du raccordement d'un compte de réseau (histoire 7.6) : GET /reseaux/<réseau>/depart et /retour.
// Les deux contrôlent la session elles-mêmes (ROUTES_AVEC_SESSION_PROPRE) ; elles sont bornées par adresse IP avec la
// même limite que le reste (auth/limite-debit.ts). Le départ ne change rien de durable (il pose un cookie court) ;
// le retour n'écrit qu'après vérification du state et de la session, par l'action `reseau.connecter`.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { LimiteDebit } from '../auth/limite-debit.ts';
import { COOKIE_FLUX_RESEAU, COOKIE_SESSION, lireCookie } from '../auth/cookies.ts';
import type { Services } from '../auth/services.ts';
import { RESEAUX_ACTIFS, RESEAUX_DECLARES } from '../domaine/reseaux.ts';
import { demarrerRaccordement, terminerRaccordement, type SuiteRaccordement } from './raccordement.ts';

/** Départs et retours par adresse IP et par dix minutes : largement assez pour une personne, trop peu pour un balayage. */
export const RACCORDEMENTS_PAR_FENETRE = 30;
const FENETRE_MS = 600_000;

export const CHEMIN_DEPART = (reseau: string): string => `/reseaux/${reseau}/depart`;

export function enregistrerRoutesReseau(app: FastifyInstance, services: Services): void {
  const limite = new LimiteDebit(RACCORDEMENTS_PAR_FENETRE, FENETRE_MS, services.maintenant);
  const vers = (reponse: FastifyReply, suite: SuiteRaccordement) => {
    reponse.header('cache-control', 'no-store');
    if (suite.cookies.length > 0) reponse.header('set-cookie', [...suite.cookies]);
    return reponse.redirect(suite.location, 303);
  };
  const texte = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

  for (const reseau of RESEAUX_ACTIFS) {
    app.get(CHEMIN_DEPART(reseau), async (requete, reponse) => {
      if (!limite.permettre(requete.ip)) return reponse.header('cache-control', 'no-store').header('retry-after', '60').code(429).send({ erreur: 'trop_de_demandes' });
      const valeur = lireCookie(requete.headers.cookie, COOKIE_SESSION);
      const session = valeur === undefined ? undefined : await services.sessions.trouver(valeur);
      if (valeur === undefined || session === undefined) return vers(reponse, { location: '/connexion?retour=%2Freseaux', cookies: [] });
      return vers(reponse, await demarrerRaccordement(services, { reseau, session, valeurCookieSession: valeur }));
    });

    app.get(RESEAUX_DECLARES[reseau]!.cheminRetour, async (requete, reponse) => {
      if (!limite.permettre(requete.ip)) return reponse.header('cache-control', 'no-store').header('retry-after', '60').code(429).send({ erreur: 'trop_de_demandes' });
      const valeur = lireCookie(requete.headers.cookie, COOKIE_SESSION);
      const session = valeur === undefined ? undefined : await services.sessions.trouver(valeur);
      const q = requete.query as Record<string, unknown>;
      return vers(
        reponse,
        await terminerRaccordement(services, {
          reseau,
          session,
          valeurCookieSession: valeur,
          cookieFlux: lireCookie(requete.headers.cookie, COOKIE_FLUX_RESEAU),
          code: texte(q['code']),
          state: texte(q['state']),
          erreur: texte(q['error']),
        }),
      );
    });
  }
}
