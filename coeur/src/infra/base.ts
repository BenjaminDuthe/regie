// regie — accès à PostgreSQL : un pool par rôle, jamais de SET ROLE (AD-8) ; le coffre en base (AD-9).

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { ClientBase, Pool as PoolType } from 'pg';
import { Coffre, creerTemoin, rechiffrer, verifierTemoin, type ContexteSecret } from './coffre.ts';

const { Pool } = pg;

export type ReglagesBase = Readonly<{ hote: string; port: number; base: string; utilisateur: string; motDePasse: string }>;

export function creerPool(reglages: ReglagesBase, options: { max?: number } = {}): PoolType {
  return new Pool({
    host: reglages.hote,
    port: reglages.port,
    database: reglages.base,
    user: reglages.utilisateur,
    password: reglages.motDePasse,
    max: options.max ?? 10,
    connectionTimeoutMillis: 5_000,
    application_name: 'regie',
  });
}

/** Cause d'un échec de connexion, sans le message brut du pilote (qui peut citer l'hôte ou l'utilisateur). */
export function causeConnexion(erreur: unknown): string {
  const code = (erreur as { code?: string } | null)?.code;
  const causes: Record<string, string> = {
    ECONNREFUSED: 'connexion refusée',
    ENOTFOUND: 'hôte introuvable',
    ETIMEDOUT: 'délai dépassé',
    '28P01': 'authentification refusée',
    '28000': 'authentification refusée',
    '3D000': 'base inexistante',
  };
  return (code !== undefined ? causes[code] : undefined) ?? `erreur ${code ?? 'inconnue'}`;
}

/** Transaction sous une marque : `app.marque_id` posé en tête, valable pour cette transaction seulement. */
export async function dansTransactionMarque<T>(pool: PoolType, marqueId: string, travail: (client: ClientBase) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.marque_id', $1, true)", [marqueId]);
    const resultat = await travail(client);
    await client.query('COMMIT');
    return resultat;
  } catch (erreur) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw erreur;
  } finally {
    client.release();
  }
}

/**
 * Transaction sous une marque ET une personne : `app.marque_id` et `app.utilisateur_id` posés en tête.
 * Les tables cloisonnées par utilisateur (utilisateurs, espaces) ne montrent rien sans cette seconde variable.
 */
export async function dansTransactionUtilisateur<T>(
  pool: PoolType,
  marqueId: string,
  utilisateurId: string,
  travail: (client: ClientBase) => Promise<T>,
): Promise<T> {
  return dansTransactionMarque(pool, marqueId, async (client) => {
    await client.query("SELECT set_config('app.utilisateur_id', $1, true)", [utilisateurId]);
    return travail(client);
  });
}

/** Au démarrage : crée le témoin du coffre au premier lancement, sinon vérifie que la clé est la bonne. */
export async function verifierOuCreerTemoin(pool: PoolType, coffre: Coffre): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ chiffre: Buffer }>('SELECT chiffre FROM coffre_temoin');
    const existant = rows[0];
    if (existant === undefined) {
      await client.query('INSERT INTO coffre_temoin (chiffre) VALUES ($1)', [creerTemoin(coffre)]);
    } else {
      verifierTemoin(coffre, existant.chiffre);
    }
    await client.query('COMMIT');
  } catch (erreur) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw erreur;
  } finally {
    client.release();
  }
}

/** Dépose un secret : seul le chiffré va en base. Rend l'identifiant du secret. */
export async function deposerSecret(
  pool: PoolType,
  coffre: Coffre,
  secret: Readonly<{ marqueId: string; type: string; nom: string; clair: string }>,
): Promise<string> {
  const secretId = randomUUID();
  const chiffre = coffre.chiffrer(secret.clair, { secretId, marqueId: secret.marqueId, type: secret.type });
  await dansTransactionMarque(pool, secret.marqueId, (client) =>
    client.query('INSERT INTO secrets (id, marque_id, type, nom, chiffre) VALUES ($1, $2, $3, $4, $5)', [
      secretId,
      secret.marqueId,
      secret.type,
      secret.nom,
      chiffre,
    ]),
  );
  return secretId;
}

export async function lireSecret(pool: PoolType, coffre: Coffre, marqueId: string, secretId: string): Promise<string | undefined> {
  return dansTransactionMarque(pool, marqueId, async (client) => {
    const { rows } = await client.query<{ type: string; chiffre: Buffer }>('SELECT type, chiffre FROM secrets WHERE id = $1', [secretId]);
    const ligne = rows[0];
    if (ligne === undefined) return undefined;
    return coffre.dechiffrer(ligne.chiffre, { secretId, marqueId, type: ligne.type }).toString('utf8');
  });
}

/**
 * Remplace le secret `(type, nom)` d'une marque, ou le crée. Le remplacement GARDE l'identifiant du secret : il fait
 * partie des données authentifiées du chiffrement (AAD), un nouvel identifiant rendrait l'ancien chiffré illisible.
 */
export async function remplacerSecret(
  pool: PoolType,
  coffre: Coffre,
  secret: Readonly<{ marqueId: string; type: string; nom: string; clair: string }>,
): Promise<void> {
  await dansTransactionMarque(pool, secret.marqueId, async (client) => {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM secrets WHERE type = $1 AND nom = $2 FOR UPDATE', [secret.type, secret.nom]);
    const existant = rows[0]?.id;
    const secretId = existant ?? randomUUID();
    const chiffre = coffre.chiffrer(secret.clair, { secretId, marqueId: secret.marqueId, type: secret.type });
    if (existant === undefined) {
      await client.query('INSERT INTO secrets (id, marque_id, type, nom, chiffre) VALUES ($1, $2, $3, $4, $5)', [secretId, secret.marqueId, secret.type, secret.nom, chiffre]);
    } else {
      await client.query('UPDATE secrets SET chiffre = $1, modifie_le = now() WHERE id = $2', [chiffre, secretId]);
    }
  });
}

/** Lit un secret par son type et son nom ; `undefined` s'il n'existe pas pour cette marque. */
export async function lireSecretParNom(pool: PoolType, coffre: Coffre, marqueId: string, type: string, nom: string): Promise<string | undefined> {
  return dansTransactionMarque(pool, marqueId, async (client) => {
    const { rows } = await client.query<{ id: string; chiffre: Buffer }>('SELECT id, chiffre FROM secrets WHERE type = $1 AND nom = $2', [type, nom]);
    const ligne = rows[0];
    if (ligne === undefined) return undefined;
    return coffre.dechiffrer(ligne.chiffre, { secretId: ligne.id, marqueId, type }).toString('utf8');
  });
}

/** Supprime le secret `(type, nom)` de la marque ; rend vrai s'il existait. */
export async function supprimerSecret(pool: PoolType, marqueId: string, type: string, nom: string): Promise<boolean> {
  return dansTransactionMarque(pool, marqueId, async (client) => {
    const r = await client.query('DELETE FROM secrets WHERE type = $1 AND nom = $2', [type, nom]);
    return (r.rowCount ?? 0) > 0;
  });
}

/** Date du dernier dépôt d'un secret, sans jamais le déchiffrer. */
export async function dateSecret(pool: PoolType, marqueId: string, type: string, nom: string): Promise<Date | undefined> {
  return dansTransactionMarque(pool, marqueId, async (client) => {
    const { rows } = await client.query<{ modifie_le: Date }>('SELECT modifie_le FROM secrets WHERE type = $1 AND nom = $2', [type, nom]);
    return rows[0]?.modifie_le;
  });
}

/**
 * Rotation de la clé maîtresse : rechiffre tous les secrets (et le témoin) dans une seule transaction.
 * Un échec sur un secret annule tout : aucun secret n'est perdu ni laissé sous deux clés.
 * Rend le nombre de secrets rechiffrés.
 */
export async function pivoterCleMaitresse(pool: PoolType, ancien: Coffre, nouveau: Coffre): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Marque par marque : la RLS reste active, aucune variable de session ne l'élargit.
    const marques = await client.query<{ id: string }>('SELECT marques_identifiants() AS id');
    let total = 0;
    for (const { id: marqueId } of marques.rows) {
      await client.query("SELECT set_config('app.marque_id', $1, true)", [marqueId]);
      const { rows } = await client.query<{ id: string; type: string; chiffre: Buffer }>(
        'SELECT id, type, chiffre FROM secrets ORDER BY id FOR UPDATE',
      );
      for (const ligne of rows) {
        const contexte: ContexteSecret = { secretId: ligne.id, marqueId, type: ligne.type };
        await client.query('UPDATE secrets SET chiffre = $2, modifie_le = now() WHERE id = $1', [
          ligne.id,
          rechiffrer(ligne.chiffre, contexte, ancien, nouveau),
        ]);
      }
      total += rows.length;
    }
    await client.query("SELECT set_config('app.marque_id', '', true)");
    const temoin = await client.query<{ chiffre: Buffer }>('SELECT chiffre FROM coffre_temoin FOR UPDATE');
    if (temoin.rows[0] !== undefined) verifierTemoin(ancien, temoin.rows[0].chiffre);
    await client.query(
      'INSERT INTO coffre_temoin (chiffre) VALUES ($1) ON CONFLICT (id) DO UPDATE SET chiffre = EXCLUDED.chiffre',
      [creerTemoin(nouveau)],
    );
    await client.query('COMMIT');
    return total;
  } catch (erreur) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw erreur;
  } finally {
    client.release();
  }
}
