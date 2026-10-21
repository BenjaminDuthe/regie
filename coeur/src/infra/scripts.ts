// regie — scripts de démo d'une application (histoire 4.4, FR-14). Tout passe par `dansTransactionUtilisateur` :
// la RLS cloisonne par marque, et par espace visible de la personne. Les étapes sont déjà validées par le cœur.

import type { Pool } from 'pg';
import type { DernierJeu, EtapeScript, OrigineScript } from '@regie/contrats';
import { dansTransactionUtilisateur } from './base.ts';

export type Script = Readonly<{
  id: string;
  espaceId: string;
  applicationId: string;
  nom: string;
  origine: OrigineScript;
  etapes: readonly EtapeScript[];
  dernierJeu: DernierJeu | null;
  version: number;
  creeLe: Date;
  modifieLe: Date;
}>;

export type ChampsScript = Readonly<{ nom: string; etapes: readonly EtapeScript[] }>;

export type ResultatRemplacement = Readonly<{ etat: 'ok'; script: Script }> | Readonly<{ etat: 'introuvable' }> | Readonly<{ etat: 'perimee' }>;

export interface Scripts {
  lister(marqueId: string, utilisateurId: string, applicationId?: string): Promise<Script[]>;
  lire(marqueId: string, utilisateurId: string, id: string): Promise<Script | undefined>;
  /** `undefined` si l'application n'existe pas pour cette personne ; lève `NomScriptPris` si le nom existe déjà pour cette application. */
  creer(n: { marqueId: string; utilisateurId: string; applicationId: string; origine: OrigineScript } & ChampsScript): Promise<Script | undefined>;
  /** Remplace nom et étapes si la version est celle que la personne a lue. Le dernier jeu est remis à vide. */
  remplacer(marqueId: string, utilisateurId: string, id: string, champs: ChampsScript, versionLue: number): Promise<ResultatRemplacement>;
  /**
   * Écrit le résultat du dernier jeu (capture, histoire 4.5). `false` si le script n'existe pas pour cette personne,
   * ou si `versionJouee` est donnée et que le script a changé depuis (le résultat ne dirait rien des nouvelles étapes).
   */
  enregistrerJeu(marqueId: string, utilisateurId: string, id: string, jeu: DernierJeu, versionJouee?: number): Promise<boolean>;
}

/** Levée quand le nom est déjà pris pour cette application (contrainte d'unicité). */
export class NomScriptPris extends Error {
  constructor() {
    super('NOM_PRIS');
    this.name = 'NomScriptPris';
  }
}

type Ligne = { id: string; espace_id: string; application_id: string; nom: string; origine: OrigineScript; etapes: EtapeScript[]; dernier_jeu: DernierJeu | null; version: number; cree_le: Date; modifie_le: Date };
const COLONNES = 'id, espace_id, application_id, nom, origine, etapes, dernier_jeu, version, cree_le, modifie_le';
const versScript = (l: Ligne): Script => ({ id: l.id, espaceId: l.espace_id, applicationId: l.application_id, nom: l.nom, origine: l.origine, etapes: l.etapes, dernierJeu: l.dernier_jeu, version: l.version, creeLe: l.cree_le, modifieLe: l.modifie_le });
const estDoublon = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

export class ScriptsPg implements Scripts {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async lister(marqueId: string, utilisateurId: string, applicationId?: string): Promise<Script[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM scripts WHERE ($1::uuid IS NULL OR application_id = $1::uuid) ORDER BY cree_le, id`, [applicationId ?? null]);
      return rows.map(versScript);
    });
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<Script | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM scripts WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : versScript(rows[0]);
    });
  }

  async creer(n: { marqueId: string; utilisateurId: string; applicationId: string; origine: OrigineScript } & ChampsScript): Promise<Script | undefined> {
    try {
      return await dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
        const { rows } = await client.query<Ligne>(
          `INSERT INTO scripts (marque_id, espace_id, application_id, nom, origine, etapes)
           SELECT a.marque_id, a.espace_id, a.id, $2, $3, $4::jsonb FROM applications a WHERE a.id = $1
           RETURNING ${COLONNES}`,
          [n.applicationId, n.nom, n.origine, JSON.stringify(n.etapes)],
        );
        return rows[0] === undefined ? undefined : versScript(rows[0]);
      });
    } catch (e) {
      if (estDoublon(e)) throw new NomScriptPris();
      throw e;
    }
  }

  async remplacer(marqueId: string, utilisateurId: string, id: string, champs: ChampsScript, versionLue: number): Promise<ResultatRemplacement> {
    try {
      return await dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
        const { rows } = await client.query<Ligne>(
          `UPDATE scripts SET nom = $2, etapes = $3::jsonb, dernier_jeu = NULL, version = version + 1, modifie_le = now()
           WHERE id = $1 AND version = $4 RETURNING ${COLONNES}`,
          [id, champs.nom, JSON.stringify(champs.etapes), versionLue],
        );
        if (rows[0] !== undefined) return { etat: 'ok', script: versScript(rows[0]) } as const;
        const existe = await client.query('SELECT 1 FROM scripts WHERE id = $1', [id]);
        return existe.rowCount === 0 ? ({ etat: 'introuvable' } as const) : ({ etat: 'perimee' } as const);
      });
    } catch (e) {
      if (estDoublon(e)) throw new NomScriptPris();
      throw e;
    }
  }

  async enregistrerJeu(marqueId: string, utilisateurId: string, id: string, jeu: DernierJeu, versionJouee?: number): Promise<boolean> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const r = await client.query('UPDATE scripts SET dernier_jeu = $2::jsonb WHERE id = $1 AND ($3::int IS NULL OR version = $3::int)', [id, JSON.stringify(jeu), versionJouee ?? null]);
      return (r.rowCount ?? 0) > 0;
    });
  }
}
