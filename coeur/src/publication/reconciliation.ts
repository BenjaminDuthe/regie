// regie — le réconciliateur des publications (histoire 7.3, AR-9). Si le processus meurt entre l'envoi et l'écriture de
// l'issue, la tâche `reseau` finit sans que la publication le sache : la file la déclare échouée (RESULTAT_INCONNU) ou
// terminée. On rapproche les deux, sans jamais renvoyer : une publication restée `envoi_en_cours` devient `incertaine`
// (la vidéo est peut-être en ligne), une publication restée `en_file` dont la tâche a échoué devient `en_echec`.

import type { Pool } from 'pg';
import type { Services } from '../auth/services.ts';
import { echeancesPublicationPerimees, tachesReseauFinies } from '../infra/publications.ts';
import { auditerTentative } from './echeance.ts';
import { notifierIssue, type ResultatReseau } from './executant-reseau.ts';

/** On regarde les tâches des deux derniers jours : au-delà, un état resté en suspens n'est plus qu'un cas de support. */
export const FENETRE_RECONCILIATION_MS = 2 * 86_400_000;
export const PERIODE_RECONCILIATION_MS = 60_000;

export async function reconcilierPublications(pool: Pool, services: Services, marqueId: string): Promise<number> {
  const taches = await tachesReseauFinies(pool, marqueId, new Date(services.maintenant() - FENETRE_RECONCILIATION_MS));
  let rattrapees = 0;
  for (const t of taches) {
    const r = t.resultat as Partial<ResultatReseau> | null;
    const issue =
      t.etat === 'terminee' && r?.etat === 'publiee' && typeof r.idExterne === 'string' && typeof r.lien === 'string'
        ? ({ terminee: true, idExterne: r.idExterne, lien: r.lien } as const)
        : t.etat === 'terminee' && (r?.etat === 'ignoree')
          ? undefined
          : ({ terminee: false, cause: t.cause ?? 'RESULTAT_INCONNU' } as const);
    if (issue === undefined) continue;
    const p = await services.publications.rattraper(marqueId, t.utilisateurId, t.id, issue);
    if (p === undefined) continue;
    rattrapees += 1;
    await notifierIssue(services, marqueId, p);
  }
  // Les échéances que le planificateur a laissées passer (plus de 2 h) : la publication échoue avec sa cause, sans rien envoyer.
  const depuis = new Date(services.maintenant() - FENETRE_RECONCILIATION_MS);
  for (const e of await echeancesPublicationPerimees(pool, marqueId, depuis)) {
    const p = await services.publications.echouerProgrammee(marqueId, e.utilisateurId, e.publicationId, e.epoch, ['programmee', 'en_attente_confirmation'], 'ECHEANCE_PERIMEE', 'rejouer');
    if (p === undefined) continue;
    rattrapees += 1;
    await auditerTentative(services, marqueId, e.utilisateurId, p.id);
    await notifierIssue(services, marqueId, p);
  }
  return rattrapees;
}

/** Une passe au démarrage, puis une par minute. Rend la fonction d'arrêt. */
export function demarrerReconciliation(pool: Pool, services: Services, journal: Readonly<{ error: (o: object, m: string) => void }>): () => void {
  let enCours = false;
  const passer = async (): Promise<void> => {
    if (enCours) return;
    enCours = true;
    try {
      for (const marque of await services.marques.lister()) await reconcilierPublications(pool, services, marque);
    } catch (erreur) {
      journal.error({ erreur: erreur instanceof Error ? erreur.message : String(erreur) }, 'réconciliation des publications en échec');
    } finally {
      enCours = false;
    }
  };
  void passer();
  const minuterie = setInterval(() => void passer(), PERIODE_RECONCILIATION_MS);
  return () => clearInterval(minuterie);
}
