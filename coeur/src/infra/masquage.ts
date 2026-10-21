// regie — masquage des secrets dans les journaux, par nom de clé et par valeur (AR-11, NFR-14).
// Le masqueur connaît l'ensemble des secrets en cours d'usage ; pino l'applique à chaque ligne.

export const MASQUE = '[masqué]';

/** Clés dont la valeur est toujours masquée, quelle qu'elle soit. */
const CLES_SENSIBLES = /(mot_?de_?passe|passw(or)?d|secret|token|jeton|cle_?maitresse|authorization|cookie|api_?key|credential)/i;

/** Motifs de secrets qui circulent dans des chaînes (adresses, en-têtes, messages d'erreur). */
const MOTIFS: readonly [RegExp, string][] = [
  [/\b(access_token|refresh_token|client_secret|id_token|code)=([^&\s"']+)/gi, `$1=${MASQUE}`],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, `Bearer ${MASQUE}`],
];

/** En dessous, une valeur masquerait des mots courants : seule la détection par nom de clé s'applique. */
const LONGUEUR_MIN_VALEUR = 8;

export class Masqueur {
  readonly #valeurs = new Set<string>();

  /** Déclare un secret en usage ; ses occurrences seront masquées. */
  ajouter(valeur: string | Buffer): void {
    const texte = typeof valeur === 'string' ? valeur : valeur.toString('utf8');
    if (texte.length >= LONGUEUR_MIN_VALEUR) this.#valeurs.add(texte);
  }

  retirer(valeur: string | Buffer): void {
    this.#valeurs.delete(typeof valeur === 'string' ? valeur : valeur.toString('utf8'));
  }

  masquerTexte(texte: string): string {
    let resultat = texte;
    // Les plus longues d'abord : un secret contenu dans un autre ne doit pas en laisser un morceau.
    for (const valeur of [...this.#valeurs].sort((a, b) => b.length - a.length)) {
      resultat = resultat.split(valeur).join(MASQUE);
    }
    for (const [motif, remplacement] of MOTIFS) resultat = resultat.replace(motif, remplacement);
    return resultat;
  }

  /** Copie profonde masquée d'une valeur de journal (chaîne, objet, tableau, erreur). */
  masquer(valeur: unknown, vus: WeakSet<object> = new WeakSet(), profondeur = 0): unknown {
    if (typeof valeur === 'string') return this.masquerTexte(valeur);
    if (valeur === null || typeof valeur !== 'object') return valeur;
    if (Buffer.isBuffer(valeur)) return '[binaire]';
    if (vus.has(valeur) || profondeur > 8) return '[circulaire ou trop profond]';
    vus.add(valeur);
    if (valeur instanceof Error) {
      const copie: Record<string, unknown> = {
        type: valeur.name,
        message: this.masquerTexte(valeur.message),
      };
      if (valeur.stack !== undefined) copie['stack'] = this.masquerTexte(valeur.stack);
      return copie;
    }
    if (Array.isArray(valeur)) return valeur.map((element) => this.masquer(element, vus, profondeur + 1));
    const copie: Record<string, unknown> = {};
    for (const [cle, element] of Object.entries(valeur)) {
      copie[cle] = CLES_SENSIBLES.test(cle) ? MASQUE : this.masquer(element, vus, profondeur + 1);
    }
    return copie;
  }

  /** Masque une ligne de journal JSON déjà sérialisée : par nom de clé, puis par valeur et par motif. */
  masquerLigne(ligne: string): string {
    try {
      const objet: unknown = JSON.parse(ligne);
      return `${JSON.stringify(this.masquer(objet))}\n`;
    } catch {
      return this.masquerTexte(ligne);
    }
  }

  /**
   * Options pino : `hooks.streamWrite` voit la ligne finale, après les sérialiseurs de requête et
   * d'erreur, quel que soit le chemin qui l'a produite (message, objet, erreur, journal enfant).
   */
  get optionsPino() {
    return { hooks: { streamWrite: (ligne: string) => this.masquerLigne(ligne) } };
  }
}

/** Masqueur du processus : le démarrage y inscrit la clé maîtresse et les mots de passe de la base. */
export const masqueurProcessus = new Masqueur();
