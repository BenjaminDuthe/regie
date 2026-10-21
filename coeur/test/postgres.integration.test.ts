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
import { dansTransactionMarque, dansTransactionUtilisateur, deposerSecret, lireSecret, pivoterCleMaitresse } from '../src/infra/base.ts';
import { Coffre } from '../src/infra/coffre.ts';
import { DOSSIER_MIGRATIONS, ErreurDemarrage, FICHIERS_SECRETS, demarrerBase } from '../src/infra/demarrage.ts';
import { Masqueur } from '../src/infra/masquage.ts';
import { calculerSante } from '../src/infra/sante.ts';
import { AuditPg, verifierChaine } from '../src/infra/audit.ts';
import { EspacesPg, idUtilisateur } from '../src/infra/espaces.ts';
import { JetonsApiPg, hacherJeton } from '../src/infra/jetons.ts';
import { MarquesPg } from '../src/infra/marques.ts';
import { MagasinSessionsPg } from '../src/infra/sessions.ts';

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

  it('sessions : seul le haché est stocké, la RLS isole les marques, révocation et expiration tiennent', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const sessions = new MagasinSessionsPg(contexte.pool);
      const marqueA = await marques.creer(`Sessions A ${suffixe}`);
      const marqueB = await marques.creer(`Sessions B ${suffixe}`);
      const valeur = await sessions.creer({ marqueId: marqueA, sub: 'sub-a', email: 'a@exemple.test', authentifieLe: new Date() });
      const identifiant = valeur.split('.')[1]!;

      const verif = new Client({ host: hote, port, database: baseNom, user: 'postgres', password: new URL(adresse).password });
      await verif.connect();
      try {
        const brut = await verif.query<{ hache_jeton: Buffer }>('SELECT hache_jeton FROM sessions WHERE marque_id = $1', [marqueA]);
        expect(brut.rows).toHaveLength(1);
        expect(brut.rows[0]!.hache_jeton).toHaveLength(32);
        expect(brut.rows[0]!.hache_jeton.toString('latin1')).not.toContain(identifiant);

        expect(await sessions.trouver(valeur)).toMatchObject({ marqueId: marqueA, sub: 'sub-a' });
        // Le cookie d'une marque ne vaut rien sous une autre : l'identifiant ne se retrouve que sous sa RLS.
        expect(await sessions.trouver(`${marqueB}.${identifiant}`)).toBeUndefined();
        expect((await contexte.pool.query('SELECT 1 FROM sessions')).rowCount).toBe(0);

        await verif.query("UPDATE sessions SET expire_le = now() - interval '1 minute' WHERE marque_id = $1", [marqueA]);
        expect(await sessions.trouver(valeur)).toBeUndefined();
        await verif.query("UPDATE sessions SET expire_le = now() + interval '1 day' WHERE marque_id = $1", [marqueA]);
        expect(await sessions.trouver(valeur)).toBeDefined();
        expect(await sessions.revoquer(valeur)).toBe(true);
        expect(await sessions.trouver(valeur)).toBeUndefined();
        expect(await sessions.revoquer(valeur)).toBe(false);
      } finally {
        await verif.end();
      }
    } finally {
      await contexte.fermer();
    }
  });

  it('audit : chaîne linéaire par marque, ajout seul, RLS, refus des secrets', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const audit = new AuditPg(contexte.pool);
      const marqueA = await marques.creer(`Audit A ${suffixe}`);
      const marqueB = await marques.creer(`Audit B ${suffixe}`);
      // Écritures concurrentes : le verrou par marque garde la chaîne linéaire.
      await Promise.all(
        Array.from({ length: 6 }, (_, i) => audit.ajouter(marqueA, { acteur: 'sub-a', action: i % 2 === 0 ? 'connexion' : 'deconnexion', objet: 'session', details: { rang: i } })),
      );
      await audit.ajouter(marqueB, { acteur: 'sub-b', action: 'connexion', objet: 'session' });

      const lignesA = await audit.lire(marqueA);
      expect(lignesA).toHaveLength(6);
      expect(verifierChaine(lignesA)).toBeUndefined();
      expect(await audit.lire(marqueB)).toHaveLength(1);
      // Sans marque, rien n'est visible.
      expect((await contexte.pool.query('SELECT 1 FROM journal_audit')).rowCount).toBe(0);

      // Ajout seul : ni modification, ni suppression, ni vidage, même pour un superutilisateur qui passe la RLS.
      const proprio = new Client({ host: hote, port, database: baseNom, user: 'postgres', password: new URL(adresse).password });
      await proprio.connect();
      try {
        await expect(proprio.query("UPDATE journal_audit SET acteur = 'x'")).rejects.toThrow(/ajout seul/);
        await expect(proprio.query('DELETE FROM journal_audit')).rejects.toThrow(/ajout seul/);
        await expect(proprio.query('TRUNCATE journal_audit')).rejects.toThrow(/ajout seul/);
      } finally {
        await proprio.end();
      }
      await expect(dansTransactionMarque(contexte.pool, marqueA, (client) => client.query("UPDATE journal_audit SET acteur = 'x'"))).rejects.toThrow();
      // Écrire pour une autre marque est refusé par la RLS.
      await expect(
        dansTransactionMarque(contexte.pool, marqueA, (client) =>
          client.query(
            "INSERT INTO journal_audit (marque_id, horodatage, acteur, action, objet, hache_precedent, hache) VALUES ($1, now(), 'x', 'connexion', 'session', $2, $2)",
            [marqueB, 'a'.repeat(64)],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      // Un secret n'entre jamais dans le journal.
      await expect(audit.ajouter(marqueA, { acteur: 'sub-a', action: 'connexion', objet: 'session', details: { token: 'x' } })).rejects.toThrow();
    } finally {
      await contexte.fermer();
    }
  });

  it('espaces : propriétaire de son espace personnel, rien sans app.utilisateur_id, A et B cloisonnés', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const sessions = new MagasinSessionsPg(contexte.pool);
      const marqueId = await marques.creer(`Espaces ${suffixe}`);
      const a = await espaces.assurer(marqueId, 'sub-a', 'a@exemple.test', 'Établia');
      const b = await espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
      expect(a.crees).toHaveLength(2);
      expect(a.espaces.map((e) => e.genre)).toEqual(['personnel', 'marque']);
      expect(a.espaces.every((e) => e.proprietaireId === idUtilisateur(marqueId, 'sub-a'))).toBe(true);
      // Une seconde connexion ne duplique rien.
      const encore = await espaces.assurer(marqueId, 'sub-a', 'a@exemple.test', 'Établia');
      expect(encore.crees).toHaveLength(0);
      expect(encore.espaces.map((e) => e.id)).toEqual(a.espaces.map((e) => e.id));

      // Sans app.utilisateur_id : la marque seule ne suffit pas, rien n'est visible.
      await dansTransactionMarque(contexte.pool, marqueId, async (client) => {
        expect((await client.query('SELECT 1 FROM espaces')).rowCount).toBe(0);
        expect((await client.query('SELECT 1 FROM utilisateurs')).rowCount).toBe(0);
      });
      // Sans marque non plus.
      expect((await contexte.pool.query('SELECT 1 FROM espaces')).rowCount).toBe(0);

      // B ne lit rien de A, et n'écrit pas dans les espaces de A.
      expect((await espaces.lister(marqueId, 'sub-b')).map((e) => e.id)).toEqual(b.espaces.map((e) => e.id));
      expect((await espaces.lister(marqueId, 'sub-b')).some((e) => a.espaces.some((x) => x.id === e.id))).toBe(false);
      await dansTransactionUtilisateur(contexte.pool, marqueId, idUtilisateur(marqueId, 'sub-b'), async (client) => {
        expect((await client.query('SELECT 1 FROM espaces WHERE id = $1', [a.espaces[0]!.id])).rowCount).toBe(0);
        await expect(
          client.query("INSERT INTO espaces (marque_id, proprietaire_id, genre, nom) VALUES ($1, $2, 'personnel', 'vol')", [marqueId, idUtilisateur(marqueId, 'sub-a')]),
        ).rejects.toThrow(/row-level security|unique|duplicate/);
      });

      // Espace actif de la session : rappelé à la lecture, changeable, et jamais celui d'un autre.
      const cookie = await sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(), espaceActifId: a.espaces[0]!.id });
      expect((await sessions.trouver(cookie))?.espaceActifId).toBe(a.espaces[0]!.id);
      expect(await sessions.changerEspace(cookie, a.espaces[1]!.id)).toBe(true);
      expect((await sessions.trouver(cookie))?.espaceActifId).toBe(a.espaces[1]!.id);
    } finally {
      await contexte.fermer();
    }
  });

  it('jetons d’API : seul le haché est stocké, expiration ≤ 90 jours, révocation, cloisonnement par marque et par utilisateur', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const jetons = new JetonsApiPg(contexte.pool);
      const marqueA = await marques.creer(`Jetons A ${suffixe}`);
      const marqueB = await marques.creer(`Jetons B ${suffixe}`);
      const a = await espaces.assurer(marqueA, 'sub-a', undefined, 'Établia');
      const a2 = await espaces.assurer(marqueA, 'sub-a2', undefined, 'Établia');
      const b = await espaces.assurer(marqueB, 'sub-b', undefined, 'Autre');
      const nouveau = (m: string, u: string, sub: string, e: string, jours = 30) => ({ marqueId: m, utilisateurId: u, sub, nom: 'test', portees: ['lecture' as const], espaceIds: [e], dureeJours: jours });

      const { jeton, clair } = await jetons.creer(nouveau(marqueA, a.utilisateurId, 'sub-a', a.espaces[0]!.id));
      // Seul le haché SHA-256 est en base : le jeton n'y figure sous aucune forme.
      const brut = await dansTransactionMarque(contexte.pool, marqueA, (c) => c.query<{ hache: Buffer; texte: string }>('SELECT hache, jetons_api::text AS texte FROM jetons_api WHERE id = $1', [jeton.id]));
      expect(brut.rows[0]!.hache.equals(hacherJeton(clair))).toBe(true);
      expect(brut.rows[0]!.texte).not.toContain(clair);
      expect(brut.rows[0]!.texte).not.toContain(clair.split('_').at(-1)!);

      expect(await jetons.authentifier(clair)).toMatchObject({ marqueId: marqueA, utilisateurId: a.utilisateurId, sub: 'sub-a', jetonId: jeton.id });
      expect(await jetons.authentifier(`${clair.slice(0, -1)}${clair.endsWith('A') ? 'B' : 'A'}`)).toBeUndefined();

      // Expiration : la base refuse plus de 90 jours, et un jeton échu n'authentifie plus.
      await expect(jetons.creer(nouveau(marqueA, a.utilisateurId, 'sub-a', a.espaces[0]!.id, 91))).rejects.toThrow(/check|jetons_api/);
      const court = await jetons.creer(nouveau(marqueA, a.utilisateurId, 'sub-a', a.espaces[0]!.id, 1));
      await dansTransactionMarque(contexte.pool, marqueA, (c) => c.query("UPDATE jetons_api SET cree_le = now() - interval '3 days', expire_le = now() - interval '1 day' WHERE id = $1", [court.jeton.id]));
      expect(await jetons.authentifier(court.clair)).toBeUndefined();

      // Cloisonnement : A2 ne voit ni ne révoque le jeton de A ; la marque B non plus (RLS), sans variable d'utilisateur.
      expect((await jetons.lister(marqueA, a2.utilisateurId)).map((j) => j.id)).toEqual([]);
      expect(await jetons.revoquer(marqueA, a2.utilisateurId, jeton.id)).toBe(false);
      expect((await jetons.lister(marqueB, a.utilisateurId)).map((j) => j.id)).toEqual([]);
      expect(await jetons.revoquer(marqueB, a.utilisateurId, jeton.id)).toBe(false);
      await dansTransactionMarque(contexte.pool, marqueB, async (c) => {
        expect((await c.query('SELECT 1 FROM jetons_api')).rowCount).toBe(0);
        await expect(c.query('INSERT INTO jetons_api (marque_id, utilisateur_id, sub, nom, hache, portees, espace_ids, expire_le) VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval \'1 day\')', [marqueA, a.utilisateurId, 'sub-a', 'vol', Buffer.alloc(32, 1), ['lecture'], [a.espaces[0]!.id]])).rejects.toThrow(/row-level security/);
      });
      expect((await contexte.pool.query('SELECT 1 FROM jetons_api')).rowCount).toBe(0);
      expect(await jetons.authentifier(clair.replace(marqueA.replaceAll('-', ''), b.utilisateurId.replaceAll('-', '').slice(0, 32)))).toBeUndefined();

      // Révocation : effective tout de suite, une seule fois ; la ligne reste (trace).
      expect(await jetons.revoquer(marqueA, a.utilisateurId, jeton.id)).toBe(true);
      expect(await jetons.revoquer(marqueA, a.utilisateurId, jeton.id)).toBe(false);
      expect(await jetons.authentifier(clair)).toBeUndefined();
      expect((await jetons.lister(marqueA, a.utilisateurId)).find((j) => j.id === jeton.id)?.revoqueLe).toBeInstanceOf(Date);
    } finally {
      await contexte.fermer();
    }
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

      // Aucune variable de session ne lève la RLS (l'ancien passe-droit app.rotation_cle n'existe plus).
      const passeDroit = await dansTransactionMarque(contexte.pool, marqueA, async (client) => {
        await client.query("SELECT set_config('app.marque_id', '', true)");
        await client.query("SELECT set_config('app.rotation_cle', 'oui', true)");
        return client.query('SELECT id FROM secrets');
      });
      expect(passeDroit.rows).toEqual([]);

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
