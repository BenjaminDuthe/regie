// regie — ce que font les travaux internes du socle (histoire 2.2) : purges de la nuit et vérification du journal chaîné.
// Chaque gestionnaire est rejouable : le refaire après un arrêt ne change rien de plus.

import type { Pool } from 'pg';
import type { Audit } from '../infra/audit.ts';
import { verifierChaine } from '../infra/audit.ts';
import { idUtilisateur } from '../infra/espaces.ts';
import type { Notifications } from '../infra/notifications.ts';
import { purgerClientsOauth, purgerSessions } from '../infra/entretien.ts';
import { ErreurTravail, cleGestionnaire, type Gestionnaires } from './planificateur.ts';
import type { Journal } from './travailleur.ts';

export const ACTEUR_SYSTEME = 'systeme';

/**
 * Vérifie la chaîne d'une marque et en laisse la trace dans le journal : tête, nombre de lignes, résultat.
 * Un écart est écrit au journal d'audit, signalé en erreur dans les logs, et fait échouer le travail avec la cause
 * `CHAINE_ROMPUE` ; l'administrateur en est prévenu dans l'interface (une notification par jour, histoire 2.6).
 */
export type AlerteAdmin = Readonly<{ notifications: Notifications; adminSub: string | undefined; maintenant?: () => number }>;

export async function verifierJournal(audit: Audit, journal: Journal, marqueId: string, alerte?: AlerteAdmin): Promise<void> {
  const lignes = await audit.lire(marqueId);
  const rupture = verifierChaine(lignes);
  const tete = lignes.at(-1)?.hache;
  await audit.ajouter(marqueId, {
    acteur: ACTEUR_SYSTEME,
    action: 'verification_chaine',
    objet: 'journal',
    details: { origine: 'planificateur', lignes: lignes.length, tete: tete ?? null, resultat: rupture === undefined ? 'intacte' : 'rompue', ...(rupture === undefined ? {} : { position: rupture }) },
  });
  if (rupture !== undefined) {
    journal.error({ marque: marqueId, position: rupture, lignes: lignes.length }, 'journal d’audit : la chaîne est rompue');
    if (alerte?.adminSub !== undefined) {
      const jour = new Date((alerte.maintenant ?? Date.now)()).toISOString().slice(0, 10);
      await alerte.notifications.creer(marqueId, { utilisateurId: idUtilisateur(marqueId, alerte.adminSub), genre: 'chaine_rompue', cause: 'CHAINE_ROMPUE', cle: `chaine_rompue:${jour}` });
    }
    throw new ErreurTravail('CHAINE_ROMPUE');
  }
}

export function gestionnairesDuSocle(options: Readonly<{ pool: Pool; audit: Audit; journal: Journal; alerte?: AlerteAdmin }>): Gestionnaires {
  const { pool, audit, journal, alerte } = options;
  return {
    [cleGestionnaire('verification_audit', 'chaine')]: (t) => verifierJournal(audit, journal, t.marqueId, alerte),
    [cleGestionnaire('purge', 'sessions')]: async (t) => {
      const n = await purgerSessions(pool, t.marqueId);
      journal.info({ marque: t.marqueId, supprimees: n }, 'sessions expirées purgées');
    },
    [cleGestionnaire('purge', 'clients_oauth')]: async (t) => {
      const n = await purgerClientsOauth(pool, t.marqueId);
      journal.info({ marque: t.marqueId, supprimes: n }, 'clients OAuth inutilisés purgés');
    },
  };
}
