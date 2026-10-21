// Contrats partagés de regie : schémas zod versionnés (AD-4).
// Les contrats arrivent avec leurs histoires : pour l'instant les types de tâche (2.1).

export const VERSION_CONTRATS = 1;

export * from './taches.ts';
export * from './echeances.ts';
export * from './hotes.ts';
export * from './laissez-passer.ts';
export * from './scripts.ts';
export * from './timeline.ts';
export * from './sous-titres.ts';
export * from './rendu.ts';
export * from './edition.ts';
