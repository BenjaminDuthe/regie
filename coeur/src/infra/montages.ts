// regie — fichiers, montages et rendus (histoire 4.6, FR-26, FR-28). Un montage est une version IMMUABLE d'une timeline
// avec le gabarit figé à sa création ; une modification crée une nouvelle version dans la même série (3.10), un
// changement de gabarit aussi (2.13). Un rendu est un passage de FFmpeg sur un montage. Tout passe par
// `dansTransactionUtilisateur` : la RLS cloisonne par marque, et par espace visible de la personne.

import type { ClientBase, Pool } from 'pg';
import { Timeline } from '@regie/contrats';
import { GabaritFige } from '../domaine/montage.ts';
import type { Violation } from '../domaine/gardes.ts';
import { dansTransactionUtilisateur } from './base.ts';

export const GENRES_FICHIER = ['film', 'voix', 'rendu', 'rendu_allege'] as const;
export type GenreFichier = (typeof GENRES_FICHIER)[number];
export type MimeFichier = 'video/webm' | 'video/mp4' | 'audio/wav';

export type Fichier = Readonly<{
  id: string;
  espaceId: string;
  genre: GenreFichier;
  mime: MimeFichier;
  octets: number;
  sha256: string;
  dureeMs: number | null;
  montageId: string | null;
  sceneId: string | null;
  creeLe: Date;
  purgeLe: Date | null;
}>;

export type NouveauFichier = Readonly<{ id: string; genre: GenreFichier; mime: MimeFichier; octets: number; sha256: string; dureeMs?: number | undefined; montageId?: string | undefined; sceneId?: string | undefined }>;

export type OrigineMontage = 'jeu' | 'edition' | 'gabarit';

export type Montage = Readonly<{
  id: string;
  espaceId: string;
  scriptId: string | null;
  serieId: string;
  numero: number;
  parentId: string | null;
  origine: OrigineMontage;
  filmFichierId: string;
  timeline: Timeline;
  gabarit: GabaritFige;
  creeLe: Date;
}>;

export const ETATS_RENDU = ['en_file', 'en_cours', 'pret', 'bloque', 'echec'] as const;
export type EtatRendu = (typeof ETATS_RENDU)[number];
export type GenreRendu = 'allege' | 'complet';

export type Rendu = Readonly<{
  id: string;
  espaceId: string;
  montageId: string;
  genre: GenreRendu;
  etat: EtatRendu;
  tacheId: string | null;
  fichierId: string | null;
  violations: readonly Violation[];
  cause: string | null;
  creeLe: Date;
  termineLe: Date | null;
}>;

export type FinRendu = Readonly<{ etat: 'pret' | 'bloque' | 'echec'; fichierId?: string | undefined; violations?: readonly Violation[] | undefined; cause?: string | undefined }>;

export type LegendeEnregistree = Readonly<{ serieId: string; reseau: string; legende: string; hashtags: readonly string[]; majLe: Date }>;

/** Une vidéo de la bibliothèque : sa dernière version, les rendus de cette version et son archivage (histoire 3.9). */
export type EntreeBibliotheque = Readonly<{ montage: Montage; rendus: readonly Rendu[]; archiveeLe: Date | null }>;

/** Ce qu'une suppression a retiré de la base : les fichiers dont les octets restent à effacer du disque. */
export type SuppressionVideo = Readonly<{ fichiers: readonly { id: string; espaceId: string }[] }>;

export type ResultatVersion = Readonly<{ etat: 'ok'; montage: Montage }> | Readonly<{ etat: 'introuvable' }> | Readonly<{ etat: 'perimee'; derniere: number }>;

export interface Montages {
  /** Premier montage d'une vidéo, avec son film. `undefined` si l'espace n'existe pas pour cette personne. */
  creerDepuisFilm(n: { marqueId: string; utilisateurId: string; espaceId: string; scriptId: string | null; montageId: string; film: NouveauFichier; timeline: Timeline; gabarit: GabaritFige }): Promise<Montage | undefined>;
  /**
   * Nouvelle version d'une série, fille de `parentId`. `perimee` si `parentId` n'est plus la dernière version de sa
   * série : la personne éditait une version dépassée. Le film est celui du parent.
   */
  creerVersion(n: { marqueId: string; utilisateurId: string; parentId: string; origine: 'edition' | 'gabarit'; timeline: Timeline; gabarit?: GabaritFige }): Promise<ResultatVersion>;
  lire(marqueId: string, utilisateurId: string, id: string): Promise<Montage | undefined>;
  /** Toutes les versions d'une série, de la plus récente à la plus ancienne. */
  listerSerie(marqueId: string, utilisateurId: string, serieId: string): Promise<Montage[]>;
  /** La dernière version de chaque série visible, la plus récente d'abord (filtrable par script). */
  listerDernieres(marqueId: string, utilisateurId: string, filtre?: { scriptId?: string; limite?: number }): Promise<Montage[]>;

  ajouterFichier(marqueId: string, utilisateurId: string, espaceId: string, f: NouveauFichier): Promise<Fichier>;
  lireFichier(marqueId: string, utilisateurId: string, id: string): Promise<Fichier | undefined>;
  /** Les fichiers de voix d'un montage (une par scène, la plus récente de chaque scène). */
  listerVoix(marqueId: string, utilisateurId: string, montageId: string): Promise<Fichier[]>;
  marquerPurge(marqueId: string, utilisateurId: string, id: string, quand: Date): Promise<boolean>;

  creerRendu(n: { marqueId: string; utilisateurId: string; montageId: string; genre: GenreRendu }): Promise<Rendu | undefined>;
  lierTache(marqueId: string, utilisateurId: string, renduId: string, tacheId: string): Promise<void>;
  lireRendu(marqueId: string, utilisateurId: string, id: string): Promise<Rendu | undefined>;
  /** Le rendu associé à une tâche de la file. */
  lireRenduDeTache(marqueId: string, utilisateurId: string, tacheId: string): Promise<Rendu | undefined>;
  listerRendus(marqueId: string, utilisateurId: string, montageId: string): Promise<Rendu[]>;
  demarrerRendu(marqueId: string, utilisateurId: string, id: string): Promise<void>;
  terminerRendu(marqueId: string, utilisateurId: string, id: string, fin: FinRendu): Promise<void>;

  /** Les dernières versions des vidéos visibles (archivées comprises), la plus récente d'abord, avec leurs rendus. */
  bibliotheque(marqueId: string, utilisateurId: string, filtre?: { espaceId?: string; limite?: number }): Promise<EntreeBibliotheque[]>;
  /** Archive (ou désarchive) toutes les versions d'une vidéo ; `false` si elle n'existe pas pour cette personne. Rien n'est effacé. */
  archiver(marqueId: string, utilisateurId: string, serieId: string, archivee: boolean): Promise<boolean>;
  /**
   * Supprime une vidéo entière en une transaction (rendus, légendes, voix, versions, films, rendus) et l'inscrit dans
   * `suppressions`. `undefined` si elle n'existe pas pour cette personne. Les octets sont à effacer ensuite (AR-12).
   */
  supprimerVideo(marqueId: string, utilisateurId: string, serieId: string): Promise<SuppressionVideo | undefined>;
  /**
   * Une publication en ligne (en cours d'envoi, publiée ou d'état incertain) existe-t-elle pour cette vidéo ? Une vidéo
   * en ligne ne se supprime pas (histoires 3.9 et 7.3) ; `supprimerVideo` refait ce contrôle sous le verrou.
   */
  aPublicationPubliee(marqueId: string, utilisateurId: string, serieId: string): Promise<boolean>;

  /** La légende enregistrée d'une vidéo (sa série) pour un réseau ; `undefined` si aucune. */
  lireLegende(marqueId: string, utilisateurId: string, serieId: string, reseau: string): Promise<LegendeEnregistree | undefined>;
  /** Enregistre (remplace) la légende d'une vidéo pour un réseau. `undefined` si la série n'existe pas pour cette personne. */
  enregistrerLegende(n: { marqueId: string; utilisateurId: string; serieId: string; reseau: string; legende: string; hashtags: readonly string[] }): Promise<LegendeEnregistree | undefined>;
}

type LigneFichier = { id: string; espace_id: string; genre: GenreFichier; mime: MimeFichier; octets: string | number; sha256: string; duree_ms: number | null; montage_id: string | null; scene_id: string | null; cree_le: Date; purge_le: Date | null };
const COL_FICHIER = 'id, espace_id, genre, mime, octets, sha256, duree_ms, montage_id, scene_id, cree_le, purge_le';
const versFichier = (l: LigneFichier): Fichier => ({
  id: l.id, espaceId: l.espace_id, genre: l.genre, mime: l.mime, octets: Number(l.octets), sha256: l.sha256, dureeMs: l.duree_ms, montageId: l.montage_id, sceneId: l.scene_id, creeLe: l.cree_le, purgeLe: l.purge_le,
});

type LigneMontage = { id: string; espace_id: string; script_id: string | null; serie_id: string; numero: number; parent_id: string | null; origine: OrigineMontage; film_fichier_id: string; timeline: unknown; gabarit: unknown; cree_le: Date };
const COL_MONTAGE = 'id, espace_id, script_id, serie_id, numero, parent_id, origine, film_fichier_id, timeline, gabarit, cree_le';
const versMontage = (l: LigneMontage): Montage => ({
  id: l.id, espaceId: l.espace_id, scriptId: l.script_id, serieId: l.serie_id, numero: l.numero, parentId: l.parent_id, origine: l.origine, filmFichierId: l.film_fichier_id,
  timeline: Timeline.parse(l.timeline), gabarit: GabaritFige.parse(l.gabarit), creeLe: l.cree_le,
});

type LigneRendu = { id: string; espace_id: string; montage_id: string; genre: GenreRendu; etat: EtatRendu; tache_id: string | null; fichier_id: string | null; violations: Violation[]; cause: string | null; cree_le: Date; termine_le: Date | null };
const COL_RENDU = 'id, espace_id, montage_id, genre, etat, tache_id, fichier_id, violations, cause, cree_le, termine_le';
const versRendu = (l: LigneRendu): Rendu => ({
  id: l.id, espaceId: l.espace_id, montageId: l.montage_id, genre: l.genre, etat: l.etat, tacheId: l.tache_id, fichierId: l.fichier_id, violations: l.violations, cause: l.cause, creeLe: l.cree_le, termineLe: l.termine_le,
});

type LigneLegende = { serie_id: string; reseau: string; legende: string; hashtags: string[]; maj_le: Date };
const versLegende = (l: LigneLegende): LegendeEnregistree => ({ serieId: l.serie_id, reseau: l.reseau, legende: l.legende, hashtags: l.hashtags, majLe: l.maj_le });

const estDoublon = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

/** Levée par `supprimerVideo` quand une publication de la vidéo est en ligne ; l'action la traduit en `VIDEO_PUBLIEE`. */
export class ErreurVideoPubliee extends Error {
  constructor() {
    super('VIDEO_PUBLIEE');
    this.name = 'ErreurVideoPubliee';
  }
}

async function publicationEnLigne(client: ClientBase, serieId: string): Promise<boolean> {
  const r = await client.query("SELECT 1 FROM publications WHERE serie_id = $1 AND etat IN ('envoi_en_cours', 'publiee', 'incertaine') LIMIT 1", [serieId]);
  return r.rows.length > 0;
}

export class MontagesPg implements Montages {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async creerDepuisFilm(n: { marqueId: string; utilisateurId: string; espaceId: string; scriptId: string | null; montageId: string; film: NouveauFichier; timeline: Timeline; gabarit: GabaritFige }): Promise<Montage | undefined> {
    return dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
      const espace = await client.query<{ marque_id: string }>('SELECT marque_id FROM espaces WHERE id = $1', [n.espaceId]);
      if (espace.rows[0] === undefined) return undefined;
      const f = n.film;
      await client.query(
        `INSERT INTO fichiers (id, marque_id, espace_id, genre, mime, octets, sha256, duree_ms) VALUES ($1, $2, $3, 'film', $4, $5, $6, $7)`,
        [f.id, n.marqueId, n.espaceId, f.mime, f.octets, f.sha256, f.dureeMs ?? null],
      );
      const { rows } = await client.query<LigneMontage>(
        `INSERT INTO montages (id, marque_id, espace_id, script_id, serie_id, numero, origine, film_fichier_id, timeline, gabarit)
         VALUES ($1, $2, $3, $4, $1, 1, 'jeu', $5, $6::jsonb, $7::jsonb) RETURNING ${COL_MONTAGE}`,
        [n.montageId, n.marqueId, n.espaceId, n.scriptId, f.id, JSON.stringify(n.timeline), JSON.stringify(n.gabarit)],
      );
      return versMontage(rows[0]!);
    });
  }

  async creerVersion(n: { marqueId: string; utilisateurId: string; parentId: string; origine: 'edition' | 'gabarit'; timeline: Timeline; gabarit?: GabaritFige }): Promise<ResultatVersion> {
    try {
      return await dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
        const parent = await client.query<LigneMontage>(`SELECT ${COL_MONTAGE} FROM montages WHERE id = $1`, [n.parentId]);
        const p = parent.rows[0];
        if (p === undefined) return { etat: 'introuvable' } as const;
        // Sérialise les créations de versions d'une même série : le numéro suivant ne se calcule qu'une fois à la fois.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [p.serie_id]);
        const derniere = await client.query<{ numero: number }>('SELECT max(numero) AS numero FROM montages WHERE serie_id = $1', [p.serie_id]);
        const dernier = derniere.rows[0]?.numero ?? p.numero;
        if (dernier !== p.numero) return { etat: 'perimee', derniere: dernier } as const;
        const { rows } = await client.query<LigneMontage>(
          `INSERT INTO montages (id, marque_id, espace_id, script_id, serie_id, numero, parent_id, origine, film_fichier_id, timeline, gabarit)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb) RETURNING ${COL_MONTAGE}`,
          [n.marqueId, p.espace_id, p.script_id, p.serie_id, dernier + 1, p.id, n.origine, p.film_fichier_id, JSON.stringify(n.timeline), JSON.stringify(n.gabarit ?? p.gabarit)],
        );
        return { etat: 'ok', montage: versMontage(rows[0]!) } as const;
      });
    } catch (e) {
      if (estDoublon(e)) {
        const lu = await this.lire(n.marqueId, n.utilisateurId, n.parentId);
        return { etat: 'perimee', derniere: (lu?.numero ?? 0) + 1 };
      }
      throw e;
    }
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<Montage | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneMontage>(`SELECT ${COL_MONTAGE} FROM montages WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : versMontage(rows[0]);
    });
  }

  async listerSerie(marqueId: string, utilisateurId: string, serieId: string): Promise<Montage[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneMontage>(`SELECT ${COL_MONTAGE} FROM montages WHERE serie_id = $1 ORDER BY numero DESC`, [serieId]);
      return rows.map(versMontage);
    });
  }

  async listerDernieres(marqueId: string, utilisateurId: string, filtre: { scriptId?: string; limite?: number } = {}): Promise<Montage[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneMontage>(
        `SELECT ${COL_MONTAGE} FROM montages m
         WHERE ($1::uuid IS NULL OR m.script_id = $1::uuid)
           AND m.numero = (SELECT max(numero) FROM montages x WHERE x.serie_id = m.serie_id)
         ORDER BY m.cree_le DESC, m.id LIMIT $2`,
        [filtre.scriptId ?? null, Math.min(Math.max(filtre.limite ?? 50, 1), 200)],
      );
      return rows.map(versMontage);
    });
  }

  async ajouterFichier(marqueId: string, utilisateurId: string, espaceId: string, f: NouveauFichier): Promise<Fichier> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneFichier>(
        `INSERT INTO fichiers (id, marque_id, espace_id, genre, mime, octets, sha256, duree_ms, montage_id, scene_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${COL_FICHIER}`,
        [f.id, marqueId, espaceId, f.genre, f.mime, f.octets, f.sha256, f.dureeMs ?? null, f.montageId ?? null, f.sceneId ?? null],
      );
      return versFichier(rows[0]!);
    });
  }

  async lireFichier(marqueId: string, utilisateurId: string, id: string): Promise<Fichier | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneFichier>(`SELECT ${COL_FICHIER} FROM fichiers WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : versFichier(rows[0]);
    });
  }

  async listerVoix(marqueId: string, utilisateurId: string, montageId: string): Promise<Fichier[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneFichier>(
        `SELECT DISTINCT ON (scene_id) ${COL_FICHIER} FROM fichiers WHERE genre = 'voix' AND montage_id = $1 ORDER BY scene_id, cree_le DESC, id`,
        [montageId],
      );
      return rows.map(versFichier);
    });
  }

  async marquerPurge(marqueId: string, utilisateurId: string, id: string, quand: Date): Promise<boolean> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const r = await client.query('UPDATE fichiers SET purge_le = $2 WHERE id = $1 AND purge_le IS NULL', [id, quand]);
      return (r.rowCount ?? 0) > 0;
    });
  }

  async creerRendu(n: { marqueId: string; utilisateurId: string; montageId: string; genre: GenreRendu }): Promise<Rendu | undefined> {
    return dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
      const { rows } = await client.query<LigneRendu>(
        `INSERT INTO rendus (marque_id, espace_id, montage_id, genre, etat)
         SELECT m.marque_id, m.espace_id, m.id, $2, 'en_file' FROM montages m WHERE m.id = $1
         RETURNING ${COL_RENDU}`,
        [n.montageId, n.genre],
      );
      return rows[0] === undefined ? undefined : versRendu(rows[0]);
    });
  }

  async lierTache(marqueId: string, utilisateurId: string, renduId: string, tacheId: string): Promise<void> {
    await dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      await client.query('UPDATE rendus SET tache_id = $2 WHERE id = $1', [renduId, tacheId]);
    });
  }

  async lireRendu(marqueId: string, utilisateurId: string, id: string): Promise<Rendu | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneRendu>(`SELECT ${COL_RENDU} FROM rendus WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : versRendu(rows[0]);
    });
  }

  async lireRenduDeTache(marqueId: string, utilisateurId: string, tacheId: string): Promise<Rendu | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneRendu>(`SELECT ${COL_RENDU} FROM rendus WHERE tache_id = $1 ORDER BY cree_le DESC LIMIT 1`, [tacheId]);
      return rows[0] === undefined ? undefined : versRendu(rows[0]);
    });
  }

  async listerRendus(marqueId: string, utilisateurId: string, montageId: string): Promise<Rendu[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneRendu>(`SELECT ${COL_RENDU} FROM rendus WHERE montage_id = $1 ORDER BY cree_le DESC, id`, [montageId]);
      return rows.map(versRendu);
    });
  }

  async demarrerRendu(marqueId: string, utilisateurId: string, id: string): Promise<void> {
    await dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      await client.query("UPDATE rendus SET etat = 'en_cours' WHERE id = $1 AND etat IN ('en_file', 'en_cours')", [id]);
    });
  }

  async terminerRendu(marqueId: string, utilisateurId: string, id: string, fin: FinRendu): Promise<void> {
    await dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      await client.query(
        `UPDATE rendus SET etat = $2, fichier_id = $3, violations = $4::jsonb, cause = $5, termine_le = now() WHERE id = $1`,
        [id, fin.etat, fin.fichierId ?? null, JSON.stringify(fin.violations ?? []), fin.cause ?? null],
      );
    });
  }

  async bibliotheque(marqueId: string, utilisateurId: string, filtre: { espaceId?: string; limite?: number } = {}): Promise<EntreeBibliotheque[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneMontage & { archivee_le: Date | null }>(
        `SELECT ${COL_MONTAGE}, archivee_le FROM montages m
         WHERE ($1::uuid IS NULL OR m.espace_id = $1::uuid)
           AND m.numero = (SELECT max(numero) FROM montages x WHERE x.serie_id = m.serie_id)
         ORDER BY m.cree_le DESC, m.id LIMIT $2`,
        [filtre.espaceId ?? null, Math.min(Math.max(filtre.limite ?? 200, 1), 500)],
      );
      const rendus = rows.length === 0 ? [] : (await client.query<LigneRendu>(`SELECT ${COL_RENDU} FROM rendus WHERE montage_id = ANY($1::uuid[]) ORDER BY cree_le DESC, id`, [rows.map((r) => r.id)])).rows.map(versRendu);
      return rows.map((r) => ({ montage: versMontage(r), rendus: rendus.filter((x) => x.montageId === r.id), archiveeLe: r.archivee_le }));
    });
  }

  async archiver(marqueId: string, utilisateurId: string, serieId: string, archivee: boolean): Promise<boolean> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const r = await client.query('UPDATE montages SET archivee_le = CASE WHEN $2::boolean THEN coalesce(archivee_le, now()) ELSE NULL END WHERE serie_id = $1', [serieId, archivee]);
      return (r.rowCount ?? 0) > 0;
    });
  }

  async supprimerVideo(marqueId: string, utilisateurId: string, serieId: string): Promise<SuppressionVideo | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      // Même verrou que la création d'une version : pas de version ajoutée pendant la suppression.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [serieId]);
      const montages = await client.query<{ id: string; film_fichier_id: string }>('SELECT id, film_fichier_id FROM montages WHERE serie_id = $1', [serieId]);
      if (montages.rows.length === 0) return undefined;
      // Le contrôle de l'action peut dater : une publication a pu partir entre-temps.
      if (await publicationEnLigne(client, serieId)) throw new ErreurVideoPubliee();
      const ids = montages.rows.map((m) => m.id);
      const fichiers = new Map<string, string>();
      const noter = (rows: { id: string; espace_id: string }[]) => rows.forEach((f) => fichiers.set(f.id, f.espace_id));
      noter((await client.query<{ id: string; espace_id: string }>('SELECT id, espace_id FROM fichiers WHERE id = ANY($1::uuid[]) OR montage_id = ANY($2::uuid[]) OR id IN (SELECT fichier_id FROM rendus WHERE montage_id = ANY($2::uuid[]) AND fichier_id IS NOT NULL)', [montages.rows.map((m) => m.film_fichier_id), ids])).rows);
      await client.query('DELETE FROM rendus WHERE montage_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM legendes WHERE serie_id = $1', [serieId]);
      await client.query('DELETE FROM fichiers WHERE montage_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM montages WHERE serie_id = $1', [serieId]);
      await client.query('DELETE FROM fichiers WHERE id = ANY($1::uuid[])', [[...fichiers.keys()]]);
      await client.query("INSERT INTO suppressions (marque_id, utilisateur_id, genre, objet_id, fichiers) VALUES ($1, $2, 'video', $3, $4)", [marqueId, utilisateurId, serieId, fichiers.size]);
      return { fichiers: [...fichiers].map(([id, espaceId]) => ({ id, espaceId })) };
    });
  }

  async aPublicationPubliee(marqueId: string, utilisateurId: string, serieId: string): Promise<boolean> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, (client) => publicationEnLigne(client, serieId));
  }

  async lireLegende(marqueId: string, utilisateurId: string, serieId: string, reseau: string): Promise<LegendeEnregistree | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneLegende>('SELECT serie_id, reseau, legende, hashtags, maj_le FROM legendes WHERE serie_id = $1 AND reseau = $2', [serieId, reseau]);
      return rows[0] === undefined ? undefined : versLegende(rows[0]);
    });
  }

  async enregistrerLegende(n: { marqueId: string; utilisateurId: string; serieId: string; reseau: string; legende: string; hashtags: readonly string[] }): Promise<LegendeEnregistree | undefined> {
    return dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
      // L'espace vient de la série elle-même : la RLS des montages cache celles qui ne sont pas visibles.
      const serie = await client.query<{ espace_id: string }>('SELECT espace_id FROM montages WHERE serie_id = $1 LIMIT 1', [n.serieId]);
      if (serie.rows[0] === undefined) return undefined;
      const { rows } = await client.query<LigneLegende>(
        `INSERT INTO legendes (marque_id, espace_id, serie_id, reseau, legende, hashtags) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (marque_id, serie_id, reseau) DO UPDATE SET legende = EXCLUDED.legende, hashtags = EXCLUDED.hashtags, maj_le = now()
         RETURNING serie_id, reseau, legende, hashtags, maj_le`,
        [n.marqueId, serie.rows[0].espace_id, n.serieId, n.reseau, n.legende, JSON.stringify(n.hashtags)],
      );
      return versLegende(rows[0]!);
    });
  }
}
