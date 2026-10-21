// regie — traces du proxy de capture (histoire 4.2, AD-10) : chaque destination demandée, acceptée ou refusée, est
// écrite en JSON (une ligne par décision) dans un fichier par jour, conservé un an puis supprimé. On y trace l'hôte,
// l'adresse validée et la cause d'un refus ; jamais le contenu des échanges (le tunnel est chiffré), jamais un
// laissez-passer.

import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const CONSERVATION_JOURS = 365;

export type Trace = Readonly<{
  /** ISO 8601 UTC. */
  date: string;
  /** Tâche du laissez-passer, si celui-ci était valide. */
  tache?: string;
  hote: string;
  port?: number;
  /** Adresse validée à laquelle le proxy s'est connecté. */
  ip?: string;
  decision: 'autorisee' | 'refusee';
  cause?: string;
}>;

export type Traceur = (trace: Trace) => void;

const MOTIF_FICHIER = /^traces-(\d{4}-\d{2}-\d{2})\.ndjson$/;

/** Écrit les traces dans `dossier`, un fichier par jour. Une trace qui ne s'écrit pas lève : le proxy refuse alors la connexion. */
export function traceurFichier(dossier: string): Traceur {
  mkdirSync(dossier, { recursive: true, mode: 0o750 });
  return (trace) => {
    appendFileSync(join(dossier, `traces-${trace.date.slice(0, 10)}.ndjson`), `${JSON.stringify(trace)}\n`, { mode: 0o640 });
  };
}

/** Supprime les fichiers de traces de plus d'un an. Rend les noms supprimés. */
export function purgerTraces(dossier: string, maintenantMs: number = Date.now()): string[] {
  const limite = maintenantMs - CONSERVATION_JOURS * 86_400_000;
  const supprimes: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const m = MOTIF_FICHIER.exec(nom);
    if (m?.[1] === undefined) continue;
    // Le fichier du jour D couvre jusqu'à la fin de D : conservé tant que D + 1 jour est dans l'année.
    if (Date.parse(`${m[1]}T00:00:00Z`) + 86_400_000 < limite) {
      unlinkSync(join(dossier, nom));
      supprimes.push(nom);
    }
  }
  return supprimes;
}
