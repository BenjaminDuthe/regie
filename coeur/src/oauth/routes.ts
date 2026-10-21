// regie — routes fastify du serveur d'autorisation OAuth 2.1 (histoire 1.12) : métadonnées, enregistrement des
// clients, point d'accès des jetons. La page de consentement (/oauth/autoriser) est une page Astro sous session.

import chaines from '../chaines.json' with { type: 'json' };
import type { FastifyInstance, FastifyReply } from 'fastify';
import { emetteur, enregistrerClient, metadonneesRessource, metadonneesServeur, traiterToken, type Resultat } from '../auth/oauth.ts';
import type { Services } from '../auth/services.ts';

/** Inscriptions dynamiques par adresse IP et par heure (en mémoire, par processus). */
export const INSCRIPTIONS_PAR_HEURE = 10;
const FENETRE_INSCRIPTION_MS = 3600_000;

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
  const inscriptions = new Map<string, number[]>();
  const inscriptionPermise = (ip: string): boolean => {
    const maintenant = services.maintenant();
    for (const [cle, dates] of inscriptions) {
      const recentes = dates.filter((t) => maintenant - t < FENETRE_INSCRIPTION_MS);
      if (recentes.length === 0) inscriptions.delete(cle);
      else inscriptions.set(cle, recentes);
    }
    const dates = inscriptions.get(ip) ?? [];
    if (dates.length >= INSCRIPTIONS_PAR_HEURE) return false;
    inscriptions.set(ip, [...dates, maintenant]);
    return true;
  };
  app.post('/oauth/register', { bodyLimit: 8192 }, async (requete, reponse) => {
    if (!inscriptionPermise(requete.ip)) return envoyer(reponse, { statut: 429, corps: { error: 'temporarily_unavailable', error_description: chaines.oauth.erreurs.trop_d_inscriptions } });
    return envoyer(reponse, await enregistrerClient(services, requete.body));
  });

  app.post('/oauth/token', { bodyLimit: 8192 }, async (requete, reponse) => {
    const corps = requete.body;
    if (!(corps instanceof URLSearchParams)) return envoyer(reponse, { statut: 400, corps: { error: 'invalid_request' } });
    return envoyer(reponse, await traiterToken(services, corps));
  });
}
