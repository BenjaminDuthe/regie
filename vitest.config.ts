// regie — configuration de vitest : tests du cœur et des vérificateurs de la CI.
// Les tests d'intégration PostgreSQL ne tournent que si REGIE_TEST_POSTGRES désigne une base jetable
// (`npm run test:postgres` en démarre une) ; sinon ils sont ignorés. Ce fichier est hors de coeur/ :
// il peut lire l'environnement, pas les tests.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['coeur/test/**/*.test.ts', 'paquets/*/test/**/*.test.ts', 'outils/ci/**/*.test.mjs'],
    environment: 'node',
    provide: { urlPostgresTest: process.env['REGIE_TEST_POSTGRES'] ?? '' },
  },
});
