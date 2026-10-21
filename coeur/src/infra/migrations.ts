// regie — migrations SQL numérotées, en avant seulement (AR-4, NFR-31).
// Appliquées au démarrage dans UNE transaction : tout passe ou rien ne change.
// Le SHA-256 de chaque fichier appliqué est inscrit dans `migrations_appliquees` ; un fichier appliqué
// puis modifié, retiré ou rangé hors ordre fait refuser le démarrage en le nommant.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClientBase } from 'pg';

export class ErreurMigration extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurMigration';
  }
}

export type FichierMigration = Readonly<{ nom: string; numero: number; sql: string; sha256: string }>;
export type MigrationAppliquee = Readonly<{ nom: string; sha256: string }>;

/** `0001_socle.sql` : quatre chiffres, un nom en minuscules, `.sql`. */
const NOM_MIGRATION = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Verrou consultatif : deux instances qui démarrent ensemble n'appliquent pas la même migration deux fois. */
const VERROU_MIGRATIONS = 4_815_162_342;

export function empreinte(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

/** Lit le dossier des migrations : noms valides, numérotation continue à partir de 0001, sans doublon. */
export function lireMigrations(dossier: string): FichierMigration[] {
  const fichiers = readdirSync(dossier).filter((nom) => nom !== '.gitkeep').sort();
  const migrations: FichierMigration[] = [];
  for (const nom of fichiers) {
    const correspondance = NOM_MIGRATION.exec(nom);
    if (correspondance === null) {
      throw new ErreurMigration(`fichier de migration mal nommé : ${nom} (attendu : 0001_nom_en_minuscules.sql)`);
    }
    const numero = Number(correspondance[1]);
    const attendu = migrations.length + 1;
    if (numero !== attendu) {
      throw new ErreurMigration(
        `numérotation des migrations rompue à ${nom} : ${String(attendu).padStart(4, '0')} attendu`,
      );
    }
    const sql = readFileSync(join(dossier, nom), 'utf8');
    migrations.push({ nom, numero, sql, sha256: empreinte(sql) });
  }
  return migrations;
}

/** Compare le dossier à ce que la base a déjà appliqué ; rend les migrations restant à appliquer, dans l'ordre. */
export function planifier(disque: readonly FichierMigration[], appliquees: readonly MigrationAppliquee[]): FichierMigration[] {
  const parNom = new Map(disque.map((migration) => [migration.nom, migration]));
  for (const appliquee of appliquees) {
    const fichier = parNom.get(appliquee.nom);
    if (fichier === undefined) {
      throw new ErreurMigration(`migration déjà appliquée mais absente du dossier : ${appliquee.nom}`);
    }
    if (fichier.sha256 !== appliquee.sha256) {
      throw new ErreurMigration(`migration déjà appliquée puis modifiée : ${appliquee.nom}`);
    }
  }
  const dejaFaites = new Set(appliquees.map((appliquee) => appliquee.nom));
  const dernier = Math.max(0, ...disque.filter((migration) => dejaFaites.has(migration.nom)).map((m) => m.numero));
  const restantes = disque.filter((migration) => !dejaFaites.has(migration.nom));
  const horsOrdre = restantes.find((migration) => migration.numero < dernier);
  if (horsOrdre !== undefined) {
    throw new ErreurMigration(`migration ajoutée avant des migrations déjà appliquées : ${horsOrdre.nom}`);
  }
  return restantes;
}

/**
 * Applique les migrations en attente avec la connexion donnée (rôle `regie_migrations`).
 * Rend les noms appliqués. Toute erreur annule la transaction entière.
 */
export async function appliquerMigrations(client: ClientBase, disque: readonly FichierMigration[]): Promise<string[]> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [VERROU_MIGRATIONS]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS migrations_appliquees (
         nom text PRIMARY KEY,
         sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
         appliquee_le timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<MigrationAppliquee>('SELECT nom, sha256 FROM migrations_appliquees');
    const restantes = planifier(disque, rows);
    for (const migration of restantes) {
      try {
        await client.query(migration.sql);
      } catch (erreur) {
        const message = erreur instanceof Error ? erreur.message : 'erreur inconnue';
        throw new ErreurMigration(`migration échouée : ${migration.nom} (${message})`);
      }
      await client.query('INSERT INTO migrations_appliquees (nom, sha256) VALUES ($1, $2)', [migration.nom, migration.sha256]);
    }
    await client.query('COMMIT');
    return restantes.map((migration) => migration.nom);
  } catch (erreur) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw erreur;
  }
}

/**
 * Contrôle de cohérence du schéma après migration : le rôle applicatif existe sans privilège excessif,
 * et toute table portant `marque_id` (ainsi que `marques`) a la RLS activée ET forcée (AD-8).
 */
export async function verifierSchema(client: ClientBase): Promise<void> {
  const role = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'regie_coeur'",
  );
  const regieCoeur = role.rows[0];
  if (regieCoeur === undefined) throw new ErreurMigration('schéma incohérent : le rôle regie_coeur n’existe pas');
  if (regieCoeur.rolsuper || regieCoeur.rolbypassrls) {
    throw new ErreurMigration('schéma incohérent : le rôle regie_coeur contourne la RLS (superuser ou BYPASSRLS)');
  }
  const tables = await client.query<{ table: string }>(
    `SELECT c.relname AS "table"
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND (c.relname = 'marques'
             OR EXISTS (SELECT 1 FROM pg_attribute a
                         WHERE a.attrelid = c.oid AND a.attname = 'marque_id' AND NOT a.attisdropped))
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
      ORDER BY c.relname`,
  );
  if (tables.rows.length > 0) {
    const noms = tables.rows.map((ligne) => ligne.table).join(', ');
    throw new ErreurMigration(`schéma incohérent : RLS non forcée sur ${noms}`);
  }
}
