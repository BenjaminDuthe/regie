// regie — serveur du cœur.
// fastify sert les fichiers construits d'Astro (dist/client) par @fastify/static,
// puis confie le reste au handler d'Astro en mode middleware, par @fastify/middie.

import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import middie from '@fastify/middie';
import fastifyStatic from '@fastify/static';
import { pino, type DestinationStream } from 'pino';
import { env } from './env.ts';

type HandlerAstro = (
  requete: import('node:http').IncomingMessage,
  reponse: import('node:http').ServerResponse,
  suite?: (erreur?: unknown) => void,
) => void;

const RACINE_CLIENT = fileURLToPath(new URL('../dist/client/', import.meta.url));
const ENTREE_SERVEUR = new URL('../dist/server/entry.mjs', import.meta.url).href;

/** `journal` : destination des journaux (tests) ; sinon la sortie standard. */
export async function construireServeur(options: { journal?: DestinationStream } = {}) {
  // Le handler d'Astro n'existe qu'après `astro build` : on le charge à l'exécution.
  const { handler } = (await import(ENTREE_SERVEUR)) as { handler: HandlerAstro };

  const niveau = options.journal !== undefined ? 'info' : env.NODE_ENV === 'test' ? 'silent' : 'info';
  const reglages = {
    level: niveau,
    // Méthode et URL seulement : ni adresse IP, ni port, ni nom d'hôte du client (donnée personnelle).
    serializers: { req: (requete: { method: string; url: string }) => ({ method: requete.method, url: requete.url }) },
  };
  const journal = options.journal !== undefined ? pino(reglages, options.journal) : pino(reglages);
  const app = Fastify({ loggerInstance: journal });
  await app.register(fastifyStatic, { root: RACINE_CLIENT });
  await app.register(middie);
  app.use(handler);
  return app;
}

if (import.meta.main) {
  const app = await construireServeur();
  // Arrêt propre : en PID 1 du conteneur, node n'a pas de gestionnaire de SIGTERM par défaut.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      app.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }
  await app.listen({ host: env.HOTE, port: env.PORT });
}
