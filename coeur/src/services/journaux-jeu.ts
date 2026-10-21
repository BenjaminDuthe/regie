// regie — journaux de jeu en direct (histoire 4.5, FR-18, AR-8). Le conteneur de capture écrit une ligne de journal par
// geste (entrée, choix, clic) ; le cœur les garde ici, en mémoire, le temps du jeu, et les pousse aux flux ouverts. Rien
// n'est écrit en base : le journal ne contient ni valeur saisie ni compte, seulement le verbe, la cible visée et l'hôte,
// et le résultat durable d'un jeu est le `dernier_jeu` du script. Un seul processus cœur : pas de relais entre processus.

import { z } from 'zod';

export const GENRES_JOURNAL_JEU = ['navigation', 'clic', 'survol', 'saisie', 'attente', 'defilement', 'pause', 'narration', 'film_debut', 'film_fin', 'connexion', 'refus', 'echec', 'fin'] as const;

/** Une ligne du journal, telle que le conteneur l'écrit ; tout champ en trop la fait refuser. */
export const EntreeJournalJeu = z.strictObject({
  t: z.number().int().min(0).max(3_600_000),
  etape: z.number().int().min(0).max(100),
  genre: z.enum(GENRES_JOURNAL_JEU),
  cible: z.string().max(300).optional(),
  /** Position du pointeur en millièmes de la page. */
  x: z.number().int().min(0).max(1000).optional(),
  y: z.number().int().min(0).max(1000).optional(),
});
export type EntreeJournalJeu = z.infer<typeof EntreeJournalJeu>;

export const ENTREES_MAX_PAR_JEU = 300;
export const JEUX_GARDES_MAX = 50;
export const DUREE_GARDE_MS = 60 * 60_000;

type Jeu = { marqueId: string; entrees: EntreeJournalJeu[]; ecouteurs: Set<(e: EntreeJournalJeu) => void>; dernierLe: number };

export class JournauxJeu {
  readonly #jeux = new Map<string, Jeu>();
  readonly #maintenant: () => number;

  constructor(maintenant: () => number = Date.now) {
    this.#maintenant = maintenant;
  }

  #jeu(marqueId: string, tacheId: string): Jeu | undefined {
    const j = this.#jeux.get(tacheId);
    return j !== undefined && j.marqueId === marqueId ? j : undefined;
  }

  #purger(): void {
    const limite = this.#maintenant() - DUREE_GARDE_MS;
    for (const [id, j] of this.#jeux) if (j.dernierLe < limite && j.ecouteurs.size === 0) this.#jeux.delete(id);
    while (this.#jeux.size > JEUX_GARDES_MAX) {
      const plusVieux = [...this.#jeux.entries()].filter(([, j]) => j.ecouteurs.size === 0).sort((a, b) => a[1].dernierLe - b[1].dernierLe)[0];
      if (plusVieux === undefined) return;
      this.#jeux.delete(plusVieux[0]);
    }
  }

  /** Ajoute une entrée au journal du jeu ; au-delà de la limite, les entrées en trop sont ignorées. */
  publier(marqueId: string, tacheId: string, entree: EntreeJournalJeu): void {
    let j = this.#jeux.get(tacheId);
    if (j !== undefined && j.marqueId !== marqueId) return;
    if (j === undefined) {
      this.#purger();
      j = { marqueId, entrees: [], ecouteurs: new Set(), dernierLe: this.#maintenant() };
      this.#jeux.set(tacheId, j);
    }
    j.dernierLe = this.#maintenant();
    if (j.entrees.length >= ENTREES_MAX_PAR_JEU) return;
    j.entrees.push(entree);
    for (const f of j.ecouteurs) f(entree);
  }

  /** Les entrées déjà écrites (pour un flux qui s'ouvre en cours de jeu). Vide si le jeu est inconnu de cette marque. */
  lire(marqueId: string, tacheId: string): readonly EntreeJournalJeu[] {
    return this.#jeu(marqueId, tacheId)?.entrees ?? [];
  }

  /** Reçoit chaque entrée à venir ; rend la fonction qui se désabonne. */
  abonner(marqueId: string, tacheId: string, ecouteur: (e: EntreeJournalJeu) => void): () => void {
    let j = this.#jeu(marqueId, tacheId);
    if (j === undefined) {
      if (this.#jeux.has(tacheId)) return () => undefined;
      j = { marqueId, entrees: [], ecouteurs: new Set(), dernierLe: this.#maintenant() };
      this.#jeux.set(tacheId, j);
    }
    j.ecouteurs.add(ecouteur);
    const jeu = j;
    return () => void jeu.ecouteurs.delete(ecouteur);
  }
}
