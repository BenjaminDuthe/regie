// regie — lien vers le code source de la version en service (FR-67, AGPL-3.0).

export const DEPOT_SOURCE = 'https://github.com/BenjaminDuthe/regie';

/** Arborescence du commit en service, ou de `main` quand la version est inconnue (développement). */
export function lienSource(version: string | undefined): string {
  return `${DEPOT_SOURCE}/tree/${version ?? 'main'}`;
}
