// regie — l'échéance d'une publication programmée (histoire 7.4, FR-43, AR-22, NFR-8, NFR-25). Le planificateur déclenche
// l'échéance (UTC) dans la minute qui suit l'heure dite ; ce gestionnaire en fait une publication `en_file` et sa tâche.
//   - La publication vérifie que l'instant de l'échéance est toujours le sien : une échéance déplacée ou annulée ne fait rien.
//   - Le passage `programmee -> en_file` est un compare-and-set : le gestionnaire est rejouable, jamais deux tâches.
//   - Montage modifié et non confirmé à l'heure dite : échec `MONTAGE_MODIFIE`, rien ne part.
// Le retard de plus de 2 h est jugé par le planificateur (`decider`, règle `echouer`) ; le réconciliateur en tire la
// publication (`ECHEANCE_PERIMEE`).

import type { Services } from '../auth/services.ts';
import { lireObjetEcheancePublication } from '../domaine/publication.ts';
import type { Gestionnaires } from '../services/planificateur.ts';
import { ErreurTravail } from '../services/planificateur.ts';
import { acteurEcheance, enfilerEnvoi } from './mise-en-file.ts';
import { notifierIssue } from './executant-reseau.ts';

export function gestionnairePublication(services: Services): Gestionnaires {
  return {
    publication: async (travail) => {
      const objet = lireObjetEcheancePublication(travail.objet);
      if (objet === undefined) throw new ErreurTravail('ECHEANCE_ILLISIBLE');
      const { publicationId, utilisateurId, epoch } = objet;
      const marque = travail.marqueId;

      const p = await services.publications.lire(marque, utilisateurId, publicationId);
      if (p === undefined) return;

      if (p.etat === 'en_attente_confirmation') {
        const echec = await services.publications.echouerProgrammee(marque, utilisateurId, publicationId, epoch, ['en_attente_confirmation'], 'MONTAGE_MODIFIE', 'rejouer');
        if (echec !== undefined) {
          await auditerTentative(services, marque, utilisateurId, echec.id);
          await notifierIssue(services, marque, echec);
        }
        return;
      }

      const aEnfiler = await services.publications.lancerEcheance(marque, utilisateurId, publicationId, epoch);
      if (aEnfiler === undefined) return;
      await enfilerEnvoi(services, marque, utilisateurId, aEnfiler, { origine: 'echeance', pat: null, sub: acteurEcheance(utilisateurId) });
    },
  };
}

/** Une tentative sans envoi laisse sa trace au journal, comme celles qui envoient : acteur = l'échéance de la personne. */
export async function auditerTentative(services: Services, marqueId: string, utilisateurId: string, publicationId: string): Promise<void> {
  await services.audit.ajouter(marqueId, { acteur: acteurEcheance(utilisateurId), action: 'publication_tentative', objet: `publication:${publicationId}`, details: { origine: 'echeance' } });
}
