// regie — démarrage sûr (AR-3, NFR-30) : refuse de démarrer, en nommant la cause, si quelque chose manque.
// Ordre du socle : environnement → clé et coffre → base → migrations → (services, façades, Astro, dans serveur.ts).
// Aucune valeur secrète n'apparaît jamais dans un message.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import type { Environnement } from '../env.ts';
import { causeConnexion, creerPool, verifierOuCreerTemoin } from './base.ts';
import { Coffre, ErreurCoffre, lireCleMaitresse } from './coffre.ts';
import { masqueurProcessus, type Masqueur } from './masquage.ts';
import { ErreurMigration, appliquerMigrations, lireMigrations, verifierSchema } from './migrations.ts';

export type EtapeDemarrage = 'cle' | 'secrets' | 'base' | 'migrations' | 'coffre';

export class ErreurDemarrage extends Error {
  readonly etape: EtapeDemarrage;

  constructor(etape: EtapeDemarrage, message: string) {
    super(message);
    this.name = 'ErreurDemarrage';
    this.etape = etape;
  }
}

export const DOSSIER_MIGRATIONS = fileURLToPath(new URL('../../migrations/', import.meta.url));

/** Noms des fichiers de secrets dans DOSSIER_SECRETS (secrets Podman montés en lecture seule). */
export const FICHIERS_SECRETS = Object.freeze({
  cleMaitresse: 'regie_cle_maitresse',
  baseCoeur: 'regie_base_coeur',
  baseMigrations: 'regie_base_migrations',
});

function lireMotDePasse(chemin: string): string {
  let contenu: string;
  try {
    contenu = readFileSync(chemin, 'utf8');
  } catch (erreur) {
    const code = (erreur as NodeJS.ErrnoException).code;
    throw new ErreurDemarrage(
      'secrets',
      code === 'ENOENT' ? `secret absent (fichier ${chemin} introuvable)` : `secret illisible (fichier ${chemin}, erreur ${code ?? 'inconnue'})`,
    );
  }
  const motDePasse = contenu.replace(/\r?\n$/, '');
  if (motDePasse === '') throw new ErreurDemarrage('secrets', `secret vide (fichier ${chemin})`);
  return motDePasse;
}

export type Contexte = Readonly<{ pool: Pool; coffre: Coffre; fermer: () => Promise<void> }>;

export async function demarrerBase(
  env: Environnement,
  options: { masqueur?: Masqueur; dossierMigrations?: string } = {},
): Promise<Contexte> {
  const masqueur = options.masqueur ?? masqueurProcessus;
  const dossier = (nom: string) => join(env.DOSSIER_SECRETS, nom);

  // 1. Clé et coffre.
  let coffre: Coffre;
  try {
    const cle = lireCleMaitresse(dossier(FICHIERS_SECRETS.cleMaitresse));
    masqueur.ajouter(cle.toString('hex'));
    coffre = new Coffre(cle);
  } catch (erreur) {
    if (erreur instanceof ErreurCoffre) throw new ErreurDemarrage('cle', erreur.message);
    throw erreur;
  }
  const motDePasseCoeur = lireMotDePasse(dossier(FICHIERS_SECRETS.baseCoeur));
  const motDePasseMigrations = lireMotDePasse(dossier(FICHIERS_SECRETS.baseMigrations));
  masqueur.ajouter(motDePasseCoeur);
  masqueur.ajouter(motDePasseMigrations);

  // 2. Base et migrations, sous le rôle regie_migrations, fermé aussitôt après : aucun code applicatif n'y tourne.
  const base = { hote: env.BASE_HOTE, port: env.BASE_PORT, base: env.BASE_NOM };
  const poolMigrations = creerPool({ ...base, utilisateur: env.BASE_MIGRATIONS_UTILISATEUR, motDePasse: motDePasseMigrations }, { max: 1 });
  try {
    let client;
    try {
      client = await poolMigrations.connect();
    } catch (erreur) {
      throw new ErreurDemarrage('base', `base injoignable (${env.BASE_HOTE}:${env.BASE_PORT}) : ${causeConnexion(erreur)}`);
    }
    try {
      const disque = lireMigrations(options.dossierMigrations ?? DOSSIER_MIGRATIONS);
      await appliquerMigrations(client, disque);
      await verifierSchema(client);
    } catch (erreur) {
      if (erreur instanceof ErreurMigration) throw new ErreurDemarrage('migrations', erreur.message);
      throw erreur;
    } finally {
      client.release();
    }
  } finally {
    await poolMigrations.end();
  }

  // 3. Pool applicatif (regie_coeur, soumis à la RLS) et témoin du coffre.
  const pool = creerPool({ ...base, utilisateur: env.BASE_UTILISATEUR, motDePasse: motDePasseCoeur });
  try {
    await verifierOuCreerTemoin(pool, coffre);
  } catch (erreur) {
    await pool.end().catch(() => undefined);
    if (erreur instanceof ErreurCoffre) throw new ErreurDemarrage('coffre', erreur.message);
    throw new ErreurDemarrage('base', `base inutilisable par ${env.BASE_UTILISATEUR} : ${causeConnexion(erreur)}`);
  }
  return { pool, coffre, fermer: () => pool.end() };
}
