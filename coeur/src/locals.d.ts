// Données que le serveur (fastify) passe au handler d'Astro et que le middleware complète (histoire 1.14).
declare namespace App {
  interface Locals {
    /** Services de la connexion ; absents hors du serveur (par exemple `astro dev`). */
    regie: import('./auth/services.ts').Services | undefined;
    /** Session valide de la requête, posée par le middleware. */
    session: import('./infra/sessions.ts').Session | undefined;
  }
}
