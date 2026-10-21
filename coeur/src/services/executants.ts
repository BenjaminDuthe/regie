// regie — exécutants des types de tâche (histoire 2.1). Les étapes réelles (capture, rendu, transcription…) arrivent
// avec leurs histoires ; aujourd'hui seule la tâche d'essai existe : elle répète son message, et sait échouer sur demande.

import type { Executant } from './travailleur.ts';
import { ErreurTache } from './travailleur.ts';

export const EXECUTANTS: Readonly<Record<string, Executant>> = Object.freeze({
  essai: {
    executer: async (tache) => {
      const echec = tache.entree['echec'];
      if (echec === 'transitoire') throw new ErreurTache('ECHEC', 'relancer', true);
      if (echec === 'definitif') throw new ErreurTache('ECHEC', 'relancer', false);
      return { echo: typeof tache.entree['message'] === 'string' ? tache.entree['message'].slice(0, 200) : null };
    },
  },
});
