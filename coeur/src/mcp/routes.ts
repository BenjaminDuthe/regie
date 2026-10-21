// regie — route /mcp (histoire 1.12) : HTTP « streamable » réduit à l'essentiel, POST seulement, réponses JSON,
// sans état. Authentification : jeton Bearer, jeton d'API personnel ou jeton d'accès OAuth de Claude.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { authentifierBearer } from '../auth/bearer.ts';
import { emetteur } from '../auth/oauth.ts';
import type { Services } from '../auth/services.ts';
import { ErreurMetier } from '../services/erreurs.ts';
import { ERREURS_RPC, erreurRpc, outilsExposes, traiterMessage, type ReponseJsonRpc } from './serveur.ts';

export function enregistrerRoutesMcp(app: FastifyInstance, services: Services): void {
  const outils = outilsExposes();

  void app.register(async (mcp) => {
    // Un corps qui n'est pas du JSON valable (ou trop gros) reçoit une erreur JSON-RPC, pas une page.
    mcp.setErrorHandler((erreur: { statusCode?: number }, requete, reponse) => {
      if (typeof erreur.statusCode === 'number' && erreur.statusCode < 500) {
        return reponse.header('cache-control', 'no-store').code(400).send(erreurRpc(null, ERREURS_RPC.analyse, 'Corps JSON invalide ou trop gros.'));
      }
      requete.log.error({ err: erreur }, 'erreur interne du MCP');
      return reponse.header('cache-control', 'no-store').code(500).send(erreurRpc(null, -32603, ErreurMetier.message('ERREUR_INCONNUE')));
    });

    const refuserSansJeton = (reponse: FastifyReply) => {
      const base = emetteur(services);
      const meta = base === undefined ? '' : `, resource_metadata="${base}/.well-known/oauth-protected-resource"`;
      return reponse.header('www-authenticate', `Bearer realm="regie"${meta}`).header('cache-control', 'no-store').code(401).send({ ok: false, erreur: { code: 'AUTH_JETON_REQUIS', message: ErreurMetier.message('AUTH_JETON_REQUIS'), contexte: {} } });
    };

    mcp.post('/mcp', { bodyLimit: 256 * 1024 }, async (requete, reponse) => {
      // Un navigateur qui appelle /mcp depuis une autre origine (rebinding DNS) est refusé avant tout le reste.
      const origine = requete.headers.origin;
      const base = emetteur(services);
      if (origine !== undefined && origine !== base) {
        return reponse.header('cache-control', 'no-store').code(403).send({ ok: false, erreur: { code: 'MCP_ORIGINE_REFUSEE', message: ErreurMetier.message('MCP_ORIGINE_REFUSEE'), contexte: {} } });
      }
      const principal = await authentifierBearer(services, requete.headers.authorization, { oauth: true });
      if (principal === undefined) return refuserSansJeton(reponse);
      reponse.header('cache-control', 'no-store');
      const corps = requete.body;
      if (Array.isArray(corps)) {
        if (corps.length === 0 || corps.length > 20) return reponse.code(400).send(erreurRpc(null, ERREURS_RPC.requete, 'Lot vide ou trop long.'));
        const reponses = (await Promise.all(corps.map((m) => traiterMessage(services, principal, m, outils)))).filter((r): r is ReponseJsonRpc => r !== undefined);
        return reponses.length === 0 ? reponse.code(202).send() : reponse.code(200).send(reponses);
      }
      const rep = await traiterMessage(services, principal, corps, outils);
      return rep === undefined ? reponse.code(202).send() : reponse.code(200).send(rep);
    });

    // Ni flux serveur (GET) ni session (DELETE) : regie ne garde aucun état entre deux appels.
    const refus405 = async (_requete: unknown, reponse: FastifyReply) => reponse.header('allow', 'POST').header('cache-control', 'no-store').code(405).send({ ok: false, erreur: { code: 'MCP_METHODE_REFUSEE', message: ErreurMetier.message('MCP_METHODE_REFUSEE'), contexte: {} } });
    mcp.get('/mcp', refus405);
    mcp.delete('/mcp', refus405);
  });
}
