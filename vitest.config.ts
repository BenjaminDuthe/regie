// regie — configuration de vitest : tests du cœur et des vérificateurs de la CI.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['coeur/test/**/*.test.ts', 'paquets/*/test/**/*.test.ts', 'outils/ci/**/*.test.mjs'],
    environment: 'node',
  },
});
