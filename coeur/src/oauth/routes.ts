// regie — routes fastify du serveur d'autorisation OAuth 2.1 (histoire 1.12) : métadonnées, enregistrement des
// clients, point d'accès des jetons. La page de consentement (/oauth/autoriser) est une page Astro sous session.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { emetteur, enregistrerClient, metadonneesRessource, metadonneesServeur, traiterToken, type Resultat } from '../auth/oauth.ts';
import type { Services } from '../auth/services.ts';

export function enregistrerRoutesOauth(app: FastifyInstance, services: Services): void {
  const envoyer = (reponse: FastifyReply, r: Resultat) => reponse.header('cache-control', 'no-store').header('pragma', 'no-cache').code(r.statut).send(r.corps);
  const nonConfigure = (reponse: FastifyReply) => envoyer(reponse, { statut: 503, corps: { error: 'temporarily_unavailable' } });

  const ressource = async (_requete: unknown, reponse: FastifyReply) => {
    const base = emetteur(services);
    return base === undefined ? nonConfigure(reponse) : reponse.header('cache-control', 'public, max-age=300').send(metadonneesRessource(base));
  };
  app.get('/.well-known/oauth-protected-resource', ressource);
  app.get('/.well-known/oauth-protected-resource/mcp', ressource);
  app.get('/.well-known/oauth-authorization-server', async (_requete, reponse) => {
    const base = emetteur(services);
    return base === undefined ? nonConfigure(reponse) : reponse.header('cache-control', 'public, max-age=300').send(metadonneesServeur(base));
  });

  // Enregistrement dynamique (RFC 7591) : ouvert à tous mais borné (forme des adresses, plafond de clients par marque).
  app.post('/oauth/register', { bodyLimit: 8192 }, async (requete, reponse) => envoyer(reponse, await enregistrerClient(services, requete.body)));

  app.post('/oauth/token', { bodyLimit: 8192 }, async (requete, reponse) => {
    const corps = requete.body;
    if (!(corps instanceof URLSearchParams)) return envoyer(reponse, { statut: 400, corps: { error: 'invalid_request' } });
    return envoyer(reponse, await traiterToken(services, corps));
  });
}
