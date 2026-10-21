// regie — l'API privée (histoire 1.11, FR-45). `POST /api/v1/<domaine>/<verbe>` avec un jeton Bearer et un corps JSON.
// Elle appelle les mêmes actions que l'interface (services/registre.ts) : mêmes validations, mêmes droits, même
// journal d'audit. Réponses : `{ok:true, donnees}` ou `{ok:false, erreur:{code, message, contexte}}`.
// Pas d'anti-CSRF : aucun cookie n'est lu, seul le jeton Bearer compte.

import type { FastifyInstance } from 'fastify';
import { authentifierBearer } from '../auth/bearer.ts';
import type { Services } from '../auth/services.ts';
import { ACTIONS } from '../services/actions.ts';
import { contexteJeton } from '../services/contextes.ts';
import { ErreurMetier, corpsErreur } from '../services/erreurs.ts';
import { EXCEPTIONS_PARITE } from '../services/exceptions-parite.ts';
import { actionsExposees } from '../services/parite.ts';
import { executerAction, nomAction } from '../services/registre.ts';

export function enregistrerRoutesApi(app: FastifyInstance, services: Services): void {
  const exposees = new Map(actionsExposees(ACTIONS, EXCEPTIONS_PARITE).map((a) => [nomAction(a), a]));

  void app.register(async (api) => {
    const refuser = (reponse: import('fastify').FastifyReply, e: ErreurMetier) => {
      reponse.header('cache-control', 'no-store');
      if (e.statut === 401) reponse.header('www-authenticate', 'Bearer realm="regie"');
      return reponse.code(e.statut).send(corpsErreur(e));
    };

    // Un corps qui n'est pas du JSON valable (ou trop gros) reçoit la même forme d'erreur que le reste.
    api.setErrorHandler((erreur: { statusCode?: number }, requete, reponse) => {
      if (typeof erreur.statusCode === 'number' && erreur.statusCode < 500) return refuser(reponse, new ErreurMetier('ENTREE_INVALIDE', 400, { champs: '(corps)' }));
      requete.log.error({ err: erreur }, 'erreur interne de l’API');
      const inconnue = { code: 'ERREUR_INCONNUE', message: ErreurMetier.message('ERREUR_INCONNUE'), contexte: {} };
      return reponse.header('cache-control', 'no-store').code(500).send({ ok: false, erreur: inconnue });
    });

    api.post('/api/v1/:domaine/:verbe', async (requete, reponse) => {
      const principal = await authentifierBearer(services, requete.headers.authorization);
      if (principal === undefined) return refuser(reponse, new ErreurMetier('AUTH_JETON_REQUIS', 401));
      const { domaine, verbe } = requete.params as { domaine: string; verbe: string };
      const action = exposees.get(`${domaine}.${verbe}`);
      if (action === undefined) return refuser(reponse, new ErreurMetier('ACTION_INCONNUE', 404, { action: `${domaine}.${verbe}` }));
      try {
        const donnees = await executerAction(contexteJeton(services, principal, 'api'), action, requete.body);
        return reponse.header('cache-control', 'no-store').code(200).send({ ok: true, donnees });
      } catch (erreur) {
        if (erreur instanceof ErreurMetier) return refuser(reponse, erreur);
        throw erreur;
      }
    });
  });
}
