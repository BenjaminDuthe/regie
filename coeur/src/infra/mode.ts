// regie — modes de fonctionnement (histoire 9.2). Une seule table dit ce qui tourne dans chaque mode : le serveur la lit,
// un test la fige. « restauration » sert à vérifier une base restaurée sans rien exécuter : rien ne reprend, rien ne part.

export type ModeRegie = 'normal' | 'restauration';

export type FonctionsDuMode = Readonly<{
  /** Travailleur de la file de tâches, écoute des résultats et réconciliation des publications. */
  file: boolean;
  /** Planificateur d'échéances (ménage de nuit, rappels, départ des publications programmées). */
  planificateur: boolean;
  /** Connecteurs de réseaux : sans eux, aucune publication ne peut partir. */
  publications: boolean;
}>;

export const FONCTIONS_PAR_MODE: Readonly<Record<ModeRegie, FonctionsDuMode>> = Object.freeze({
  normal: Object.freeze({ file: true, planificateur: true, publications: true }),
  restauration: Object.freeze({ file: false, planificateur: false, publications: false }),
});
