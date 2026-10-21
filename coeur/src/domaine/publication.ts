// regie — l'état d'une publication et ses transitions (histoires 7.3 à 7.5, FR-42 à FR-44). Module pur : il dit quelles
// transitions sont permises, rien d'autre. Les écritures (compare-and-set en base) le suivent à la lettre.
//
//   en_file ──envoi──► envoi_en_cours ──► publiee
//      │                    ├──────────► en_echec     (le réseau a dit non, ou n'a rien reçu : rejouable)
//      │                    └──────────► incertaine   (coupure après l'envoi : JAMAIS renvoyée, la personne vérifie)
//      ├──► en_echec (refus avant tout envoi)
//   programmee ──échéance──► en_file ; programmee ──montage modifié──► en_attente_confirmation
//   en_echec ──rejouer──► en_file
//   tout état non parti ou incertain ──annuler──► annulee

export const ETATS_PUBLICATION = ['en_file', 'programmee', 'en_attente_confirmation', 'envoi_en_cours', 'publiee', 'en_echec', 'incertaine', 'annulee'] as const;
export type EtatPublication = (typeof ETATS_PUBLICATION)[number];

export const ORIGINES_TENTATIVE = ['interface', 'api', 'mcp', 'echeance'] as const;
export type OrigineTentative = (typeof ORIGINES_TENTATIVE)[number];

export const ISSUES_TENTATIVE = ['en_cours', 'publiee', 'en_echec', 'incertaine'] as const;
export type IssueTentative = (typeof ISSUES_TENTATIVE)[number];

/** Après l'un de ces états, la vidéo est (peut-être) en ligne : elle ne se supprime pas. */
export const ETATS_VIDEO_EN_LIGNE: readonly EtatPublication[] = Object.freeze(['envoi_en_cours', 'publiee', 'incertaine']);

export const estEnLigne = (etat: EtatPublication): boolean => ETATS_VIDEO_EN_LIGNE.includes(etat);

/** Annuler : seulement ce qui n'est pas parti. Une publication partie ou incertaine ne s'annule pas (rien à retirer ici). */
export const ETATS_ANNULABLES: readonly EtatPublication[] = Object.freeze(['en_file', 'programmee', 'en_attente_confirmation', 'en_echec']);
export const peutAnnuler = (etat: EtatPublication): boolean => ETATS_ANNULABLES.includes(etat);

/** Rejouer : seulement un échec sûr. `incertaine` ne se rejoue jamais (le réseau a peut-être déjà publié). */
export const peutRejouer = (etat: EtatPublication): boolean => etat === 'en_echec';

/**
 * Un échec est SÛR quand le réseau a refusé la demande sans rien publier : refus définitif (4xx), quota (429) ou traitement
 * trop long avant la publication. Tout le reste (réseau injoignable, coupure, réponse illisible) est INCERTAIN : la
 * demande est peut-être arrivée et la vidéo peut être en ligne, donc on ne renvoie jamais.
 */
export const CAUSES_SURES_NON_DEFINITIVES: readonly string[] = Object.freeze(['RESEAU_QUOTA_ATTEINT', 'RESEAU_TRAITEMENT_LONG']);
export const echecSur = (code: string, definitive: boolean): boolean => definitive || CAUSES_SURES_NON_DEFINITIVES.includes(code);

// --- L'échéance d'une publication programmée (histoire 7.4) -------------------------------------------------------
// L'échéance (type `publication`) porte l'identifiant de la publication, celui de la personne (la file et la RLS ne se
// lisent qu'en son nom) et l'instant visé en secondes : une échéance dont l'instant n'est plus celui de la publication
// (déplacée, annulée) ne fait rien, même si elle était déjà due.

export const TYPE_ECHEANCE_PUBLICATION = 'publication';

export const epochDe = (instant: Date): number => Math.floor(instant.getTime() / 1000);

export const objetEcheancePublication = (publicationId: string, utilisateurId: string, instant: Date): string => `${publicationId}:${utilisateurId}:${epochDe(instant)}`;

export function lireObjetEcheancePublication(objet: string): Readonly<{ publicationId: string; utilisateurId: string; epoch: number }> | undefined {
  const m = /^([0-9a-f-]{36}):([0-9a-f-]{36}):(\d{1,12})$/.exec(objet);
  return m === null ? undefined : { publicationId: m[1]!, utilisateurId: m[2]!, epoch: Number(m[3]) };
}

/** Une publication ne se programme pas plus d'un an à l'avance. */
export const HORIZON_PROGRAMMATION_MS = 366 * 86_400_000;
