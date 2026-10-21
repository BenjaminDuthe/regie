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
import { ComptesDemoPg } from '../src/infra/comptes-demo.ts';
import { lecteurCoffre } from '../src/services/passerelle-secrets.ts';
import { nomSecretCompteDemo, TYPE_SECRET_COMPTE_DEMO } from '../src/infra/comptes-demo.ts';
import { DOSSIER_MIGRATIONS, ErreurDemarrage, FICHIERS_SECRETS, demarrerBase } from '../src/infra/demarrage.ts';
import { Masqueur } from '../src/infra/masquage.ts';
import { calculerSante } from '../src/infra/sante.ts';
import { AuditPg, verifierChaine } from '../src/infra/audit.ts';
import { EspacesPg, idUtilisateur } from '../src/infra/espaces.ts';
import { ApplicationsPg, NomApplicationPris } from '../src/infra/applications.ts';
import { NomScriptPris, ScriptsPg } from '../src/infra/scripts.ts';
import { MontagesPg } from '../src/infra/montages.ts';
import { figerGabarit } from '../src/domaine/montage.ts';
import { depuisJournal } from '@regie/contrats';
import { GabaritsPg } from '../src/infra/gabarits.ts';
import { GABARIT_DE_DEPART } from '../src/domaine/gabarit.ts';
import { JetonsApiPg, hacherJeton } from '../src/infra/jetons.ts';
import { FilePg } from '../src/infra/file.ts';
import { EcheancesPg, type Echeance } from '../src/infra/echeances.ts';
import { purgerClientsOauth, purgerSessions } from '../src/infra/entretien.ts';
import { programmerEcheance } from '../src/services/echeances.ts';
import { Planificateur, decider as decideur } from '../src/services/planificateur.ts';
import { gestionnairesDuSocle, verifierJournal } from '../src/services/gestionnaires.ts';
import { MarquesPg } from '../src/infra/marques.ts';
import { NotificationsPg } from '../src/infra/notifications.ts';
import { OauthPg } from '../src/infra/oauth.ts';
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

  it('OAuth : codes à usage unique, jetons hachés, refresh tournant avec détection de réutilisation, RLS par marque', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const oauth = new OauthPg(contexte.pool);
      const marqueA = await marques.creer(`Oauth A ${suffixe}`);
      const marqueB = await marques.creer(`Oauth B ${suffixe}`);
      const a = await espaces.assurer(marqueA, 'sub-oa', undefined, 'Établia');
      const b = await espaces.assurer(marqueB, 'sub-ob', undefined, 'Autre');
      const client = (await oauth.enregistrerClient(marqueA, { nom: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] }))!;
      expect(await oauth.trouverClient(client.clientId)).toMatchObject({ marqueId: marqueA, nom: 'Claude' });
      // Un client jamais utilisé (aucun code émis) expire après 10 minutes et est purgé avant le comptage du plafond.
      const inutile = (await oauth.enregistrerClient(marqueA, { nom: 'Inutile', redirectUris: ['https://claude.ai/x'] }))!;
      // Vieillissement fait par le superutilisateur (le rôle du cœur n'a pas le droit de modifier un client).
      const superutilisateur = new Client({ connectionString: Object.assign(new URL(adresse), { pathname: `/${baseNom}` }).toString() });
      await superutilisateur.connect();
      try {
        await superutilisateur.query("UPDATE oauth_clients SET cree_le = now() - interval '11 minutes' WHERE client_id = $1", [inutile.clientId]);
      } finally {
        await superutilisateur.end();
      }
      await oauth.enregistrerClient(marqueA, { nom: 'Déclencheur', redirectUris: ['https://claude.ai/y'] });
      expect(await oauth.trouverClient(inutile.clientId)).toBeUndefined();
      const demande = { marqueId: marqueA, clientId: client.clientId, utilisateurId: a.utilisateurId, sub: 'sub-oa', redirectUri: 'https://claude.ai/api/mcp/auth_callback', codeChallenge: 'x'.repeat(43), portees: ['lecture' as const], espaceIds: [a.espaces[0]!.id] };
      const code = await oauth.emettreCode(demande);
      const brut = await dansTransactionMarque(contexte.pool, marqueA, (c) => c.query<{ texte: string }>('SELECT oauth_codes::text AS texte FROM oauth_codes'));
      expect(brut.rows.map((r) => r.texte).join('')).not.toContain(code);
      const consomme = await oauth.consommerCode(code);
      expect(consomme).toMatchObject({ utilisateurId: a.utilisateurId, clientId: client.clientId });
      expect(await oauth.consommerCode(code)).toBeUndefined();

      const em = await oauth.ouvrirConnexion(consomme!);
      const connexions = await dansTransactionMarque(contexte.pool, marqueA, (c) => c.query<{ texte: string }>('SELECT oauth_connexions::text AS texte FROM oauth_connexions'));
      const texte = connexions.rows.map((r) => r.texte).join('');
      expect(texte).not.toContain(em.acces);
      expect(texte).not.toContain(em.refresh);
      expect(await oauth.authentifierAcces(em.acces)).toMatchObject({ marqueId: marqueA, utilisateurId: a.utilisateurId, jetonId: em.connexionId });

      const r1 = await oauth.rafraichir(em.refresh, client.clientId);
      expect(r1.etat).toBe('ok');
      const suivant = r1.etat === 'ok' ? r1.emission : undefined;
      expect(await oauth.authentifierAcces(em.acces)).toBeUndefined();
      expect(await oauth.authentifierAcces(suivant!.acces)).toBeDefined();
      // Rejouer l'ancien refresh révoque toute la connexion.
      expect((await oauth.rafraichir(em.refresh, client.clientId)).etat).toBe('reutilise');
      expect(await oauth.authentifierAcces(suivant!.acces)).toBeUndefined();
      expect((await oauth.rafraichir(suivant!.refresh, client.clientId)).etat).toBe('invalide');

      // Cloisonnement : la marque B ne voit ni client ni connexion d'A, et ne peut rien révoquer.
      expect(await oauth.lister(marqueB, a.utilisateurId)).toEqual([]);
      expect(await oauth.revoquer(marqueB, b.utilisateurId, em.connexionId)).toBe(false);
      expect((await oauth.lister(marqueA, a.utilisateurId)).find((x) => x.id === em.connexionId)?.revoqueLe).toBeInstanceOf(Date);
      await dansTransactionMarque(contexte.pool, marqueB, async (c) => {
        expect((await c.query('SELECT 1 FROM oauth_connexions')).rowCount).toBe(0);
        expect((await c.query('SELECT 1 FROM oauth_clients')).rowCount).toBe(0);
      });
      expect((await contexte.pool.query('SELECT 1 FROM oauth_connexions')).rowCount).toBe(0);
    } finally {
      await contexte.fermer();
    }
  });

  it('file : SKIP LOCKED, interactive avant lot, un seul GPU, bail, reprise, application unique, RLS', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    const superutilisateur = new Client({ connectionString: Object.assign(new URL(adresse), { pathname: `/${baseNom}` }).toString() });
    await superutilisateur.connect();
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const file = new FilePg(contexte.pool);
      const marqueA = await marques.creer(`File A ${suffixe}`);
      const marqueB = await marques.creer(`File B ${suffixe}`);
      const a = await espaces.assurer(marqueA, 'sub-fa', undefined, 'Établia');
      const b = await espaces.assurer(marqueB, 'sub-fb', undefined, 'Autre');
      expect(await marques.lister()).toEqual(expect.arrayContaining([marqueA, marqueB]));

      // Concurrence : dix tâches, cinq preneurs simultanés, aucune tâche prise deux fois.
      const ids = new Set<string>();
      for (let i = 0; i < 10; i += 1) ids.add((await file.enfiler(marqueA, a.utilisateurId, 'essai', { i })).id);
      const prises = (await Promise.all(Array.from({ length: 10 }, (_, i) => file.prendre(marqueA, `svc-${i % 5}`)))).filter((t) => t !== undefined);
      expect(prises.length).toBe(10);
      expect(new Set(prises.map((t) => t!.id)).size).toBe(10);
      for (const t of prises) expect(await file.terminer(marqueA, t!.id, t!.verrouPar!, { ok: true })).toBe(true);
      expect(await file.prendre(marqueA, 'svc')).toBeUndefined();

      // Interactive avant lot ; le bail doit couvrir trois renouvellements.
      const lot = await file.enfiler(marqueA, a.utilisateurId, 'essai', {});
      const inter = await file.enfiler(marqueA, a.utilisateurId, 'montage', {});
      await expect(file.prendre(marqueA, 'svc', 40, 15)).rejects.toThrow();
      expect((await file.prendre(marqueA, 'svc'))?.id).toBe(inter.id);
      expect((await file.prendre(marqueA, 'svc'))?.id).toBe(lot.id);

      // Un seul GPU : la seconde tâche GPU attend, une tâche sans GPU passe.
      const g1 = await file.enfiler(marqueA, a.utilisateurId, 'transcription', {});
      const v = await file.enfiler(marqueA, a.utilisateurId, 'voix', {});
      const sans = await file.enfiler(marqueA, a.utilisateurId, 'controle', {});
      expect((await file.prendre(marqueA, 'gpu'))?.id).toBe(sans.id);
      expect((await file.prendre(marqueA, 'gpu'))?.id).toBe(g1.id);
      expect(await file.prendre(marqueA, 'gpu')).toBeUndefined();
      expect(await file.annuler(marqueA, a.utilisateurId, v.id)).toBe(true);

      // Échec transitoire : retardé de 15 s ; la marque B ne voit rien.
      const e = await file.enfiler(marqueA, a.utilisateurId, 'capture', {});
      await superutilisateur.query("UPDATE taches SET etat = 'terminee', terminee_le = now(), resultat_applique_le = now() WHERE etat = 'en_cours' AND id <> $1", [e.id]);
      const pris = (await file.prendre(marqueA, 'svc'))!;
      expect(pris.id).toBe(e.id);
      expect(await file.echouer(marqueA, e.id, 'svc', 'ECHEC', 'relancer', true)).toBe('prete');
      const apres = (await file.lire(marqueA, a.utilisateurId, e.id))!;
      expect(apres.disponibleLe.getTime() - Date.now()).toBeGreaterThan(10_000);
      expect(await file.prendre(marqueA, 'svc')).toBeUndefined();
      expect(await file.lire(marqueB, b.utilisateurId, e.id)).toBeUndefined();
      expect(await file.lire(marqueA, b.utilisateurId, e.id)).toBeUndefined();
      expect(await file.annuler(marqueB, b.utilisateurId, e.id)).toBe(false);
      expect(await file.lister(marqueB, b.utilisateurId, 50)).toEqual([]);
      await dansTransactionMarque(contexte.pool, marqueB, async (c) => {
        expect((await c.query('SELECT 1 FROM taches')).rowCount).toBe(0);
        expect((await c.query('SELECT 1 FROM tentatives_taches')).rowCount).toBe(0);
      });
      expect((await contexte.pool.query('SELECT 1 FROM taches')).rowCount).toBe(0);

      // Crash : bail expiré → une reprise, puis RESULTAT_INCONNU ; point de non-retour et reprise interdite : jamais repris.
      await superutilisateur.query("DELETE FROM tentatives_taches; DELETE FROM taches");
      const c1 = await file.enfiler(marqueA, a.utilisateurId, 'essai', {});
      await file.prendre(marqueA, 'mort');
      await superutilisateur.query("UPDATE taches SET bail_jusqua = now() - interval '1 second'");
      expect(await file.recuperer(marqueA)).toBe(1);
      expect(await file.lire(marqueA, a.utilisateurId, c1.id)).toMatchObject({ etat: 'prete', reprises: 1 });
      await file.prendre(marqueA, 'mort');
      await superutilisateur.query("UPDATE taches SET bail_jusqua = now() - interval '1 second'");
      await file.recuperer(marqueA);
      expect(await file.lire(marqueA, a.utilisateurId, c1.id)).toMatchObject({ etat: 'echouee', cause: 'RESULTAT_INCONNU', action: 'verifier' });
      const c2 = await file.enfiler(marqueA, a.utilisateurId, 'reseau', {});
      await file.prendre(marqueA, 'mort');
      await superutilisateur.query("UPDATE taches SET bail_jusqua = now() - interval '1 second' WHERE etat = 'en_cours'");
      await file.recuperer(marqueA);
      expect(await file.lire(marqueA, a.utilisateurId, c2.id)).toMatchObject({ etat: 'echouee', cause: 'RESULTAT_INCONNU' });
      const c3 = await file.enfiler(marqueA, a.utilisateurId, 'montage', {});
      await file.prendre(marqueA, 'mort');
      expect(await file.pointDeNonRetour(marqueA, c3.id, 'mort')).toBe(true);
      expect(await file.annuler(marqueA, a.utilisateurId, c3.id)).toBe(false);
      await superutilisateur.query("UPDATE taches SET bail_jusqua = now() - interval '1 second' WHERE etat = 'en_cours'");
      await file.recuperer(marqueA);
      expect(await file.lire(marqueA, a.utilisateurId, c3.id)).toMatchObject({ etat: 'echouee', cause: 'RESULTAT_INCONNU' });
      // Délai de garde dépassé même avec un bail vivant.
      const c4 = await file.enfiler(marqueA, a.utilisateurId, 'essai', {}, { delaiGardeS: 1 });
      await file.prendre(marqueA, 'long');
      await superutilisateur.query("UPDATE taches SET demarree_le = now() - interval '5 seconds' WHERE id = $1", [c4.id]);
      expect(await file.renouveler(marqueA, c4.id, 'long')).toBe(false);
      await file.recuperer(marqueA);
      expect(await file.lire(marqueA, a.utilisateurId, c4.id)).toMatchObject({ etat: 'echouee', cause: 'DELAI_DEPASSE', action: 'relancer' });
      expect(await file.relancer(marqueA, a.utilisateurId, c4.id)).toBe(true);

      // Application des résultats : une seule fois, même à deux appliqueurs concurrents.
      // La relance a gardé l'historique (tentative 2) et refait un budget complet.
      const relancee = (await file.prendre(marqueA, 'ap'))!;
      expect(relancee).toMatchObject({ id: c4.id, tentatives: 2 });
      expect(await file.terminer(marqueA, c4.id, 'ap', null)).toBe(true);
      expect((await file.historique(marqueA, a.utilisateurId, c4.id)).map((h) => h.numero)).toEqual([1, 2]);
      const r = await file.enfiler(marqueA, a.utilisateurId, 'essai', { message: 'x' });
      const p = (await file.prendre(marqueA, 'ap'))!;
      expect(p.id).toBe(r.id);
      expect(await file.terminer(marqueA, r.id, 'ap', { echo: 'x' })).toBe(true);
      expect(await file.terminer(marqueA, r.id, 'ap', { echo: 'y' })).toBe(false);
      const appliques: string[] = [];
      const compte = await Promise.all([1, 2].map(() => file.appliquerResultats(marqueA, async (t) => void appliques.push(t.id))));
      expect(compte.reduce((x, y) => x + y, 0)).toBe(2);
      expect(appliques.sort()).toEqual([c4.id, r.id].sort());
      expect(await file.appliquerResultats(marqueA, async (t) => void appliques.push(t.id))).toBe(0);
      expect((await file.historique(marqueA, a.utilisateurId, r.id)).length).toBe(1);
    } finally {
      await superutilisateur.end();
      await contexte.fermer();
    }
  });

  it('échéances : écrites avec l’action, déclenchées une seule fois, rattrapées, récurrences idempotentes, purges et vérification nocturne, RLS', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    const superutilisateur = new Client({ connectionString: Object.assign(new URL(adresse), { pathname: `/${baseNom}` }).toString() });
    await superutilisateur.connect();
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const audit = new AuditPg(contexte.pool);
      const echeances = new EcheancesPg(contexte.pool);
      const marqueA = await marques.creer(`Ech A ${suffixe}`);
      const marqueB = await marques.creer(`Ech B ${suffixe}`);
      await espaces.assurer(marqueA, 'sub-ea', undefined, 'Établia');
      await espaces.assurer(marqueB, 'sub-eb', undefined, 'Autre');
      const maintenant = new Date('2026-10-21T10:00:00Z');
      const il_y_a = (minutes: number) => new Date(maintenant.getTime() - minutes * 60_000);

      // Même transaction que l'action métier : annulée avec elle, validée avec elle.
      await expect(
        dansTransactionMarque(contexte.pool, marqueA, async (c) => {
          await programmerEcheance(c, marqueA, { type: 'rappel', objet: 'annule', instant: il_y_a(1) });
          throw new Error('action métier en échec');
        }),
      ).rejects.toThrow('action métier en échec');
      expect((await echeances.lister(marqueA, 50)).echeances).toEqual([]);
      await dansTransactionMarque(contexte.pool, marqueA, async (c) => {
        await programmerEcheance(c, marqueA, { type: 'rappel', objet: 'recent', instant: il_y_a(30) });
        await programmerEcheance(c, marqueA, { type: 'publication', objet: 'vieille', instant: il_y_a(300) });
        await programmerEcheance(c, marqueA, { type: 'purge', objet: 'sessions', instant: il_y_a(300), cle: 'unique' });
        // Même clé : ignorée, sans erreur.
        expect(await programmerEcheance(c, marqueA, { type: 'purge', objet: 'sessions', instant: il_y_a(200), cle: 'unique' })).toBeUndefined();
      });
      await dansTransactionMarque(contexte.pool, marqueB, (c) => programmerEcheance(c, marqueB, { type: 'rappel', objet: 'autre-marque', instant: il_y_a(1) }));

      // Deux planificateurs concurrents : chaque échéance déclenche exactement un travail.
      const decider = (e: Echeance) => decideur(e, maintenant);
      const [x, y] = await Promise.all([echeances.declencher(marqueA, maintenant, decider), echeances.declencher(marqueA, maintenant, decider)]);
      expect(x.declenchees + y.declenchees).toBe(2);
      expect(x.echouees + y.echouees).toBe(1);
      const bilan = await echeances.lister(marqueA, 50);
      expect(bilan.travaux.map((t) => t.objet).sort()).toEqual(['recent', 'sessions']);
      expect(bilan.echeances.find((e) => e.objet === 'vieille')).toMatchObject({ etat: 'echouee', cause: 'ECHEANCE_PERIMEE' });
      // Rien de plus à un second passage.
      expect(await echeances.declencher(marqueA, maintenant, decider)).toEqual({ declenchees: 0, echouees: 0 });

      // Un travail dont le bail expire est repris ; terminé, il ne l'est plus.
      const t1 = await echeances.prendreTravail(marqueA, ['purge'], maintenant);
      expect(t1).toMatchObject({ objet: 'sessions', tentatives: 1 });
      expect(await echeances.prendreTravail(marqueA, ['purge'], maintenant)).toBeUndefined();
      const reprise = await echeances.prendreTravail(marqueA, ['purge'], new Date(maintenant.getTime() + 301_000));
      expect(reprise).toMatchObject({ id: t1!.id, tentatives: 2 });
      await echeances.terminerTravail(marqueA, t1!.id, maintenant);
      expect(await echeances.prendreTravail(marqueA, ['purge'], new Date(maintenant.getTime() + 999_000))).toBeUndefined();

      // RLS : l'autre marque ne voit rien, et le planificateur d'une marque ne déclenche pas l'autre.
      expect((await echeances.lister(marqueB, 50)).echeances.map((e) => e.objet)).toEqual(['autre-marque']);
      expect((await echeances.lister(marqueB, 50)).travaux).toEqual([]);

      // Planificateur complet sur la marque A : récurrences inscrites une fois par jour de Paris, même après deux passes.
      const journal = { info: () => undefined, warn: () => undefined, error: () => undefined };
      const planificateur = new Planificateur({ echeances, marques: async () => [marqueA], gestionnaires: gestionnairesDuSocle({ pool: contexte.pool, audit, journal }), journal, maintenant: () => maintenant });
      await planificateur.assurerRecurrences(marqueA);
      await planificateur.assurerRecurrences(marqueA);
      const recurrentes = (await echeances.lister(marqueA, 50)).echeances.filter((e) => e.cle?.endsWith(':2026-10-22'));
      expect(recurrentes.map((e) => e.objet).sort()).toEqual(['chaine', 'clients_oauth', 'sessions']);
      expect(recurrentes.every((e) => e.etat === 'programmee')).toBe(true);

      // Purge des sessions expirées et des clients OAuth inutilisés (vieillis par le superutilisateur).
      await superutilisateur.query(
        `INSERT INTO sessions (marque_id, hache_jeton, sub, authentifie_le, expire_le) VALUES ($1, $2, 'sub-vieux', now() - interval '3 days', now() - interval '2 days'), ($1, $3, 'sub-frais', now(), now() + interval '1 day')`,
        [marqueA, randomBytes(32), randomBytes(32)],
      );
      expect(await purgerSessions(contexte.pool, marqueA)).toBe(1);
      expect((await superutilisateur.query("SELECT sub FROM sessions WHERE marque_id = $1 AND sub IN ('sub-vieux','sub-frais')", [marqueA])).rows).toEqual([{ sub: 'sub-frais' }]);
      const oauth = new OauthPg(contexte.pool);
      const client = await oauth.enregistrerClient(marqueA, { nom: 'Inutilisé', redirectUris: ['https://exemple.test/cb'] });
      await superutilisateur.query("UPDATE oauth_clients SET cree_le = now() - interval '11 minutes' WHERE client_id = $1", [client!.clientId]);
      expect(await purgerClientsOauth(contexte.pool, marqueA)).toBeGreaterThanOrEqual(1);
      expect(await oauth.trouverClient(client!.clientId)).toBeUndefined();

      // Vérification nocturne : chaîne intacte, trace écrite ; puis rupture détectée (falsification par le superutilisateur).
      await audit.ajouter(marqueA, { acteur: 'sub-ea', action: 'essai', objet: 'x' });
      await verifierJournal(audit, journal, marqueA);
      const lignes = await audit.lire(marqueA);
      expect(lignes.at(-1)).toMatchObject({ acteur: 'systeme', action: 'verification_chaine' });
      expect(verifierChaine(lignes)).toBeUndefined();
      await superutilisateur.query('ALTER TABLE journal_audit DISABLE TRIGGER USER');
      try {
        await superutilisateur.query("UPDATE journal_audit SET objet = 'falsifie' WHERE marque_id = $1 AND action = 'essai'", [marqueA]);
      } finally {
        await superutilisateur.query('ALTER TABLE journal_audit ENABLE TRIGGER USER');
      }
      await expect(verifierJournal(audit, journal, marqueA)).rejects.toMatchObject({ cause_: 'CHAINE_ROMPUE' });
    } finally {
      await superutilisateur.end();
      await contexte.fermer();
    }
  });

  it('notifications : créées par le déclencheur à l’échec définitif, une seule fois, par personne et par marque ; relance sans renvoi', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const file = new FilePg(contexte.pool);
      const notifications = new NotificationsPg(contexte.pool);
      const marqueA = await marques.creer(`Notif A ${suffixe}`);
      const marqueB = await marques.creer(`Notif B ${suffixe}`);
      const a = await espaces.assurer(marqueA, 'sub-na', undefined, 'Établia');
      const a2 = await espaces.assurer(marqueA, 'sub-na2', undefined, 'Autre');
      const b = await espaces.assurer(marqueB, 'sub-nb', undefined, 'Autre');

      // Un échec définitif crée la notification, dans la même transaction que le changement d'état.
      const t = await file.enfiler(marqueA, a.utilisateurId, 'rendu', {});
      expect((await file.prendre(marqueA, 'svc'))?.id).toBe(t.id);
      // Une tâche qui sera retentée ne prévient personne.
      expect(await file.echouer(marqueA, t.id, 'svc', 'ECHEC', 'relancer', true)).toBe('prete');
      expect(await notifications.lister(marqueA, a.utilisateurId, 50)).toHaveLength(0);
      expect(await file.echouer(marqueA, t.id, 'svc', 'ECHEC', 'relancer', false)).toBeUndefined();
      const reprise = await file.enfiler(marqueA, a.utilisateurId, 'reseau', {});
      await file.prendre(marqueA, 'svc');
      expect(await file.echouer(marqueA, reprise.id, 'svc', 'ECHEC', 'verifier', true)).toBe('echouee');
      const vues = await notifications.lister(marqueA, a.utilisateurId, 50);
      expect(vues).toHaveLength(1);
      expect(vues[0]).toMatchObject({ genre: 'etape_echouee', etape: 'reseau', cause: 'ECHEC', action: 'verifier', tacheId: reprise.id, acquitteeLe: undefined });

      // Cloisonnement : ni une autre personne de la marque, ni une autre marque.
      expect(await notifications.lister(marqueA, a2.utilisateurId, 50)).toHaveLength(0);
      expect(await notifications.lister(marqueB, b.utilisateurId, 50)).toHaveLength(0);
      expect(await notifications.lister(marqueB, a.utilisateurId, 50)).toHaveLength(0);
      expect(await notifications.acquitter(marqueA, a2.utilisateurId, vues[0]!.id)).toBe(false);
      expect(await notifications.acquitter(marqueB, a.utilisateurId, vues[0]!.id)).toBe(false);

      // Relance : l'étape repart, son historique reste, la notification s'acquitte une fois.
      expect(await file.relancer(marqueA, a.utilisateurId, reprise.id)).toBe(true);
      expect((await file.lire(marqueA, a.utilisateurId, reprise.id))?.etat).toBe('prete');
      expect(await file.relancer(marqueA, a.utilisateurId, reprise.id)).toBe(false);
      expect((await file.historique(marqueA, a.utilisateurId, reprise.id)).length).toBeGreaterThanOrEqual(1);
      expect(await notifications.acquitter(marqueA, a.utilisateurId, vues[0]!.id)).toBe(true);
      expect(await notifications.acquitter(marqueA, a.utilisateurId, vues[0]!.id)).toBe(false);

      // Un nouvel échec de la même tâche (autre tentative) prévient de nouveau ; la clé empêche seulement les doublons.
      await file.prendre(marqueA, 'svc');
      expect(await file.echouer(marqueA, reprise.id, 'svc', 'ECHEC', 'relancer', true)).toBe('echouee');
      expect((await notifications.lister(marqueA, a.utilisateurId, 50)).filter((n) => n.tacheId === reprise.id)).toHaveLength(2);

      // Une notification d'administration se crée une fois par clé.
      const alerte = { utilisateurId: a.utilisateurId, genre: 'chaine_rompue', cle: 'chaine_rompue:2026-10-21' };
      await notifications.creer(marqueA, alerte);
      await notifications.creer(marqueA, alerte);
      expect((await notifications.lister(marqueA, a.utilisateurId, 50)).filter((n) => n.genre === 'chaine_rompue')).toHaveLength(1);
    } finally {
      await contexte.fermer();
    }
  });

  it('gabarits : départ donné une fois à chaque espace, un seul par défaut, cloisonnés par marque et par personne, version qui monte, RLS forcée', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const gabarits = new GabaritsPg(contexte.pool);
      const marqueA = await marques.creer(`Gabarit A ${suffixe}`);
      const marqueB = await marques.creer(`Gabarit B ${suffixe}`);
      const a = await espaces.assurer(marqueA, 'sub-ga', undefined, 'Établia');
      const a2 = await espaces.assurer(marqueA, 'sub-ga2', undefined, 'Autre');
      const b = await espaces.assurer(marqueB, 'sub-gb', undefined, 'Autre');

      // Chaque espace (personnel et marque) reçoit le gabarit de départ, une seule fois, même à deux appels simultanés.
      const [un, deux] = await Promise.all([gabarits.lister(marqueA, a.utilisateurId), gabarits.lister(marqueA, a.utilisateurId)]);
      expect(un).toHaveLength(2);
      expect(deux).toHaveLength(2);
      expect(new Set(un.map((g) => g.espaceId))).toEqual(new Set(a.espaces.map((e) => e.id)));
      expect(un.every((g) => g.parDefaut && g.version === 1)).toBe(true);
      expect(un[0]!.definition).toEqual(GABARIT_DE_DEPART);
      expect(await gabarits.lister(marqueA, a.utilisateurId)).toHaveLength(2);

      // Pas de limite de 3 gabarits : on peut en créer plus, et ils ne sont jamais « par défaut ».
      const espace = a.espaces[0]!.id;
      for (let i = 0; i < 4; i++) expect(await gabarits.creer({ marqueId: marqueA, utilisateurId: a.utilisateurId, espaceId: espace, nom: `Variante ${i}`, definition: GABARIT_DE_DEPART })).toBeDefined();
      expect((await gabarits.lister(marqueA, a.utilisateurId, espace)).length).toBe(5);

      // Remplacement : la version monte, la définition change.
      const premier = un[0]!;
      const apres = await gabarits.remplacer(marqueA, a.utilisateurId, premier.id, { nom: 'Renommé', definition: { ...GABARIT_DE_DEPART, styleSousTitres: 'impact' } });
      expect(apres).toMatchObject({ nom: 'Renommé', version: 2, definition: { styleSousTitres: 'impact' } });

      // Cloisonnement : une autre personne, une autre marque, ni lecture, ni écriture, ni création.
      expect(await gabarits.lire(marqueA, a2.utilisateurId, premier.id)).toBeUndefined();
      expect(await gabarits.lire(marqueB, b.utilisateurId, premier.id)).toBeUndefined();
      expect(await gabarits.lire(marqueB, a.utilisateurId, premier.id)).toBeUndefined();
      expect(await gabarits.remplacer(marqueA, a2.utilisateurId, premier.id, { definition: GABARIT_DE_DEPART })).toBeUndefined();
      expect(await gabarits.creer({ marqueId: marqueA, utilisateurId: a2.utilisateurId, espaceId: espace, nom: 'Intrus', definition: GABARIT_DE_DEPART })).toBeUndefined();
      expect(await gabarits.creer({ marqueId: marqueB, utilisateurId: b.utilisateurId, espaceId: espace, nom: 'Intrus', definition: GABARIT_DE_DEPART })).toBeUndefined();
      expect((await gabarits.lister(marqueB, b.utilisateurId)).every((g) => b.espaces.some((e) => e.id === g.espaceId))).toBe(true);

      // Sans marque posée, aucune ligne ; jamais de DELETE pour le rôle du cœur.
      const brut = await contexte.pool.query('SELECT count(*)::int AS n FROM gabarits');
      expect(brut.rows[0].n).toBe(0);
      await expect(contexte.pool.query('DELETE FROM gabarits')).rejects.toThrow(/permission denied/);
      await expect(dansTransactionMarque(contexte.pool, marqueA, (c) => c.query('UPDATE gabarits SET marque_id = marque_id'))).rejects.toThrow(/permission denied/);
    } finally {
      await contexte.fermer();
    }
  });

  it('applications : hôtes en liste stricte, cloisonnées par marque et par personne, nom unique par espace, version qui monte, RLS forcée', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const applications = new ApplicationsPg(contexte.pool);
      const marqueA = await marques.creer(`Applis A ${suffixe}`);
      const marqueB = await marques.creer(`Applis B ${suffixe}`);
      const a = await espaces.assurer(marqueA, 'sub-aa', undefined, 'Établia');
      const a2 = await espaces.assurer(marqueA, 'sub-aa2', undefined, 'Autre');
      const b = await espaces.assurer(marqueB, 'sub-ab', undefined, 'Autre');
      const espace = a.espaces[0]!.id;
      const champs = { nom: 'Démo', accueil: 'https://demo.etablia.fr/', hotes: ['cdn.etablia.fr', 'demo.etablia.fr'] };

      const cree = await applications.creer({ marqueId: marqueA, utilisateurId: a.utilisateurId, espaceId: espace, ...champs });
      expect(cree).toMatchObject({ espaceId: espace, nom: 'Démo', version: 1, hotes: champs.hotes });
      await expect(applications.creer({ marqueId: marqueA, utilisateurId: a.utilisateurId, espaceId: espace, ...champs })).rejects.toBeInstanceOf(NomApplicationPris);
      const apres = await applications.remplacer(marqueA, a.utilisateurId, cree!.id, { ...champs, hotes: ['demo.etablia.fr'] });
      expect(apres).toMatchObject({ version: 2, hotes: ['demo.etablia.fr'] });
      expect(await applications.lister(marqueA, a.utilisateurId)).toHaveLength(1);

      // Cloisonnement : une autre personne, une autre marque, ni lecture, ni écriture, ni création.
      expect(await applications.lire(marqueA, a2.utilisateurId, cree!.id)).toBeUndefined();
      expect(await applications.lire(marqueB, b.utilisateurId, cree!.id)).toBeUndefined();
      expect(await applications.lire(marqueB, a.utilisateurId, cree!.id)).toBeUndefined();
      expect(await applications.remplacer(marqueA, a2.utilisateurId, cree!.id, champs)).toBeUndefined();
      expect(await applications.creer({ marqueId: marqueA, utilisateurId: a2.utilisateurId, espaceId: espace, ...champs, nom: 'Intrus' })).toBeUndefined();
      expect(await applications.creer({ marqueId: marqueB, utilisateurId: b.utilisateurId, espaceId: espace, ...champs, nom: 'Intrus' })).toBeUndefined();
      expect(await applications.lister(marqueB, b.utilisateurId)).toHaveLength(0);

      // Sans marque posée, aucune ligne ; jamais de DELETE ; la liste d'hôtes ne peut pas être vide.
      const brut = await contexte.pool.query('SELECT count(*)::int AS n FROM applications');
      expect(brut.rows[0].n).toBe(0);
      await expect(contexte.pool.query('DELETE FROM applications')).rejects.toThrow(/permission denied/);
      await expect(dansTransactionMarque(contexte.pool, marqueA, (c) => c.query('UPDATE applications SET marque_id = marque_id'))).rejects.toThrow(/permission denied/);
      await expect(applications.creer({ marqueId: marqueA, utilisateurId: a.utilisateurId, espaceId: espace, ...champs, nom: 'Vide', hotes: [] })).rejects.toThrow(/check/i);
    } finally {
      await contexte.fermer();
    }
  });

  it('scripts : cloisonnés par marque et par personne, version vérifiée, dernier jeu remis à vide, RLS forcée (histoire 4.4)', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const applications = new ApplicationsPg(contexte.pool);
      const scripts = new ScriptsPg(contexte.pool);
      const marqueA = await marques.creer(`Scripts A ${suffixe}`);
      const marqueB = await marques.creer(`Scripts B ${suffixe}`);
      const a = await espaces.assurer(marqueA, 'sub-sa', undefined, 'Établia');
      const a2 = await espaces.assurer(marqueA, 'sub-sa2', undefined, 'Autre');
      const b = await espaces.assurer(marqueB, 'sub-sb', undefined, 'Autre');
      const app = (await applications.creer({ marqueId: marqueA, utilisateurId: a.utilisateurId, espaceId: a.espaces[0]!.id, nom: 'Démo', accueil: 'https://demo.etablia.fr/', hotes: ['demo.etablia.fr'] }))!;
      const etapes = [{ verbe: 'aller' as const, url: 'https://demo.etablia.fr/' }, { verbe: 'cliquer' as const, cible: 'Connexion' }];

      const cree = (await scripts.creer({ marqueId: marqueA, utilisateurId: a.utilisateurId, applicationId: app.id, origine: 'claude', nom: 'Parcours', etapes }))!;
      expect(cree).toMatchObject({ espaceId: app.espaceId, origine: 'claude', version: 1, dernierJeu: null, etapes });
      await expect(scripts.creer({ marqueId: marqueA, utilisateurId: a.utilisateurId, applicationId: app.id, origine: 'claude', nom: 'Parcours', etapes })).rejects.toBeInstanceOf(NomScriptPris);

      // Le dernier jeu s'enregistre, puis un remplacement le remet à vide et fait monter la version.
      expect(await scripts.enregistrerJeu(marqueA, a.utilisateurId, cree.id, { etat: 'echec', etape: 2, cause: 'introuvable', capture: 'AAAA', jouLe: new Date().toISOString() })).toBe(true);
      expect((await scripts.lire(marqueA, a.utilisateurId, cree.id))!.dernierJeu).toMatchObject({ etat: 'echec', etape: 2 });
      // Histoire 4.5 : un jeu d'une version périmée n'écrase rien ; la bonne version s'enregistre.
      const jeuVieux = { etat: 'echec' as const, etape: 1, cause: 'introuvable', capture: 'BBBB', jouLe: new Date().toISOString() };
      expect(await scripts.enregistrerJeu(marqueA, a.utilisateurId, cree.id, jeuVieux, 7)).toBe(false);
      expect((await scripts.lire(marqueA, a.utilisateurId, cree.id))!.dernierJeu).toMatchObject({ etape: 2 });
      expect(await scripts.enregistrerJeu(marqueA, a.utilisateurId, cree.id, jeuVieux, 1)).toBe(true);
      expect((await scripts.lire(marqueA, a.utilisateurId, cree.id))!.dernierJeu).toMatchObject({ etape: 1 });
      const remplace = await scripts.remplacer(marqueA, a.utilisateurId, cree.id, { nom: 'Parcours', etapes: [etapes[0]!] }, 1);
      expect(remplace).toMatchObject({ etat: 'ok', script: { version: 2, dernierJeu: null } });
      expect(await scripts.remplacer(marqueA, a.utilisateurId, cree.id, { nom: 'Parcours', etapes }, 1)).toMatchObject({ etat: 'perimee' });

      // Cloisonnement : une autre personne, une autre marque.
      expect(await scripts.lire(marqueA, a2.utilisateurId, cree.id)).toBeUndefined();
      expect(await scripts.lire(marqueB, b.utilisateurId, cree.id)).toBeUndefined();
      expect(await scripts.remplacer(marqueA, a2.utilisateurId, cree.id, { nom: 'X', etapes }, 2)).toMatchObject({ etat: 'introuvable' });
      expect(await scripts.creer({ marqueId: marqueA, utilisateurId: a2.utilisateurId, applicationId: app.id, origine: 'claude', nom: 'Intrus', etapes })).toBeUndefined();
      expect(await scripts.lister(marqueB, b.utilisateurId)).toHaveLength(0);

      // Sans marque posée, aucune ligne ; jamais de DELETE ; au plus cent étapes.
      expect((await contexte.pool.query('SELECT count(*)::int AS n FROM scripts')).rows[0].n).toBe(0);
      await expect(contexte.pool.query('DELETE FROM scripts')).rejects.toThrow(/permission denied/);
      await expect(dansTransactionMarque(contexte.pool, marqueA, (c) => c.query('UPDATE scripts SET marque_id = marque_id'))).rejects.toThrow(/permission denied/);
      const trop = Array.from({ length: 101 }, () => ({ verbe: 'connexion' as const }));
      await expect(scripts.creer({ marqueId: marqueA, utilisateurId: a.utilisateurId, applicationId: app.id, origine: 'claude', nom: 'Trop', etapes: trop })).rejects.toThrow(/check/i);
    } finally {
      await contexte.fermer();
    }
  });

  it('montages : versions immuables, rendus qui avancent, cloisonnés par marque et par personne, RLS forcée (histoire 4.6)', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marques = new MarquesPg(contexte.pool);
      const espaces = new EspacesPg(contexte.pool);
      const montages = new MontagesPg(contexte.pool);
      const marqueA = await marques.creer(`Montages A ${suffixe}`);
      const marqueB = await marques.creer(`Montages B ${suffixe}`);
      const a = await espaces.assurer(marqueA, 'sub-ma', undefined, 'Établia');
      const a2 = await espaces.assurer(marqueA, 'sub-ma2', undefined, 'Autre');
      const b = await espaces.assurer(marqueB, 'sub-mb', undefined, 'Autre');
      const espaceA = a.espaces[0]!.id;
      const timeline = depuisJournal([{ t: 0, genre: 'film_debut' }, { t: 100, genre: 'narration', cible: 'Bonjour.' }, { t: 3000, genre: 'film_fin' }], { filmDureeMs: 3000 });
      const gabarit = figerGabarit({ id: randomUUID(), nom: 'Départ', version: 1, definition: GABARIT_DE_DEPART });
      const film = { id: randomUUID(), genre: 'film' as const, mime: 'video/webm' as const, octets: 12, sha256: 'a'.repeat(64) };

      const premier = (await montages.creerDepuisFilm({ marqueId: marqueA, utilisateurId: a.utilisateurId, espaceId: espaceA, scriptId: null, montageId: randomUUID(), film, timeline, gabarit }))!;
      expect(premier).toMatchObject({ numero: 1, origine: 'jeu', parentId: null });
      expect(premier.serieId).toBe(premier.id);

      // Une nouvelle version est une nouvelle ligne ; éditer une version dépassée est refusé.
      const v2 = await montages.creerVersion({ marqueId: marqueA, utilisateurId: a.utilisateurId, parentId: premier.id, origine: 'edition', timeline });
      expect(v2).toMatchObject({ etat: 'ok', montage: { numero: 2, parentId: premier.id, filmFichierId: premier.filmFichierId } });
      expect(await montages.creerVersion({ marqueId: marqueA, utilisateurId: a.utilisateurId, parentId: premier.id, origine: 'edition', timeline })).toMatchObject({ etat: 'perimee', derniere: 2 });
      expect((await montages.listerSerie(marqueA, a.utilisateurId, premier.serieId)).map((m) => m.numero)).toEqual([2, 1]);

      // Un rendu avance, mais ne revient pas en arrière ; les violations sont gardées.
      const rendu = (await montages.creerRendu({ marqueId: marqueA, utilisateurId: a.utilisateurId, montageId: premier.id, genre: 'allege' }))!;
      expect(rendu.etat).toBe('en_file');
      await montages.demarrerRendu(marqueA, a.utilisateurId, rendu.id);
      await montages.terminerRendu(marqueA, a.utilisateurId, rendu.id, { etat: 'bloque', violations: [{ code: 'CONTRASTE', segment: 'sc-1', element: 'sc-1-accroche', mesure: 2, seuil: 4.5 }] as never });
      expect(await montages.lireRendu(marqueA, a.utilisateurId, rendu.id)).toMatchObject({ etat: 'bloque' });

      // Cloisonnement : autre personne de la marque, autre marque.
      expect(await montages.lire(marqueA, a2.utilisateurId, premier.id)).toBeUndefined();
      expect(await montages.lire(marqueB, b.utilisateurId, premier.id)).toBeUndefined();
      expect(await montages.lireRendu(marqueB, b.utilisateurId, rendu.id)).toBeUndefined();
      expect(await montages.listerDernieres(marqueB, b.utilisateurId)).toHaveLength(0);
      expect(await montages.creerRendu({ marqueId: marqueA, utilisateurId: a2.utilisateurId, montageId: premier.id, genre: 'allege' })).toBeUndefined();
      expect(await montages.creerDepuisFilm({ marqueId: marqueA, utilisateurId: a2.utilisateurId, espaceId: espaceA, scriptId: null, montageId: randomUUID(), film: { ...film, id: randomUUID() }, timeline, gabarit })).toBeUndefined();

      // RLS forcée : sans marque, rien ; jamais d'UPDATE ni de DELETE sur les montages ; pas de film hors liste.
      for (const t of ['fichiers', 'montages', 'rendus']) expect((await contexte.pool.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n).toBe(0);
      await expect(contexte.pool.query('DELETE FROM montages')).rejects.toThrow(/permission denied/);
      await expect(dansTransactionMarque(contexte.pool, marqueA, (c) => c.query('UPDATE montages SET timeline = timeline'))).rejects.toThrow(/permission denied/);
      await expect(dansTransactionMarque(contexte.pool, marqueA, (c) => c.query('UPDATE fichiers SET octets = 0'))).rejects.toThrow(/permission denied/);
      await expect(montages.ajouterFichier(marqueA, a.utilisateurId, espaceA, { ...film, id: randomUUID(), mime: 'audio/wav' as const, genre: 'rendu' as const, sha256: 'xyz' })).rejects.toThrow(/check/i);
    } finally {
      await contexte.fermer();
    }
  });

  it('compte de démo : remplacé sans changer d’id, chiffré, jamais lisible d’une autre marque (histoire 4.3)', async () => {
    const contexte = await demarrerBase(environnement(), { masqueur: new Masqueur() });
    try {
      const marqueA = randomUUID();
      const marqueB = randomUUID();
      for (const [marque, nom] of [[marqueA, 'CA'], [marqueB, 'CB']] as const) {
        await dansTransactionMarque(contexte.pool, marque, (client) => client.query('INSERT INTO marques (id, nom) VALUES ($1, $2)', [marque, `Marque ${nom} ${suffixe}`]));
      }
      const comptes = new ComptesDemoPg(contexte.pool, contexte.coffre);
      const application = randomUUID();
      expect(await comptes.etat(marqueA, application)).toEqual({ depose: false, modifieLe: undefined });
      const mdp = randomBytes(12).toString('hex');
      const cible = { accueil: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr'] };
      await comptes.remplacer(marqueA, application, { identifiant: 'demo@exemple.fr', motDePasse: mdp }, cible);
      const lecteur = lecteurCoffre(contexte.pool, contexte.coffre);
      const nom = nomSecretCompteDemo(application);
      expect(JSON.parse((await lecteur(marqueA, TYPE_SECRET_COMPTE_DEMO, nom))!)).toEqual({ identifiant: 'demo@exemple.fr', motDePasse: mdp, accueil: cible.accueil, hotes: cible.hotes });
      // Remplacer garde le même secret (l'id est dans les données authentifiées) et reste lisible.
      const avant = await dansTransactionMarque(contexte.pool, marqueA, (c) => c.query('SELECT id FROM secrets WHERE nom = $1', [nom]));
      await comptes.remplacer(marqueA, application, { identifiant: 'autre@exemple.fr', motDePasse: 'nouveau-mdp' }, cible);
      const apres = await dansTransactionMarque(contexte.pool, marqueA, (c) => c.query('SELECT id FROM secrets WHERE nom = $1', [nom]));
      expect(apres.rows).toEqual(avant.rows);
      expect(JSON.parse((await lecteur(marqueA, TYPE_SECRET_COMPTE_DEMO, nom))!).identifiant).toBe('autre@exemple.fr');
      expect((await comptes.etat(marqueA, application)).depose).toBe(true);
      // La marque B ne voit ni l'état ni le contenu.
      expect((await comptes.etat(marqueB, application)).depose).toBe(false);
      expect(await lecteur(marqueB, TYPE_SECRET_COMPTE_DEMO, nom)).toBeUndefined();
      // Supprimer retire le secret de la marque A, et de A seule.
      expect(await comptes.supprimer(marqueB, application)).toBe(false);
      expect(await comptes.supprimer(marqueA, application)).toBe(true);
      expect(await comptes.supprimer(marqueA, application)).toBe(false);
      expect((await comptes.etat(marqueA, application)).depose).toBe(false);
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
