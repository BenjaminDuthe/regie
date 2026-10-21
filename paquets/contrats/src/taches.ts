// Registre des types de tâche (histoire 2.1, AR-15, AR-16). Un type porte son délai de garde (NFR-11), sa classe,
// son besoin de GPU et sa politique de reprise après un arrêt du service qui l'exécutait :
//  - `permise`   : refaire la tâche donne le même résultat sans effet de bord (une seule reprise automatique) ;
//  - `interdite` : la tâche a un effet extérieur (publication…) ; après un arrêt, son résultat est INCONNU et une
//                  personne décide de la relancer.
// Les étapes réelles (capture, rendu GPU, transcription…) arrivent avec leurs histoires : leur type est déjà déclaré
// ici pour que la file, les délais et l'interface les connaissent, mais seul `essai` a un exécutant aujourd'hui.

export type ClasseTache = 'interactive' | 'lot';
export type PolitiqueReprise = 'permise' | 'interdite';

export type DefinitionTache = Readonly<{
  type: string;
  /** Interactive : une personne attend ; lot : traitement de fond, passe après. */
  classe: ClasseTache;
  /** Une seule tâche GPU tourne à la fois (index unique partiel en base). */
  gpu: boolean;
  reprise: PolitiqueReprise;
  /** Durée maximale d'une tentative, renouvellements compris, en secondes (NFR-11). */
  delaiGardeS: number;
  /** Nombre maximal de tentatives (la première comprise) avant l'échec définitif. */
  tentativesMax: number;
  /** Durée habituelle d'une tentative, en secondes : sert d'estimation tant que l'historique est vide (histoire 2.5). */
  dureeTypiqueS: number;
}>;

const def = (d: DefinitionTache): DefinitionTache => Object.freeze(d);

export const TACHES: Readonly<Record<string, DefinitionTache>> = Object.freeze({
  essai: def({ type: 'essai', classe: 'lot', gpu: false, reprise: 'permise', delaiGardeS: 300, tentativesMax: 3, dureeTypiqueS: 5 }),
  controle: def({ type: 'controle', classe: 'interactive', gpu: false, reprise: 'permise', delaiGardeS: 300, tentativesMax: 3, dureeTypiqueS: 20 }),
  // 3 × la durée du média, 10 minutes au moins : l'appelant relève le délai de la tâche selon la durée.
  transcription: def({ type: 'transcription', classe: 'lot', gpu: true, reprise: 'permise', delaiGardeS: 600, tentativesMax: 3, dureeTypiqueS: 180 }),
  montage: def({ type: 'montage', classe: 'interactive', gpu: false, reprise: 'permise', delaiGardeS: 1800, tentativesMax: 3, dureeTypiqueS: 300 }),
  rendu: def({ type: 'rendu', classe: 'interactive', gpu: true, reprise: 'permise', delaiGardeS: 900, tentativesMax: 3, dureeTypiqueS: 240 }),
  capture: def({ type: 'capture', classe: 'interactive', gpu: false, reprise: 'permise', delaiGardeS: 900, tentativesMax: 3, dureeTypiqueS: 60 }),
  // Essai de connexion au compte de démonstration, dans la capture isolée. Un essai raté peut verrouiller le compte :
  // une seule tentative, jamais rejouée seule.
  test_connexion: def({ type: 'test_connexion', classe: 'interactive', gpu: false, reprise: 'permise', delaiGardeS: 300, tentativesMax: 1, dureeTypiqueS: 30 }),
  // Jeu et tournage d'un script de démo (histoire 4.5) : le compte peut être saisi, donc une seule tentative.
  jeu_script: def({ type: 'jeu_script', classe: 'interactive', gpu: false, reprise: 'permise', delaiGardeS: 300, tentativesMax: 1, dureeTypiqueS: 60 }),
  // Exploration d'une page pour Claude (histoire 4.8) : pas de compte, donc une relance sans danger.
  exploration: def({ type: 'exploration', classe: 'interactive', gpu: false, reprise: 'permise', delaiGardeS: 300, tentativesMax: 2, dureeTypiqueS: 30 }),
  voix: def({ type: 'voix', classe: 'lot', gpu: true, reprise: 'permise', delaiGardeS: 600, tentativesMax: 3, dureeTypiqueS: 90 }),
  // Un appel vers un réseau social a un effet extérieur : jamais rejoué sans décision.
  reseau: def({ type: 'reseau', classe: 'lot', gpu: false, reprise: 'interdite', delaiGardeS: 600, tentativesMax: 1, dureeTypiqueS: 15 }),
});

export const ETATS_TACHE = ['prete', 'en_cours', 'terminee', 'echouee', 'annulee', 'gelee'] as const;
export type EtatTache = (typeof ETATS_TACHE)[number];

/** Causes d'échec posées par la file elle-même (les autres viennent de l'exécutant, en majuscules). */
export const CAUSES_FILE = ['RESULTAT_INCONNU', 'DELAI_DEPASSE', 'TYPE_SANS_EXECUTANT', 'ECHEC'] as const;
