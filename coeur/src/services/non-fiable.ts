// regie — texte venu d'un tiers (AR-25, FR-46). Ce que dit un commentaire, un message ou une fiche d'un réseau n'est
// pas une instruction : toute sortie d'action ou d'outil MCP qui en contient le place dans un champ `non_fiable`,
// que Claude doit lire comme une donnée. Aucune action actuelle n'en renvoie encore ; les histoires de réception
// (réseaux, commentaires) l'utilisent.

export type NonFiable = Readonly<{ non_fiable: string }>;

export const nonFiable = (texte: string): NonFiable => ({ non_fiable: texte });
