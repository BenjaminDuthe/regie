// Capture réelle par Podman rootless : ignoré sans REGIE_TEST_PODMAN (socket) et REGIE_TEST_PODMAN_IMAGE (image de capture).
// Vérifie le circuit complet jusqu'au conteneur : une page d'accueil hors liste y est refusée avant tout navigateur.

import { describe, expect, inject, it } from 'vitest';
import { LanceurPodman, RESEAU_CAPTURE } from '../src/services/capture.ts';

declare module 'vitest' {
  interface ProvidedContext {
    socketPodmanTest: string;
    imageCaptureTest: string;
  }
}

const socket = inject('socketPodmanTest');
const image = inject('imageCaptureTest');

describe.skipIf(socket === '' || image === '')('capture dans un conteneur jetable', () => {
  it('refuse dans le conteneur une page d’accueil hors des hôtes déclarés', async () => {
    const sortie = await new LanceurPodman({ socket, image, reseau: RESEAU_CAPTURE }).lancer({
      nom: `regie-capture-test-${Date.now()}`,
      entree: JSON.stringify({ url: 'https://hors.exemple.org/', hotes: ['demo.exemple.fr'], proxy: { serveur: 'http://10.89.77.2:3128', laissezPasser: 'v1.x.y' }, viewport: { largeur: 360, hauteur: 640 }, delaiMs: 10_000 }),
      delaiMs: 30_000,
      signal: new AbortController().signal,
    });
    expect(JSON.parse(sortie.trim())).toEqual({ ok: false, cause: 'HOTE_REFUSE', hote: 'hors.exemple.org' });
  });
});
