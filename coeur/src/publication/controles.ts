// regie — les contrôles qui précèdent tout envoi (histoire 7.3, FR-42) : compte connecté, connecteur branché, rendu complet
// prêt et fichier présent, bornes du réseau, quota. Les mêmes à la demande (l'action refuse tout de suite) et juste avant
// l'envoi (l'exécutant ne part que si rien n'a changé). Aucun contrôle ne laisse passer un jeton hors de ce module.

import { bornesVideoDepassees } from '../domaine/bornes.ts';
import type { Reseau } from '../domaine/bornes.ts';
import { RESEAUX_DECLARES } from '../domaine/reseaux.ts';
import type { CompteReseau } from '../infra/comptes-reseau.ts';
import type { Fichier } from '../infra/montages.ts';
import type { Services } from '../auth/services.ts';
import { estErreurReseau, type ConnecteurReseau } from './connecteur.ts';

export type Refus = Readonly<{ ok: false; code: string; contexte: Readonly<Record<string, unknown>> }>;
export type Pret = Readonly<{ ok: true; jeton: string; compte: CompteReseau; fichier: Fichier; connecteur: ConnecteurReseau }>;

const refus = (code: string, contexte: Record<string, unknown> = {}): Refus => ({ ok: false, code, contexte });

export async function controlerAvantEnvoi(
  services: Services,
  marqueId: string,
  utilisateurId: string,
  p: Readonly<{ compteId: string; renduId: string; reseau: Reseau }>,
  options: Readonly<{ quota?: boolean }> = {},
): Promise<Pret | Refus> {
  const nom = RESEAUX_DECLARES[p.reseau]?.nom ?? p.reseau;
  const compte = await services.comptesReseau.lire(marqueId, utilisateurId, p.compteId);
  if (compte === undefined || compte.etat !== 'connecte') return refus('PUBLICATION_COMPTE_DECONNECTE');
  const connecteur = services.connecteurs[p.reseau];
  if (connecteur === undefined) return refus('RESEAU_CONNECTEUR_ABSENT', { reseau: nom });
  const rendu = await services.montages.lireRendu(marqueId, utilisateurId, p.renduId);
  if (rendu === undefined || rendu.etat !== 'pret' || rendu.fichierId === null) return refus('PUBLICATION_RENDU_ABSENT', { etat: rendu?.etat ?? 'absent' });
  const fichier = await services.montages.lireFichier(marqueId, utilisateurId, rendu.fichierId);
  if (fichier === undefined || fichier.purgeLe !== null) return refus('PUBLICATION_RENDU_ABSENT', { etat: 'purge' });
  const depassee = bornesVideoDepassees(p.reseau as 'instagram', { dureeS: (fichier.dureeMs ?? 0) / 1000, tailleOctets: fichier.octets })[0];
  if (depassee !== undefined) return refus('PUBLICATION_BORNE', { reseau: nom, ...depassee });
  const jeton = await services.comptesReseau.lireJeton(marqueId, compte.id);
  if (jeton === undefined) return refus('PUBLICATION_COMPTE_DECONNECTE');
  // À la programmation, le quota de l'heure dite n'est pas connu : il est contrôlé à l'envoi (histoire 7.4).
  if (options.quota === false) return { ok: true, jeton, compte, fichier, connecteur };
  try {
    const quota = await connecteur.quota({ jeton, compteExterne: compte.compteExterne });
    if (quota.utilise >= quota.total) return refus('PUBLICATION_QUOTA', { reseau: nom, utilise: quota.utilise, total: quota.total });
  } catch (e) {
    if (!estErreurReseau(e)) throw e;
    // Le jeton refusé est un refus sûr (rien n'est parti) ; une coupure sur la lecture du quota aussi.
    if (e.code === 'RESEAU_JETON_REFUSE') return refus('PUBLICATION_COMPTE_DECONNECTE');
    return refus('PUBLICATION_QUOTA_ILLISIBLE', { reseau: nom, cause: e.code });
  }
  return { ok: true, jeton, compte, fichier, connecteur };
}
