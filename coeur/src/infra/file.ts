// regie — la file de traitement durable (histoire 2.1, AR-15). Les règles (prise sous bail, SKIP LOCKED, sémaphore GPU,
// reprise après un arrêt) sont des fonctions SQL (migration 0006) : ce fichier les appelle, rien de plus.
// Chaque appel passe par une transaction de marque : la RLS s'applique, une marque ne voit jamais les tâches d'une autre.

import type { ClientBase, Pool, PoolClient } from 'pg';
import { TACHES, type ClasseTache, type EtatTache, type PolitiqueReprise } from '@regie/contrats';
import { dansTransactionMarque } from './base.ts';

export type Tache = Readonly<{
  id: string;
  marqueId: string;
  utilisateurId: string;
  type: string;
  classe: ClasseTache;
  gpu: boolean;
  reprise: PolitiqueReprise;
  delaiGardeS: number;
  tentativesMax: number;
  entree: Readonly<Record<string, unknown>>;
  etat: EtatTache;
  tentatives: number;
  reprises: number;
  disponibleLe: Date;
  verrouPar: string | undefined;
  bailJusqua: Date | undefined;
  pointDeNonRetour: boolean;
  resultat: unknown;
  cause: string | undefined;
  action: string | undefined;
  creeLe: Date;
  demarreeLe: Date | undefined;
  termineeLe: Date | undefined;
  resultatAppliqueLe: Date | undefined;
}>;

export type Tentative = Readonly<{ numero: number; debut: Date; fin: Date | undefined; issue: string; cause: string | undefined }>;

export type OptionsEnfiler = Readonly<{
  /** Pas avant cet instant (par défaut tout de suite). */
  disponibleLe?: Date;
  /** Relève le délai de garde du type (transcription : 3 × la durée du média). */
  delaiGardeS?: number;
}>;

/** Dans la base : la transaction où le résultat est appliqué ; en mémoire (tests) : `undefined`. */
export type Transaction = ClientBase | undefined;
export type Applicateur = (tache: Tache, transaction: Transaction) => Promise<void>;

/** Un bail de 60 s renouvelé toutes les 15 s : le service peut manquer deux renouvellements sans perdre sa tâche. */
export const BAIL_S = 60;
export const RENOUVELLEMENT_S = 15;

export class ErreurFile extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurFile';
  }
}

export interface File {
  enfiler(marqueId: string, utilisateurId: string, type: string, entree: Readonly<Record<string, unknown>>, options?: OptionsEnfiler): Promise<Tache>;
  prendre(marqueId: string, service: string, bailS?: number, renouvellementS?: number): Promise<Tache | undefined>;
  renouveler(marqueId: string, id: string, service: string, bailS?: number): Promise<boolean>;
  terminer(marqueId: string, id: string, service: string, resultat: unknown): Promise<boolean>;
  echouer(marqueId: string, id: string, service: string, cause: string, action: string, reessayer: boolean): Promise<EtatTache | undefined>;
  pointDeNonRetour(marqueId: string, id: string, service: string): Promise<boolean>;
  /** Reprend les tâches dont le bail a expiré ; rend leur nombre. */
  recuperer(marqueId: string): Promise<number>;
  /** Applique, une seule fois chacun, les résultats des tâches terminées. Rend le nombre appliqué. */
  appliquerResultats(marqueId: string, appliquer: Applicateur): Promise<number>;
  // Côté personne : toujours bornées à ses propres tâches.
  lire(marqueId: string, utilisateurId: string, id: string): Promise<Tache | undefined>;
  lister(marqueId: string, utilisateurId: string, limite: number): Promise<Tache[]>;
  historique(marqueId: string, utilisateurId: string, id: string): Promise<Tentative[]>;
  annuler(marqueId: string, utilisateurId: string, id: string): Promise<boolean>;
  geler(marqueId: string, utilisateurId: string, id: string): Promise<boolean>;
  degeler(marqueId: string, utilisateurId: string, id: string): Promise<boolean>;
  relancer(marqueId: string, utilisateurId: string, id: string): Promise<boolean>;
}

type Ligne = {
  id: string;
  marque_id: string;
  utilisateur_id: string;
  type: string;
  classe: ClasseTache;
  gpu: boolean;
  reprise: PolitiqueReprise;
  delai_garde_s: number;
  tentatives_max: number;
  entree: Record<string, unknown>;
  etat: EtatTache;
  tentatives: number;
  reprises: number;
  disponible_le: Date;
  verrou_par: string | null;
  bail_jusqua: Date | null;
  point_de_non_retour: boolean;
  resultat: unknown;
  cause: string | null;
  action: string | null;
  cree_le: Date;
  demarree_le: Date | null;
  terminee_le: Date | null;
  resultat_applique_le: Date | null;
};

export function versTache(l: Ligne): Tache {
  return {
    id: l.id,
    marqueId: l.marque_id,
    utilisateurId: l.utilisateur_id,
    type: l.type,
    classe: l.classe,
    gpu: l.gpu,
    reprise: l.reprise,
    delaiGardeS: l.delai_garde_s,
    tentativesMax: l.tentatives_max,
    entree: l.entree,
    etat: l.etat,
    tentatives: l.tentatives,
    reprises: l.reprises,
    disponibleLe: l.disponible_le,
    verrouPar: l.verrou_par ?? undefined,
    bailJusqua: l.bail_jusqua ?? undefined,
    pointDeNonRetour: l.point_de_non_retour,
    resultat: l.resultat ?? undefined,
    cause: l.cause ?? undefined,
    action: l.action ?? undefined,
    creeLe: l.cree_le,
    demarreeLe: l.demarree_le ?? undefined,
    termineeLe: l.terminee_le ?? undefined,
    resultatAppliqueLe: l.resultat_applique_le ?? undefined,
  };
}

export class FilePg implements File {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async enfiler(marqueId: string, utilisateurId: string, type: string, entree: Readonly<Record<string, unknown>>, options: OptionsEnfiler = {}): Promise<Tache> {
    const definition = TACHES[type];
    if (definition === undefined) throw new ErreurFile(`type de tâche inconnu : ${type}`);
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `INSERT INTO taches (marque_id, utilisateur_id, type, classe, gpu, reprise, delai_garde_s, tentatives_max, entree, disponible_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, coalesce($10::timestamptz, now())) RETURNING *`,
        [marqueId, utilisateurId, type, definition.classe, definition.gpu, definition.reprise, options.delaiGardeS ?? definition.delaiGardeS, definition.tentativesMax, JSON.stringify(entree), options.disponibleLe ?? null],
      );
      return versTache(rows[0]!);
    });
  }

  async prendre(marqueId: string, service: string, bailS = BAIL_S, renouvellementS = RENOUVELLEMENT_S): Promise<Tache | undefined> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<Ligne>('SELECT * FROM file_prendre($1, $2, $3)', [service, bailS, renouvellementS]);
      return rows[0] === undefined ? undefined : versTache(rows[0]);
    });
  }

  async renouveler(marqueId: string, id: string, service: string, bailS = BAIL_S): Promise<boolean> {
    return this.#booleen(marqueId, 'SELECT file_renouveler($1, $2, $3) AS ok', [id, service, bailS]);
  }

  async terminer(marqueId: string, id: string, service: string, resultat: unknown): Promise<boolean> {
    return this.#booleen(marqueId, 'SELECT file_terminer($1, $2, $3::jsonb) AS ok', [id, service, JSON.stringify(resultat ?? null)]);
  }

  async echouer(marqueId: string, id: string, service: string, cause: string, action: string, reessayer: boolean): Promise<EtatTache | undefined> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<{ etat: EtatTache | null }>('SELECT file_echouer($1, $2, $3, $4, $5) AS etat', [id, service, cause, action, reessayer]);
      return rows[0]?.etat ?? undefined;
    });
  }

  async pointDeNonRetour(marqueId: string, id: string, service: string): Promise<boolean> {
    return this.#booleen(marqueId, 'SELECT file_point_de_non_retour($1, $2) AS ok', [id, service]);
  }

  async recuperer(marqueId: string): Promise<number> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<{ n: number }>('SELECT file_recuperer() AS n');
      return rows[0]?.n ?? 0;
    });
  }

  async appliquerResultats(marqueId: string, appliquer: Applicateur): Promise<number> {
    let appliques = 0;
    // Une transaction par tâche : l'effet de l'application et le marquage « appliqué » réussissent ou échouent ensemble.
    for (;;) {
      const fait = await dansTransactionMarque(this.#pool, marqueId, async (client) => {
        const { rows } = await client.query<Ligne>(
          `SELECT * FROM taches WHERE etat = 'terminee' AND resultat_applique_le IS NULL
           ORDER BY terminee_le, id FOR UPDATE SKIP LOCKED LIMIT 1`,
        );
        if (rows[0] === undefined) return false;
        await appliquer(versTache(rows[0]), client);
        await client.query('UPDATE taches SET resultat_applique_le = now() WHERE id = $1', [rows[0].id]);
        return true;
      });
      if (!fait) return appliques;
      appliques += 1;
    }
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<Tache | undefined> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<Ligne>('SELECT * FROM taches WHERE id = $1 AND utilisateur_id = $2', [id, utilisateurId]);
      return rows[0] === undefined ? undefined : versTache(rows[0]);
    });
  }

  async lister(marqueId: string, utilisateurId: string, limite: number): Promise<Tache[]> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<Ligne>('SELECT * FROM taches WHERE utilisateur_id = $1 ORDER BY cree_le DESC, id LIMIT $2', [utilisateurId, limite]);
      return rows.map(versTache);
    });
  }

  async historique(marqueId: string, utilisateurId: string, id: string): Promise<Tentative[]> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<{ numero: number; debut: Date; fin: Date | null; issue: string; cause: string | null }>(
        `SELECT t.numero, t.debut, t.fin, t.issue, t.cause FROM tentatives_taches t
          JOIN taches k ON k.id = t.tache_id WHERE t.tache_id = $1 AND k.utilisateur_id = $2 ORDER BY t.numero`,
        [id, utilisateurId],
      );
      return rows.map((r) => ({ numero: r.numero, debut: r.debut, fin: r.fin ?? undefined, issue: r.issue, cause: r.cause ?? undefined }));
    });
  }

  annuler(marqueId: string, utilisateurId: string, id: string): Promise<boolean> {
    return this.#duProprietaire(marqueId, utilisateurId, id, 'SELECT file_annuler($1) AS ok');
  }

  geler(marqueId: string, utilisateurId: string, id: string): Promise<boolean> {
    return this.#duProprietaire(marqueId, utilisateurId, id, 'SELECT file_geler($1) AS ok');
  }

  degeler(marqueId: string, utilisateurId: string, id: string): Promise<boolean> {
    return this.#duProprietaire(marqueId, utilisateurId, id, 'SELECT file_degeler($1) AS ok');
  }

  relancer(marqueId: string, utilisateurId: string, id: string): Promise<boolean> {
    return this.#duProprietaire(marqueId, utilisateurId, id, 'SELECT file_relancer($1) AS ok');
  }

  async #booleen(marqueId: string, sql: string, valeurs: unknown[]): Promise<boolean> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<{ ok: boolean }>(sql, valeurs);
      return rows[0]?.ok === true;
    });
  }

  /** Les gestes d'une personne ne touchent que ses tâches : l'appartenance se vérifie dans la même transaction. */
  async #duProprietaire(marqueId: string, utilisateurId: string, id: string, sql: string): Promise<boolean> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const propre = await client.query('SELECT 1 FROM taches WHERE id = $1 AND utilisateur_id = $2 FOR UPDATE', [id, utilisateurId]);
      if (propre.rowCount === 0) return false;
      const { rows } = await client.query<{ ok: boolean }>(sql, [id]);
      return rows[0]?.ok === true;
    });
  }
}

/**
 * Écoute les NOTIFY « file_resultats » sur une connexion dédiée. Une notification perdue ne coûte rien : le balayage
 * périodique applique de toute façon les résultats en attente. Rend la fonction d'arrêt.
 */
export function ecouterResultats(pool: Pool, surNotification: () => void, surErreur: (message: string) => void): () => void {
  let arrete = false;
  let client: PoolClient | undefined;
  let minuterie: NodeJS.Timeout | undefined;
  const connecter = async (): Promise<void> => {
    if (arrete) return;
    try {
      const c = await pool.connect();
      client = c;
      c.on('notification', surNotification);
      c.on('error', (e) => {
        surErreur(e.message);
        c.release(true);
        client = undefined;
        if (!arrete) minuterie = setTimeout(() => void connecter(), 5000);
      });
      await c.query('LISTEN file_resultats');
    } catch (e) {
      surErreur(e instanceof Error ? e.message : String(e));
      if (!arrete) minuterie = setTimeout(() => void connecter(), 5000);
    }
  };
  void connecter();
  return () => {
    arrete = true;
    if (minuterie !== undefined) clearTimeout(minuterie);
    client?.release(true);
    client = undefined;
  };
}
