// Tests d'intégration contre un vrai PostgreSQL jetable : `npm run test:postgres`.
// Ignorés (proprement) quand REGIE_TEST_POSTGRES n'est pas posée, comme dans `npm run ci`.
// Tous les mots de passe et clés sont tirés au hasard à chaque exécution.

import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { lireEnvironnement } from '../src/env.ts';
import { dansTransactionMarque, deposerSecret, lireSecret, pivoterCleMaitresse } from '../src/infra/base.ts';
import { Coffre } from '../src/infra/coffre.ts';
import { DOSSIER_MIGRATIONS, ErreurDemarrage, FICHIERS_SECRETS, demarrerBase } from '../src/infra/demarrage.ts';
import { Masqueur } from '../src/infra/masquage.ts';
import { calculerSante } from '../src/infra/sante.ts';

declare module 'vitest' {
  interface ProvidedContext {
    urlPostgresTest: string;
  }
}

const adresse = inject('urlPostgresTest');
const { Client } = pg;

describe.skipIf(adresse === '')('PostgreSQL réel', () => {
  const suffixe = randomBytes(4).toString('hex');
  const roleMigrations = `regie_migrations`;
  const motsDePasse = { migrations: randomBytes(18).toString('hex'), coeur: randomBytes(18).toString('hex') };
  const baseNom = `regie_test_${suffixe}`;
  let admin: pg.Client;
  let hote: string;
  let port: number;
  let secrets: string;
  let cle: string;

  const environnement = (base = baseNom) =>
    lireEnvironnement({ DOSSIER_SECRETS: secrets, BASE_HOTE: hote, BASE_PORT: String(port), BASE_NOM: base });

  function poserSecrets(cleHex: string) {
    writeFileSync(join(secrets, FICHIERS_SECRETS.cleMaitresse), cleHex);
    writeFileSync(join(secrets, FICHIERS_SECRETS.baseCoeur), motsDePasse.coeur);
    writeFileSync(join(secrets, FICHIERS_SECRETS.baseMigrations), motsDePasse.migrations);
  }

  async function creerBase(nom: string) {
    await admin.query(`CREATE DATABASE ${nom} OWNER ${roleMigrations}`);
  }

  beforeAll(async () => {
    const url = new URL(adresse);
    hote = url.hostname;
    port = Number(url.port);
    admin = new Client({ connectionString: adresse });
    await admin.connect();
    // Ce que fait l'installation : les deux rôles, avec leurs mots de passe, avant le premier démarrage.
    await admin.query(`CREATE ROLE ${roleMigrations} LOGIN CREATEROLE PASSWORD '${motsDePasse.migrations}'`);
    await admin.query(`CREATE ROLE regie_coeur LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${motsDePasse.coeur}'`);
    await creerBase(baseNom);
    secrets = mkdtempSync(join(tmpdir(), 'regie-int-'));
    cle = randomBytes(32).toString('hex');
    poserSecrets(cle);
  });

  afterAll(async () => {
    if (admin === undefined) return;
    await admin.query(`DROP DATABASE IF EXISTS ${baseNom} WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS ${baseNom}_atomique WITH (FORCE)`);
    await admin.query('DROP ROLE IF EXISTS regie_coeur');
    await admin.query(`DROP ROLE IF EXISTS ${roleMigrations}`);
    await admin.end();
    rmSync(secrets, { recursive: true, force: true });
  });

  it('applique les migrations au premier démarrage, une seule fois, avec leur SHA-256', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    await contexte.fermer();
    const second = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    await second.fermer();

    const base = new Client({ host: hote, port, database: baseNom, user: roleMigrations, password: motsDePasse.migrations });
    await base.connect();
    const { rows } = await base.query<{ nom: string; sha256: string }>('SELECT nom, sha256 FROM migrations_appliquees ORDER BY nom');
    await base.end();
    const fichiers = readdirSync(DOSSIER_MIGRATIONS).filter((nom) => nom.endsWith('.sql'));
    expect(rows.map((ligne) => ligne.nom)).toEqual(fichiers);
    expect(rows[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('chiffre le secret en base, le relit, et isole les marques par la RLS', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marqueA = randomUUID();
      const marqueB = randomUUID();
      for (const [marque, nom] of [[marqueA, 'A'], [marqueB, 'B']] as const) {
        await dansTransactionMarque(contexte.pool, marque, (client) =>
          client.query('INSERT INTO marques (id, nom) VALUES ($1, $2)', [marque, `Marque ${nom} ${suffixe}`]),
        );
      }
      const clair = randomBytes(20).toString('hex');
      const idA = await deposerSecret(contexte.pool, contexte.coffre, { marqueId: marqueA, type: 'oauth_meta', nom: 'jeton', clair });
      await deposerSecret(contexte.pool, contexte.coffre, { marqueId: marqueB, type: 'oauth_meta', nom: 'jeton', clair: randomBytes(20).toString('hex') });

      // En base, seul le chiffré (vérifié en administrateur, hors RLS).
      const verif = new Client({ host: hote, port, database: baseNom, user: 'postgres', password: new URL(adresse).password });
      await verif.connect();
      const stocke = await verif.query<{ chiffre: Buffer }>('SELECT chiffre FROM secrets WHERE id = $1', [idA]);
      await verif.end();
      expect(stocke.rows[0]?.chiffre[0]).toBe(1);
      expect(stocke.rows[0]?.chiffre.toString('latin1')).not.toContain(clair);

      expect(await lireSecret(contexte.pool, contexte.coffre, marqueA, idA)).toBe(clair);
      // La marque B ne voit pas le secret de A.
      expect(await lireSecret(contexte.pool, contexte.coffre, marqueB, idA)).toBeUndefined();

      // Variable absente : aucune ligne, y compris hors transaction (échec fermé).
      expect((await contexte.pool.query('SELECT 1 FROM secrets')).rowCount).toBe(0);
      expect((await contexte.pool.query('SELECT 1 FROM marques')).rowCount).toBe(0);
      // Sous la marque A : seulement les lignes de A.
      const vues = await dansTransactionMarque(contexte.pool, marqueA, (client) => client.query('SELECT marque_id FROM secrets'));
      expect(vues.rows.map((ligne: { marque_id: string }) => ligne.marque_id)).toEqual([marqueA]);
      // Écrire pour une autre marque est refusé.
      await expect(
        dansTransactionMarque(contexte.pool, marqueA, (client) =>
          client.query("INSERT INTO secrets (marque_id, type, nom, chiffre) VALUES ($1, 'x', 'y', $2)", [marqueB, Buffer.alloc(40, 1)]),
        ),
      ).rejects.toThrow(/row-level security/);
      // Le rôle applicatif ne contourne pas la RLS et ne possède pas les tables.
      const role = await contexte.pool.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
        "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user",
      );
      expect(role.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
      await expect(contexte.pool.query('ALTER TABLE secrets DISABLE ROW LEVEL SECURITY')).rejects.toThrow();

      // Rotation : tout est rechiffré sans perte ; l'ancienne clé ne lit plus rien.
      const ancien = contexte.coffre;
      const nouveau = new Coffre(randomBytes(32));
      expect(await pivoterCleMaitresse(contexte.pool, ancien, nouveau)).toBe(2);
      expect(await lireSecret(contexte.pool, nouveau, marqueA, idA)).toBe(clair);
      await expect(lireSecret(contexte.pool, ancien, marqueA, idA)).rejects.toThrow(/impossible/);
      // Une rotation sous la mauvaise ancienne clé échoue et ne change rien.
      await expect(pivoterCleMaitresse(contexte.pool, ancien, new Coffre(randomBytes(32)))).rejects.toThrow();
      expect(await lireSecret(contexte.pool, nouveau, marqueA, idA)).toBe(clair);
      const sante = await calculerSante({ pool: contexte.pool, coffre: nouveau }, '/');
      expect(sante).toMatchObject({ base: 'ok', coffre: 'ok' });
      // L'ancien coffre ne passe plus le témoin : /sante le dit.
      expect(await calculerSante({ pool: contexte.pool, coffre: ancien }, '/')).toMatchObject({ base: 'ok', coffre: 'ko', etat: 'degrade' });
    } finally {
      await contexte.fermer();
    }
  });

  it('refuse de démarrer avec une autre clé que celle du coffre, sans la citer', async () => {
    // Après la rotation du test précédent, la clé du fichier n'est plus celle du coffre.
    const erreur = await demarrerBase(environnement(), { masqueur: new Masqueur() }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurDemarrage);
    expect((erreur as ErreurDemarrage).etape).toBe('coffre');
    expect((erreur as Error).message).toMatch(/ne correspond pas/);
    expect((erreur as Error).message).not.toContain(cle);
  });

  it('refuse, en le nommant, une migration appliquée puis modifiée', async () => {
    const copie = mkdtempSync(join(tmpdir(), 'regie-mig-'));
    try {
      cpSync(DOSSIER_MIGRATIONS, copie, { recursive: true });
      const premier = readdirSync(copie).filter((nom) => nom.endsWith('.sql'))[0]!;
      writeFileSync(join(copie, premier), `${readFileSync(join(copie, premier), 'utf8')}\n-- modifiée après coup\n`);
      const erreur = await demarrerBase(environnement(), { masqueur: new Masqueur(), dossierMigrations: copie }).catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(ErreurDemarrage);
      expect((erreur as ErreurDemarrage).etape).toBe('migrations');
      expect((erreur as Error).message).toContain(premier);
    } finally {
      rmSync(copie, { recursive: true, force: true });
    }
  });

  it('applique les migrations de façon atomique : un échec ne laisse rien', async () => {
    const atomique = `${baseNom}_atomique`;
    await creerBase(atomique);
    const copie = mkdtempSync(join(tmpdir(), 'regie-mig-'));
    try {
      cpSync(DOSSIER_MIGRATIONS, copie, { recursive: true });
      const suivant = `${String(readdirSync(copie).filter((nom) => nom.endsWith('.sql')).length + 1).padStart(4, '0')}_casse.sql`;
      writeFileSync(join(copie, suivant), 'CREATE TABLE ne_doit_pas_rester (id int); SELECT table_inexistante FROM nulle_part;');
      const erreur = await demarrerBase(environnement(atomique), { masqueur: new Masqueur(), dossierMigrations: copie }).catch((e: unknown) => e);
      expect((erreur as ErreurDemarrage).etape).toBe('migrations');
      expect((erreur as Error).message).toContain(suivant);
      const base = new Client({ host: hote, port, database: atomique, user: roleMigrations, password: motsDePasse.migrations });
      await base.connect();
      const tables = await base.query("SELECT relname FROM pg_class WHERE relname IN ('marques', 'secrets', 'ne_doit_pas_rester', 'migrations_appliquees')");
      await base.end();
      expect(tables.rowCount).toBe(0);
    } finally {
      rmSync(copie, { recursive: true, force: true });
    }
  });

  it('refuse un schéma incohérent : RLS non forcée sur une table de marque', async () => {
    const verif = new Client({ host: hote, port, database: baseNom, user: roleMigrations, password: motsDePasse.migrations });
    await verif.connect();
    await verif.query('ALTER TABLE secrets NO FORCE ROW LEVEL SECURITY');
    await verif.end();
    const erreur = await demarrerBase(environnement(), { masqueur: new Masqueur() }).catch((e: unknown) => e);
    expect((erreur as ErreurDemarrage).etape).toBe('migrations');
    expect((erreur as Error).message).toMatch(/RLS non forcée sur secrets/);
  });
});
