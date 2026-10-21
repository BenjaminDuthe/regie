// regie — clés d'application des réseaux de publication (histoire 7.1, FR-39). La clé (identifiant + secret de
// l'application chez le réseau) vit UNIQUEMENT dans le coffre chiffré (type `cle_reseau`, une par réseau et par marque) :
// elle ne se réaffiche jamais, ne s'écrit dans aucun journal. Cette interface n'offre pour elle que : remplacer, lire
// (pour le connecteur seul) et connaître l'état.

import type { Pool } from 'pg';
import type { Reseau } from '../domaine/bornes.ts';
import type { CleApplication } from '../publication/connecteur.ts';
import type { Coffre } from './coffre.ts';
import { dateSecret, lireSecretParNom, remplacerSecret } from './base.ts';

export const TYPE_SECRET_CLE_RESEAU = 'cle_reseau';
export const nomSecretCleReseau = (reseau: Reseau): string => reseau;

export type EtatCle = Readonly<{ deposee: boolean; modifieLe: Date | undefined }>;

export interface Reseaux {
  remplacerCle(marqueId: string, reseau: Reseau, cle: CleApplication): Promise<void>;
  /** Réservé aux connecteurs et aux routes OAuth : aucune action ne rend ce résultat. */
  lireCle(marqueId: string, reseau: Reseau): Promise<CleApplication | undefined>;
  etatCle(marqueId: string, reseau: Reseau): Promise<EtatCle>;
}

export const serialiserCle = (c: CleApplication): string => JSON.stringify({ idApplication: c.idApplication, secret: c.secret });

export function lireCleSerialisee(clair: string): CleApplication | undefined {
  try {
    const o = JSON.parse(clair) as Record<string, unknown>;
    return typeof o['idApplication'] === 'string' && typeof o['secret'] === 'string' ? { idApplication: o['idApplication'], secret: o['secret'] } : undefined;
  } catch {
    return undefined;
  }
}

export class ReseauxPg implements Reseaux {
  readonly #pool: Pool;
  readonly #coffre: Coffre;

  constructor(pool: Pool, coffre: Coffre) {
    this.#pool = pool;
    this.#coffre = coffre;
  }

  async remplacerCle(marqueId: string, reseau: Reseau, cle: CleApplication): Promise<void> {
    await remplacerSecret(this.#pool, this.#coffre, { marqueId, type: TYPE_SECRET_CLE_RESEAU, nom: nomSecretCleReseau(reseau), clair: serialiserCle(cle) });
  }

  async lireCle(marqueId: string, reseau: Reseau): Promise<CleApplication | undefined> {
    const clair = await lireSecretParNom(this.#pool, this.#coffre, marqueId, TYPE_SECRET_CLE_RESEAU, nomSecretCleReseau(reseau));
    return clair === undefined ? undefined : lireCleSerialisee(clair);
  }

  async etatCle(marqueId: string, reseau: Reseau): Promise<EtatCle> {
    const modifieLe = await dateSecret(this.#pool, marqueId, TYPE_SECRET_CLE_RESEAU, nomSecretCleReseau(reseau));
    return { deposee: modifieLe !== undefined, modifieLe };
  }
}
