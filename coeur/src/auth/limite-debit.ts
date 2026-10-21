// regie — limite de débit par clé (adresse IP), en mémoire et par processus. Factorisée depuis l'inscription dynamique
// OAuth (histoire 1.12) pour servir aussi les routes publiques de la publication (histoire 7.6) : une seule règle.

export class LimiteDebit {
  readonly #max: number;
  readonly #fenetreMs: number;
  readonly #maintenant: () => number;
  readonly #passages = new Map<string, number[]>();

  constructor(max: number, fenetreMs: number, maintenant: () => number) {
    this.#max = max;
    this.#fenetreMs = fenetreMs;
    this.#maintenant = maintenant;
  }

  /** Vrai (et le passage est compté) tant que la clé n'a pas atteint `max` passages dans la fenêtre. */
  permettre(cle: string): boolean {
    const maintenant = this.#maintenant();
    for (const [k, dates] of this.#passages) {
      const recentes = dates.filter((t) => maintenant - t < this.#fenetreMs);
      if (recentes.length === 0) this.#passages.delete(k);
      else this.#passages.set(k, recentes);
    }
    const dates = this.#passages.get(cle) ?? [];
    if (dates.length >= this.#max) return false;
    this.#passages.set(cle, [...dates, maintenant]);
    return true;
  }
}
