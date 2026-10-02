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
});
