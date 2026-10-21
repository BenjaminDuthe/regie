// regie — stockage des fichiers (histoire 4.6) : les films, les voix et les rendus vivent sur disque, par marque,
// sous `<REGIE_DONNEES>/<marque>/<fichier>`. Les identifiants sont des UUID validés : aucun nom venu d'une requête ne
// compose un chemin. La base garde la taille, l'empreinte et la date de purge (table `fichiers`).

import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type LectureStockage = Readonly<{ flux: Readable; octets: number }>;

export interface Stockage {
  ecrire(marqueId: string, fichierId: string, octets: Uint8Array): Promise<void>;
  /** Lit tout le fichier ; `undefined` s'il n'existe pas (ou plus : purgé). */
  lire(marqueId: string, fichierId: string): Promise<Buffer | undefined>;
  /** Ouvre un flux sur une plage d'octets (bornes incluses) ; `undefined` si le fichier n'existe pas. */
  ouvrir(marqueId: string, fichierId: string, plage?: Readonly<{ debut: number; fin: number }>): Promise<LectureStockage | undefined>;
  supprimer(marqueId: string, fichierId: string): Promise<void>;
}

export class StockageDisque implements Stockage {
  readonly #racine: string;

  constructor(racine: string) {
    this.#racine = resolve(racine);
  }

  #chemin(marqueId: string, fichierId: string): string {
    if (!UUID.test(marqueId) || !UUID.test(fichierId)) throw new Error('identifiant de fichier invalide');
    const chemin = resolve(join(this.#racine, marqueId, fichierId));
    if (!chemin.startsWith(this.#racine + sep)) throw new Error('chemin hors du stockage');
    return chemin;
  }

  async ecrire(marqueId: string, fichierId: string, octets: Uint8Array): Promise<void> {
    const chemin = this.#chemin(marqueId, fichierId);
    await mkdir(dirname(chemin), { recursive: true, mode: 0o700 });
    // Écriture atomique : un lecteur ne voit jamais un fichier à moitié écrit.
    const temporaire = `${chemin}.${randomUUID()}.tmp`;
    await writeFile(temporaire, octets, { mode: 0o600 });
    await rename(temporaire, chemin);
  }

  async lire(marqueId: string, fichierId: string): Promise<Buffer | undefined> {
    const lecture = await this.ouvrir(marqueId, fichierId);
    if (lecture === undefined) return undefined;
    const morceaux: Buffer[] = [];
    for await (const m of lecture.flux) morceaux.push(m as Buffer);
    return Buffer.concat(morceaux);
  }

  async ouvrir(marqueId: string, fichierId: string, plage?: Readonly<{ debut: number; fin: number }>): Promise<LectureStockage | undefined> {
    const chemin = this.#chemin(marqueId, fichierId);
    let octets: number;
    try {
      octets = (await stat(chemin)).size;
    } catch {
      return undefined;
    }
    return { octets, flux: createReadStream(chemin, plage === undefined ? {} : { start: plage.debut, end: plage.fin }) };
  }

  async supprimer(marqueId: string, fichierId: string): Promise<void> {
    await rm(this.#chemin(marqueId, fichierId), { force: true });
  }
}
