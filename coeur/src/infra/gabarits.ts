// regie — gabarits des espaces (histoires 2.7 et 2.8, FR-55, FR-6). Un espace reçoit le gabarit de départ la première
// fois qu'on en liste les gabarits (« assurer » : jamais de doublon, un seul gabarit par défaut par espace). Tout passe
// par `dansTransactionUtilisateur` : la RLS cloisonne par marque, et par espace visible de la personne.

import type { Pool } from 'pg';
import { dansTransactionUtilisateur } from './base.ts';
import { GABARIT_DE_DEPART, NOM_GABARIT_DE_DEPART, definitionGabarit, type DefinitionGabarit } from '../domaine/gabarit.ts';

export type Gabarit = Readonly<{
  id: string;
  espaceId: string;
  nom: string;
  definition: DefinitionGabarit;
  parDefaut: boolean;
  version: number;
  creeLe: Date;
  modifieLe: Date;
}>;

export interface Gabarits {
  /** Les gabarits des espaces de la personne (ou d'un seul), en donnant le gabarit de départ à ceux qui n'en ont pas. */
  lister(marqueId: string, utilisateurId: string, espaceId?: string): Promise<Gabarit[]>;
  lire(marqueId: string, utilisateurId: string, id: string): Promise<Gabarit | undefined>;
  /** `undefined` si l'espace n'existe pas pour cette personne. */
  creer(n: { marqueId: string; utilisateurId: string; espaceId: string; nom: string; definition: DefinitionGabarit }): Promise<Gabarit | undefined>;
  /** `undefined` si le gabarit n'existe pas pour cette personne. La version augmente à chaque remplacement. */
  remplacer(marqueId: string, utilisateurId: string, id: string, changement: { nom?: string; definition: DefinitionGabarit }): Promise<Gabarit | undefined>;
}

type Ligne = { id: string; espace_id: string; nom: string; definition: unknown; par_defaut: boolean; version: number; cree_le: Date; modifie_le: Date };
const COLONNES = 'id, espace_id, nom, definition, par_defaut, version, cree_le, modifie_le';
const versGabarit = (l: Ligne): Gabarit => ({ id: l.id, espaceId: l.espace_id, nom: l.nom, definition: definitionGabarit.parse(l.definition), parDefaut: l.par_defaut, version: l.version, creeLe: l.cree_le, modifieLe: l.modifie_le });

export class GabaritsPg implements Gabarits {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async lister(marqueId: string, utilisateurId: string, espaceId?: string): Promise<Gabarit[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      // La RLS de `espaces` limite la sélection aux espaces de la personne ; ON CONFLICT couvre deux appels simultanés.
      await client.query(
        `INSERT INTO gabarits (marque_id, espace_id, nom, definition, par_defaut)
         SELECT e.marque_id, e.id, $1, $2::jsonb, true FROM espaces e
         WHERE NOT EXISTS (SELECT 1 FROM gabarits g WHERE g.espace_id = e.id)
         ON CONFLICT DO NOTHING`,
        [NOM_GABARIT_DE_DEPART, JSON.stringify(GABARIT_DE_DEPART)],
      );
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM gabarits WHERE ($1::uuid IS NULL OR espace_id = $1::uuid) ORDER BY cree_le, id`, [espaceId ?? null]);
      return rows.map(versGabarit);
    });
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<Gabarit | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM gabarits WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : versGabarit(rows[0]);
    });
  }

  async creer(n: { marqueId: string; utilisateurId: string; espaceId: string; nom: string; definition: DefinitionGabarit }): Promise<Gabarit | undefined> {
    return dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `INSERT INTO gabarits (marque_id, espace_id, nom, definition)
         SELECT e.marque_id, e.id, $2, $3::jsonb FROM espaces e WHERE e.id = $1
         RETURNING ${COLONNES}`,
        [n.espaceId, n.nom, JSON.stringify(n.definition)],
      );
      return rows[0] === undefined ? undefined : versGabarit(rows[0]);
    });
  }

  async remplacer(marqueId: string, utilisateurId: string, id: string, changement: { nom?: string; definition: DefinitionGabarit }): Promise<Gabarit | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `UPDATE gabarits SET nom = COALESCE($2, nom), definition = $3::jsonb, version = version + 1, modifie_le = now()
         WHERE id = $1 RETURNING ${COLONNES}`,
        [id, changement.nom ?? null, JSON.stringify(changement.definition)],
      );
      return rows[0] === undefined ? undefined : versGabarit(rows[0]);
    });
  }
}
