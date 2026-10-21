// regie — applications à filmer et leurs hôtes autorisés (histoire 4.1, FR-13, FR-17). Tout passe par
// `dansTransactionUtilisateur` : la RLS cloisonne par marque, et par espace visible de la personne.

import type { Pool } from 'pg';
import { dansTransactionUtilisateur } from './base.ts';

export type Application = Readonly<{
  id: string;
  espaceId: string;
  nom: string;
  accueil: string;
  hotes: readonly string[];
  version: number;
  creeLe: Date;
  modifieLe: Date;
}>;

export type ChampsApplication = Readonly<{ nom: string; accueil: string; hotes: readonly string[] }>;

export interface Applications {
  lister(marqueId: string, utilisateurId: string, espaceId?: string): Promise<Application[]>;
  lire(marqueId: string, utilisateurId: string, id: string): Promise<Application | undefined>;
  /** `undefined` si l'espace n'existe pas pour cette personne ; lève `NOM_PRIS` si le nom existe déjà dans l'espace. */
  creer(n: { marqueId: string; utilisateurId: string; espaceId: string } & ChampsApplication): Promise<Application | undefined>;
  /** `undefined` si l'application n'existe pas pour cette personne. La version augmente à chaque remplacement. */
  remplacer(marqueId: string, utilisateurId: string, id: string, champs: ChampsApplication): Promise<Application | undefined>;
}

/** Levée quand le nom est déjà pris dans l'espace (contrainte d'unicité). */
export class NomApplicationPris extends Error {
  constructor() {
    super('NOM_PRIS');
    this.name = 'NomApplicationPris';
  }
}

type Ligne = { id: string; espace_id: string; nom: string; accueil: string; hotes: string[]; version: number; cree_le: Date; modifie_le: Date };
const COLONNES = 'id, espace_id, nom, accueil, hotes, version, cree_le, modifie_le';
const versApplication = (l: Ligne): Application => ({ id: l.id, espaceId: l.espace_id, nom: l.nom, accueil: l.accueil, hotes: l.hotes, version: l.version, creeLe: l.cree_le, modifieLe: l.modifie_le });
const estDoublon = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

export class ApplicationsPg implements Applications {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async lister(marqueId: string, utilisateurId: string, espaceId?: string): Promise<Application[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM applications WHERE ($1::uuid IS NULL OR espace_id = $1::uuid) ORDER BY cree_le, id`, [espaceId ?? null]);
      return rows.map(versApplication);
    });
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<Application | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM applications WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : versApplication(rows[0]);
    });
  }

  async creer(n: { marqueId: string; utilisateurId: string; espaceId: string } & ChampsApplication): Promise<Application | undefined> {
    try {
      return await dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
        const { rows } = await client.query<Ligne>(
          `INSERT INTO applications (marque_id, espace_id, nom, accueil, hotes)
           SELECT e.marque_id, e.id, $2, $3, $4::text[] FROM espaces e WHERE e.id = $1
           RETURNING ${COLONNES}`,
          [n.espaceId, n.nom, n.accueil, [...n.hotes]],
        );
        return rows[0] === undefined ? undefined : versApplication(rows[0]);
      });
    } catch (e) {
      if (estDoublon(e)) throw new NomApplicationPris();
      throw e;
    }
  }

  async remplacer(marqueId: string, utilisateurId: string, id: string, champs: ChampsApplication): Promise<Application | undefined> {
    try {
      return await dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
        const { rows } = await client.query<Ligne>(
          `UPDATE applications SET nom = $2, accueil = $3, hotes = $4::text[], version = version + 1, modifie_le = now()
           WHERE id = $1 RETURNING ${COLONNES}`,
          [id, champs.nom, champs.accueil, [...champs.hotes]],
        );
        return rows[0] === undefined ? undefined : versApplication(rows[0]);
      });
    } catch (e) {
      if (estDoublon(e)) throw new NomApplicationPris();
      throw e;
    }
  }
}
