// regie — mettre l'envoi d'une publication en file (histoires 7.3 et 7.4). Un seul endroit : l'action « publier maintenant »,
// « rejouer » et l'échéance d'une publication programmée enfilent la même tâche `reseau`, avec qui l'a voulue.
// Rien ne part avant que la tâche soit prise par l'exécutant, et la tâche n'a pas de reprise.

import type { Services } from '../auth/services.ts';
import type { OrigineTentative } from '../domaine/publication.ts';
import type { Publication } from '../infra/publications.ts';

export type Demandeur = Readonly<{ origine: OrigineTentative; pat: string | null; sub: string }>;

/** Acteur d'audit d'une publication partie à l'heure dite : la personne qui l'a programmée, par l'échéance. */
export const acteurEcheance = (utilisateurId: string): string => `echeance:${utilisateurId}`;

export async function enfilerEnvoi(services: Services, marqueId: string, utilisateurId: string, p: Publication, demandeur: Demandeur): Promise<Publication> {
  const tache = await services.file.enfiler(marqueId, utilisateurId, 'reseau', { publicationId: p.id, origine: demandeur.origine, pat: demandeur.pat, sub: demandeur.sub });
  await services.publications.lierTache(marqueId, utilisateurId, p.id, tache.id);
  return { ...p, tacheId: tache.id };
}
