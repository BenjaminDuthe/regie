// regie — stockage en mémoire pour les tests (histoire 4.6).
import { Readable } from 'node:stream';
import type { LectureStockage, Stockage } from '../src/infra/stockage.ts';

export class StockageMemoire implements Stockage {
  readonly fichiers = new Map<string, Buffer>();
  readonly #cle = (m: string, f: string): string => `${m}/${f}`;

  async ecrire(marqueId: string, fichierId: string, octets: Uint8Array): Promise<void> {
    this.fichiers.set(this.#cle(marqueId, fichierId), Buffer.from(octets));
  }

  async lire(marqueId: string, fichierId: string): Promise<Buffer | undefined> {
    return this.fichiers.get(this.#cle(marqueId, fichierId));
  }

  async ouvrir(marqueId: string, fichierId: string, plage?: Readonly<{ debut: number; fin: number }>): Promise<LectureStockage | undefined> {
    const tout = this.fichiers.get(this.#cle(marqueId, fichierId));
    if (tout === undefined) return undefined;
    return { octets: tout.length, flux: Readable.from([plage === undefined ? tout : tout.subarray(plage.debut, plage.fin + 1)]) };
  }

  async supprimer(marqueId: string, fichierId: string): Promise<void> {
    this.fichiers.delete(this.#cle(marqueId, fichierId));
  }
}
