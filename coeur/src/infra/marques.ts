// regie — la marque de la session (histoire 1.14). V1 : une seule marque, Établia (AD-2, recentrage du 2026-10-18).
// Les identifiants viennent de marques_identifiants() (fonction qui ne rend que des identifiants) ; la
// création passe par dansTransactionMarque, sous la RLS comme tout le reste.

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { dansTransactionMarque } from './base.ts';

export type MarqueUnique = Readonly<{ etat: 'une'; id: string }> | Readonly<{ etat: 'aucune' }> | Readonly<{ etat: 'plusieurs' }>;

export interface Marques {
  trouverUnique(): Promise<MarqueUnique>;
  creer(nom: string): Promise<string>;
}

export const NOM_MARQUE_UNIQUE = 'Établia';

export class MarquesPg implements Marques {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async trouverUnique(): Promise<MarqueUnique> {
    const { rows } = await this.#pool.query<{ id: string }>('SELECT marques_identifiants() AS id');
    if (rows.length === 0) return { etat: 'aucune' };
    const premiere = rows[0];
    return rows.length === 1 && premiere !== undefined ? { etat: 'une', id: premiere.id } : { etat: 'plusieurs' };
  }

  async creer(nom: string): Promise<string> {
    const id = randomUUID();
    await dansTransactionMarque(this.#pool, id, (client) => client.query('INSERT INTO marques (id, nom) VALUES ($1, $2)', [id, nom]));
    return id;
  }
}
