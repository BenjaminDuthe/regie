// regie — lancement du jeu d'un script (histoire 4.5) : ouvre Chromium par le proxy de sortie avec l'enregistrement
// vertical, branche le pilote, joue, et ferme TOUJOURS le navigateur. Chaque entrée du journal part sur la sortie
// standard au moment où elle est écrite, une ligne JSON `{"journal": {...}}` ; la dernière ligne est le résultat.

import { optionsContexte, optionsLancement } from './chromium.ts';
import type { DemandeCapture, EntreeJournal, ResultatJeu } from './demande.ts';
import { jouerScript, type EnvironnementJeu, ENVIRONNEMENT_REEL } from './jeu.ts';
import { piloteDePlaywright, type PageJeu } from './pilote-playwright.ts';

export type NavigateurJeu = Readonly<{
  newContext: (options: ReturnType<typeof optionsContexte>) => Promise<{ newPage: () => Promise<PageJeu>; close: () => Promise<void> }>;
  close: () => Promise<void>;
}>;
export type LancerNavigateurJeu = (options: ReturnType<typeof optionsLancement>) => Promise<NavigateurJeu>;

export async function jouerDemande(
  demande: DemandeCapture,
  lancer: LancerNavigateurJeu,
  surJournal: (e: EntreeJournal) => void,
  tailleFichier: (chemin: string) => Promise<number>,
  env: EnvironnementJeu = ENVIRONNEMENT_REEL,
): Promise<ResultatJeu> {
  if (demande.etapes === undefined) throw new Error('demande sans étapes');
  const navigateur = await lancer(optionsLancement(demande.proxy));
  try {
    const contexte = await navigateur.newContext(optionsContexte(demande.viewport, true));
    try {
      const page = await contexte.newPage();
      const pilote = await piloteDePlaywright(page, { hotes: demande.hotes, tailleFichier });
      return await jouerScript(
        { url: demande.url, hotes: demande.hotes, etapes: demande.etapes, delaiMs: demande.delaiMs, ...(demande.compte !== undefined ? { compte: demande.compte } : {}) },
        pilote,
        surJournal,
        env,
      );
    } finally {
      await contexte.close().catch(() => undefined);
    }
  } finally {
    await navigateur.close().catch(() => undefined);
  }
}
