// regie — configuration de vitest : tests du cœur et des vérificateurs de la CI.
// Les tests d'intégration PostgreSQL ne tournent que si REGIE_TEST_POSTGRES désigne une base jetable
// (`npm run test:postgres` en démarre une) ; sinon ils sont ignorés. Ce fichier est hors de coeur/ :
// il peut lire l'environnement, pas les tests.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['coeur/test/**/*.test.ts', 'paquets/*/test/**/*.test.ts', 'services/*/test/**/*.test.ts', 'outils/ci/**/*.test.mjs'],
    environment: 'node',
    provide: {
      urlPostgresTest: process.env['REGIE_TEST_POSTGRES'] ?? '',
      // Socket Podman et image de capture pour le test d'intégration de la capture (histoire 4.2) ; vides : ignoré.
      socketPodmanTest: process.env['REGIE_TEST_PODMAN'] ?? '',
      imageCaptureTest: process.env['REGIE_TEST_PODMAN_IMAGE'] ?? '',
      // Chemin de ffmpeg pour le test d'intégration du rendu (histoire 4.6) ; vide : ignoré.
      ffmpegTest: process.env['REGIE_TEST_FFMPEG'] ?? '',
    },
  },
});
