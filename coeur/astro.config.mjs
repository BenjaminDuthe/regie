// regie — configuration d'Astro.
// Astro est construit en middleware : fastify (src/serveur.ts) le sert,
// avec @fastify/static pour dist/client. Aucune lecture de l'environnement ici :
// seul src/env.ts lit l'environnement (AR-5).

import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [svelte()],
  // Pas de télémétrie ni de ressource tierce : rien ne sort du serveur.
  devToolbar: { enabled: false },
  // CSP posée par Astro dans une balise meta, avec les empreintes des scripts et styles en ligne
  // (histoire 1.2). Rien ne se charge d'un autre domaine ; aucun effet en `astro dev`.
  security: {
    // L'Origin des formulaires est contrôlée par src/middleware.ts contre l'adresse publique de regie : derrière un
    // proxy, l'adresse vue par Astro n'est pas celle du navigateur.
    checkOrigin: false,
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
});
