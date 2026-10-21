// regie — paquet d'entrée du conteneur de rendu (histoire 4.6). Une première ligne JSON donne le plan (graphe de
// filtres, sous-titres ASS, arguments FFmpeg) ; les lignes suivantes `{"fichier":{...}}` portent le film et les voix par
// morceaux base64, avec une ligne de fin (taille, SHA-256). Le conteneur contrôle tout : il ne fait pas confiance au cœur
// pour les noms de fichier ni pour les arguments.

import { createHash } from 'node:crypto';

export const NOM_FICHIER = /^(film\.webm|voix-[A-Za-z0-9_-]{1,64}\.wav)$/;
const ARGUMENT_MAX = 4000;
const ARGUMENTS_MAX = 200;
export const ENTREE_MAX_OCTETS = 400 * 1024 * 1024;

export type Plan = Readonly<{ graphe: string; ass: string; args: readonly string[]; fichiersVoix: readonly string[]; sansTexte: boolean }>;

export class ErreurPaquet extends Error {}

/** Les arguments ne peuvent ni sortir du dossier de travail ni viser autre chose que les fichiers fixes. */
export function validerPlan(brut: unknown): Plan {
  const p = brut as Record<string, unknown> | null;
  if (typeof p !== 'object' || p === null) throw new ErreurPaquet('PLAN_INVALIDE');
  const { graphe, ass, args, fichiersVoix } = p;
  if (typeof graphe !== 'string' || graphe.length > 400_000 || typeof ass !== 'string' || ass.length > 400_000) throw new ErreurPaquet('PLAN_INVALIDE');
  if (!Array.isArray(args) || args.length > ARGUMENTS_MAX || !args.every((a) => typeof a === 'string' && a.length <= ARGUMENT_MAX && !a.includes('..') && !a.includes('\0'))) throw new ErreurPaquet('PLAN_INVALIDE');
  if (!Array.isArray(fichiersVoix) || !fichiersVoix.every((f) => typeof f === 'string' && NOM_FICHIER.test(f) && f !== 'film.webm')) throw new ErreurPaquet('PLAN_INVALIDE');
  const entrees = args.filter((_, i) => args[i - 1] === '-i');
  const attendues = ['film.webm', ...(fichiersVoix as string[])];
  if (entrees.length !== attendues.length || !entrees.every((e, i) => e === attendues[i])) throw new ErreurPaquet('PLAN_INCOHERENT');
  if (args.at(-1) !== 'sortie.mp4') throw new ErreurPaquet('PLAN_INCOHERENT');
  return { graphe, ass, args: args as string[], fichiersVoix: fichiersVoix as string[], sansTexte: p['sansTexte'] === true };
}

type Encours = { empreinte: ReturnType<typeof createHash>; morceaux: Buffer[]; total: number; suivant: number };

/** Réassemble les fichiers reçus ; renvoie les fichiers complets et contrôlés. */
export class Reception {
  readonly fichiers = new Map<string, Buffer>();
  readonly #encours = new Map<string, Encours>();
  #total = 0;

  ajouter(ligne: string): void {
    let brut: unknown;
    try {
      brut = JSON.parse(ligne);
    } catch {
      throw new ErreurPaquet('LIGNE_ILLISIBLE');
    }
    const f = (brut as { fichier?: Record<string, unknown> } | null)?.fichier;
    if (typeof f !== 'object' || f === null || typeof f['nom'] !== 'string' || !NOM_FICHIER.test(f['nom'])) throw new ErreurPaquet('FICHIER_INVALIDE');
    const nom = f['nom'];
    if (this.fichiers.has(nom)) throw new ErreurPaquet('FICHIER_EN_DOUBLE');
    let e = this.#encours.get(nom);
    if (e === undefined) {
      e = { empreinte: createHash('sha256'), morceaux: [], total: 0, suivant: 0 };
      this.#encours.set(nom, e);
    }
    if (f['fin'] === true) {
      if (f['octets'] !== e.total || f['sha256'] !== e.empreinte.digest('hex')) throw new ErreurPaquet('FICHIER_INCOHERENT');
      this.fichiers.set(nom, Buffer.concat(e.morceaux));
      this.#encours.delete(nom);
      return;
    }
    if (f['n'] !== e.suivant || typeof f['d'] !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(f['d'])) throw new ErreurPaquet('FICHIER_DESORDONNE');
    const m = Buffer.from(f['d'], 'base64');
    this.#total += m.length;
    if (this.#total > ENTREE_MAX_OCTETS) throw new ErreurPaquet('ENTREE_TROP_GROSSE');
    e.total += m.length;
    e.suivant += 1;
    e.empreinte.update(m);
    e.morceaux.push(m);
  }

  get enCours(): boolean {
    return this.#encours.size > 0;
  }
}
