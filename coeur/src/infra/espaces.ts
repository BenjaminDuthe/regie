// regie — utilisateurs et espaces (histoire 1.9, FR-72).
// Chaque utilisateur a un espace personnel, dont il est propriétaire, plus l'espace de la marque. Les lignes sont
// cloisonnées par la RLS : marque ET utilisateur (`app.utilisateur_id`), sans quoi rien n'est visible.

import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { dansTransactionUtilisateur } from './base.ts';

export type GenreEspace = 'personnel' | 'marque';

export type Espace = Readonly<{
  id: string;
  marqueId: string;
  proprietaireId: string;
  genre: GenreEspace;
  nom: string;
}>;

/** Nom stocké de l'espace personnel (donnée) ; l'interface l'affiche par son genre, depuis chaines.json. */
export const NOM_ESPACE_PERSONNEL = 'Espace personnel';

export interface Espaces {
  /**
   * Première connexion comprise : crée l'utilisateur et ses deux espaces s'ils manquent (sans rien dupliquer
   * ensuite). Rend l'identifiant de l'utilisateur, ses espaces (personnel en premier) et ceux créés à l'instant.
   */
  assurer(marqueId: string, sub: string, email: string | undefined, nomMarque: string): Promise<{ utilisateurId: string; espaces: Espace[]; crees: Espace[] }>;
  /** Les espaces de cet utilisateur, et d'eux seuls. */
  lister(marqueId: string, sub: string): Promise<Espace[]>;
}

/**
 * Identifiant stable d'un utilisateur : un UUID tiré de SHA-256(marque, sub). Il permet de poser
 * `app.utilisateur_id` avant toute lecture, sans table de correspondance lisible hors RLS.
 */
export function idUtilisateur(marqueId: string, sub: string): string {
  const octets = createHash('sha256').update(`utilisateur:${marqueId}:${sub}`).digest().subarray(0, 16);
  octets[6] = (octets[6]! & 0x0f) | 0x50;
  octets[8] = (octets[8]! & 0x3f) | 0x80;
  const hex = octets.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Espace personnel d'abord, puis celui de la marque. */
export const trierEspaces = (espaces: readonly Espace[]): Espace[] => [...espaces].sort((a, b) => (a.genre === b.genre ? 0 : a.genre === 'personnel' ? -1 : 1));

type LigneEspace = { id: string; marque_id: string; proprietaire_id: string; genre: GenreEspace; nom: string };
const versEspace = (l: LigneEspace): Espace => ({ id: l.id, marqueId: l.marque_id, proprietaireId: l.proprietaire_id, genre: l.genre, nom: l.nom });
const COLONNES = 'id, marque_id, proprietaire_id, genre, nom';

export class EspacesPg implements Espaces {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async assurer(marqueId: string, sub: string, email: string | undefined, nomMarque: string) {
    const utilisateurId = idUtilisateur(marqueId, sub);
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      await client.query('INSERT INTO utilisateurs (id, marque_id, sub, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [
        utilisateurId,
        marqueId,
        sub,
        email ?? null,
      ]);
      const crees: Espace[] = [];
      for (const [genre, nom] of [['personnel', NOM_ESPACE_PERSONNEL], ['marque', nomMarque]] as const) {
        const { rows } = await client.query<LigneEspace>(
          `INSERT INTO espaces (marque_id, proprietaire_id, genre, nom) VALUES ($1, $2, $3, $4)
           ON CONFLICT (proprietaire_id, genre) DO NOTHING RETURNING ${COLONNES}`,
          [marqueId, utilisateurId, genre, nom],
        );
        if (rows[0] !== undefined) crees.push(versEspace(rows[0]));
      }
      const { rows } = await client.query<LigneEspace>(`SELECT ${COLONNES} FROM espaces`);
      return { utilisateurId, espaces: trierEspaces(rows.map(versEspace)), crees };
    });
  }

  async lister(marqueId: string, sub: string): Promise<Espace[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, idUtilisateur(marqueId, sub), async (client) => {
      const { rows } = await client.query<LigneEspace>(`SELECT ${COLONNES} FROM espaces`);
      return trierEspaces(rows.map(versEspace));
    });
  }
}
