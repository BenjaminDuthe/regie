// regie — publications sur les réseaux (histoires 7.3 à 7.5). Une publication fige le montage, le rendu et la légende au
// moment de la demande. Tout passe par `dansTransactionUtilisateur` : la RLS cloisonne par marque et par espace visible.
// Les passages d'état sont des compare-and-set (UPDATE … WHERE etat = …) : deux exécutions de la même tâche ne peuvent
// pas toutes les deux franchir `en_file -> envoi_en_cours`, donc jamais deux envois. Aucun jeton ici.

import type { ClientBase, Pool } from 'pg';
import type { Reseau } from '../domaine/bornes.ts';
import type { EtatPublication, IssueTentative, OrigineTentative } from '../domaine/publication.ts';
import { dansTransactionMarque, dansTransactionUtilisateur } from './base.ts';

export type Publication = Readonly<{
  id: string;
  espaceId: string;
  utilisateurId: string;
  compteId: string;
  reseau: Reseau;
  serieId: string;
  montageId: string;
  renduId: string;
  legende: string;
  hashtags: readonly string[];
  etat: EtatPublication;
  cleIdempotence: string;
  tacheId: string | null;
  programmeePour: Date | null;
  idExterne: string | null;
  lien: string | null;
  cause: string | null;
  action: string | null;
  tentatives: number;
  creeLe: Date;
  modifieLe: Date;
  publieeLe: Date | null;
}>;

export type TentativePublication = Readonly<{
  numero: number;
  origine: OrigineTentative;
  utilisateurId: string;
  pat: string | null;
  tacheId: string | null;
  debut: Date;
  fin: Date | null;
  issue: IssueTentative;
  cause: string | null;
}>;

export type NouvellePublication = Readonly<{
  marqueId: string;
  utilisateurId: string;
  espaceId: string;
  compteId: string;
  reseau: Reseau;
  serieId: string;
  montageId: string;
  renduId: string;
  legende: string;
  hashtags: readonly string[];
  /** `en_file` (publier maintenant) ou `programmee` (histoire 7.4, avec `programmeePour`). */
  etat: 'en_file' | 'programmee';
  programmeePour?: Date | undefined;
}>;

export type ResultatCreation =
  | Readonly<{ etat: 'ok'; publication: Publication }>
  | Readonly<{ etat: 'existe'; id: string }>
  | Readonly<{ etat: 'introuvable' }>;

export type QuiTente = Readonly<{ origine: OrigineTentative; pat: string | null }>;

export type FinPublication =
  | Readonly<{ etat: 'publiee'; idExterne: string; lien: string }>
  | Readonly<{ etat: 'en_echec' | 'incertaine'; cause: string; action: string }>;

export type FiltrePublications = Readonly<{ espaceId?: string | undefined; serieId?: string | undefined; reseau?: Reseau | undefined; etat?: EtatPublication | undefined; limite?: number | undefined }>;

export interface Publications {
  /** Insère la publication. `existe` si la vidéo a déjà une publication non annulée sur ce compte ; `introuvable` si l'espace, le montage ou le compte n'existent pas pour cette personne. */
  creer(n: NouvellePublication): Promise<ResultatCreation>;
  lire(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined>;
  lister(marqueId: string, utilisateurId: string, filtre?: FiltrePublications): Promise<Publication[]>;
  tentatives(marqueId: string, utilisateurId: string, id: string): Promise<TentativePublication[]>;
  lierTache(marqueId: string, utilisateurId: string, id: string, tacheId: string): Promise<void>;
  /** Compare-and-set `en_file -> envoi_en_cours` pour la tâche donnée, et ouvre la tentative. Rend son numéro, ou `undefined` si l'état n'était plus `en_file` ou si la tâche n'est plus celle de la publication. */
  demarrerEnvoi(marqueId: string, utilisateurId: string, id: string, tacheId: string, qui: QuiTente): Promise<number | undefined>;
  /** Refus constaté AVANT tout envoi : `en_file -> en_echec`, avec une tentative inscrite pour l'historique. */
  echouerAvantEnvoi(marqueId: string, utilisateurId: string, id: string, tacheId: string, qui: QuiTente, cause: string, action: string): Promise<Publication | undefined>;
  /** Compare-and-set `envoi_en_cours ->` publiée, en échec ou incertaine, et ferme la tentative. `undefined` si l'état n'était plus `envoi_en_cours`. */
  conclure(marqueId: string, utilisateurId: string, id: string, fin: FinPublication): Promise<Publication | undefined>;
  /** `en_echec -> en_file` avec une nouvelle clé d'idempotence ; la tâche suit par `lierTache`. `undefined` si l'état n'était pas `en_echec`. */
  rejouer(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined>;
  /** Annule une publication qui n'est pas partie (voir `peutAnnuler`). `undefined` si l'état ne le permet pas. */
  annuler(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined>;
  /** Vrai si le fichier est celui d'une publication en cours d'envoi : seule condition pour le servir à `/v/publication/…`. */
  fichierEnEnvoi(marqueId: string, utilisateurId: string, fichierId: string): Promise<boolean>;
  /** Rattrape une publication dont la tâche s'est terminée (ou a échoué) sans que l'exécutant ait pu écrire. */
  rattraper(marqueId: string, utilisateurId: string, tacheId: string, issue: Readonly<{ terminee: true; idExterne: string; lien: string } | { terminee: false; cause: string }>): Promise<Publication | undefined>;
}

type Ligne = {
  id: string; espace_id: string; utilisateur_id: string; compte_id: string; reseau: Reseau; serie_id: string; montage_id: string; rendu_id: string;
  legende: string; hashtags: string[]; etat: EtatPublication; cle_idempotence: string; tache_id: string | null; programmee_pour: Date | null;
  id_externe: string | null; lien: string | null; cause: string | null; action: string | null; tentatives: number; cree_le: Date; modifie_le: Date; publiee_le: Date | null;
};
const COLONNES = 'id, espace_id, utilisateur_id, compte_id, reseau, serie_id, montage_id, rendu_id, legende, hashtags, etat, cle_idempotence, tache_id, programmee_pour, id_externe, lien, cause, action, tentatives, cree_le, modifie_le, publiee_le';
export const versPublication = (l: Ligne): Publication => ({
  id: l.id, espaceId: l.espace_id, utilisateurId: l.utilisateur_id, compteId: l.compte_id, reseau: l.reseau, serieId: l.serie_id, montageId: l.montage_id, renduId: l.rendu_id,
  legende: l.legende, hashtags: l.hashtags, etat: l.etat, cleIdempotence: l.cle_idempotence, tacheId: l.tache_id, programmeePour: l.programmee_pour,
  idExterne: l.id_externe, lien: l.lien, cause: l.cause, action: l.action, tentatives: l.tentatives, creeLe: l.cree_le, modifieLe: l.modifie_le, publieeLe: l.publiee_le,
});

type LigneTentative = { numero: number; origine: OrigineTentative; utilisateur_id: string; pat: string | null; tache_id: string | null; debut: Date; fin: Date | null; issue: IssueTentative; cause: string | null };

async function ouvrirTentative(client: ClientBase, marqueId: string, p: Ligne, tacheId: string, qui: QuiTente, utilisateurId: string, issue: IssueTentative, cause: string | null): Promise<void> {
  await client.query(
    `INSERT INTO publication_tentatives (marque_id, espace_id, publication_id, numero, origine, utilisateur_id, pat, tache_id, issue, cause, fin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $9 = 'en_cours' THEN NULL ELSE now() END)`,
    [marqueId, p.espace_id, p.id, p.tentatives, qui.origine, utilisateurId, qui.pat, tacheId, issue, cause],
  );
}

export class PublicationsPg implements Publications {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async creer(n: NouvellePublication): Promise<ResultatCreation> {
    return dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
      // Le point de sauvegarde garde la transaction utilisable après un conflit d'unicité.
      await client.query('SAVEPOINT creation');
      try {
        const { rows } = await client.query<Ligne>(
          `INSERT INTO publications (marque_id, espace_id, utilisateur_id, compte_id, reseau, serie_id, montage_id, rendu_id, legende, hashtags, etat, programmee_pour)
           SELECT e.marque_id, e.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 FROM espaces e WHERE e.id = $1
           RETURNING ${COLONNES}`,
          [n.espaceId, n.utilisateurId, n.compteId, n.reseau, n.serieId, n.montageId, n.renduId, n.legende, n.hashtags, n.etat, n.programmeePour ?? null],
        );
        return rows[0] === undefined ? { etat: 'introuvable' } : { etat: 'ok', publication: versPublication(rows[0]) };
      } catch (erreur) {
        const code = (erreur as { code?: string }).code;
        if (code !== '23505' && code !== '23503') throw erreur;
        await client.query('ROLLBACK TO SAVEPOINT creation');
        if (code === '23503') return { etat: 'introuvable' };
        const existante = await client.query<{ id: string }>("SELECT id FROM publications WHERE compte_id = $1 AND serie_id = $2 AND etat <> 'annulee'", [n.compteId, n.serieId]);
        return existante.rows[0] === undefined ? { etat: 'introuvable' } : { etat: 'existe', id: existante.rows[0].id };
      }
    });
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM publications WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : versPublication(rows[0]);
    });
  }

  async lister(marqueId: string, utilisateurId: string, filtre: FiltrePublications = {}): Promise<Publication[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `SELECT ${COLONNES} FROM publications
         WHERE ($1::uuid IS NULL OR espace_id = $1::uuid) AND ($2::uuid IS NULL OR serie_id = $2::uuid) AND ($3::text IS NULL OR reseau = $3::text) AND ($4::text IS NULL OR etat = $4::text)
         ORDER BY cree_le DESC, id LIMIT $5`,
        [filtre.espaceId ?? null, filtre.serieId ?? null, filtre.reseau ?? null, filtre.etat ?? null, Math.min(filtre.limite ?? 200, 500)],
      );
      return rows.map(versPublication);
    });
  }

  async tentatives(marqueId: string, utilisateurId: string, id: string): Promise<TentativePublication[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<LigneTentative>('SELECT numero, origine, utilisateur_id, pat, tache_id, debut, fin, issue, cause FROM publication_tentatives WHERE publication_id = $1 ORDER BY numero', [id]);
      return rows.map((l) => ({ numero: l.numero, origine: l.origine, utilisateurId: l.utilisateur_id, pat: l.pat, tacheId: l.tache_id, debut: l.debut, fin: l.fin, issue: l.issue, cause: l.cause }));
    });
  }

  async lierTache(marqueId: string, utilisateurId: string, id: string, tacheId: string): Promise<void> {
    await dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      await client.query("UPDATE publications SET tache_id = $2, modifie_le = now() WHERE id = $1 AND etat IN ('en_file', 'programmee', 'en_attente_confirmation')", [id, tacheId]);
    });
  }

  async demarrerEnvoi(marqueId: string, utilisateurId: string, id: string, tacheId: string, qui: QuiTente): Promise<number | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `UPDATE publications SET etat = 'envoi_en_cours', tentatives = tentatives + 1, cause = NULL, action = NULL, modifie_le = now()
         WHERE id = $1 AND tache_id = $2 AND etat = 'en_file' RETURNING ${COLONNES}`,
        [id, tacheId],
      );
      const p = rows[0];
      if (p === undefined) return undefined;
      await ouvrirTentative(client, marqueId, p, tacheId, qui, utilisateurId, 'en_cours', null);
      return p.tentatives;
    });
  }

  async echouerAvantEnvoi(marqueId: string, utilisateurId: string, id: string, tacheId: string, qui: QuiTente, cause: string, action: string): Promise<Publication | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `UPDATE publications SET etat = 'en_echec', tentatives = tentatives + 1, cause = $3, action = $4, modifie_le = now()
         WHERE id = $1 AND tache_id = $2 AND etat = 'en_file' RETURNING ${COLONNES}`,
        [id, tacheId, cause, action],
      );
      const p = rows[0];
      if (p === undefined) return undefined;
      await ouvrirTentative(client, marqueId, p, tacheId, qui, utilisateurId, 'en_echec', cause);
      return versPublication(p);
    });
  }

  async conclure(marqueId: string, utilisateurId: string, id: string, fin: FinPublication): Promise<Publication | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } =
        fin.etat === 'publiee'
          ? await client.query<Ligne>(
              `UPDATE publications SET etat = 'publiee', id_externe = $2, lien = $3, publiee_le = now(), cause = NULL, action = NULL, modifie_le = now()
               WHERE id = $1 AND etat = 'envoi_en_cours' RETURNING ${COLONNES}`,
              [id, fin.idExterne, fin.lien],
            )
          : await client.query<Ligne>(
              `UPDATE publications SET etat = $2, cause = $3, action = $4, modifie_le = now()
               WHERE id = $1 AND etat = 'envoi_en_cours' RETURNING ${COLONNES}`,
              [id, fin.etat, fin.cause, fin.action],
            );
      const p = rows[0];
      if (p === undefined) return undefined;
      await client.query('UPDATE publication_tentatives SET fin = now(), issue = $3, cause = $4 WHERE publication_id = $1 AND numero = $2', [id, p.tentatives, fin.etat, fin.etat === 'publiee' ? null : fin.cause]);
      return versPublication(p);
    });
  }

  async rejouer(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `UPDATE publications SET etat = 'en_file', cle_idempotence = gen_random_uuid(), tache_id = NULL, cause = NULL, action = NULL, modifie_le = now()
         WHERE id = $1 AND etat = 'en_echec' RETURNING ${COLONNES}`,
        [id],
      );
      return rows[0] === undefined ? undefined : versPublication(rows[0]);
    });
  }

  async annuler(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `UPDATE publications SET etat = 'annulee', cause = NULL, action = NULL, modifie_le = now()
         WHERE id = $1 AND etat IN ('en_file', 'programmee', 'en_attente_confirmation', 'en_echec') RETURNING ${COLONNES}`,
        [id],
      );
      return rows[0] === undefined ? undefined : versPublication(rows[0]);
    });
  }

  async fichierEnEnvoi(marqueId: string, utilisateurId: string, fichierId: string): Promise<boolean> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query("SELECT 1 FROM publications p JOIN rendus r ON r.id = p.rendu_id WHERE r.fichier_id = $1 AND p.etat = 'envoi_en_cours' LIMIT 1", [fichierId]);
      return rows.length > 0;
    });
  }

  async rattraper(marqueId: string, utilisateurId: string, tacheId: string, issue: Readonly<{ terminee: true; idExterne: string; lien: string } | { terminee: false; cause: string }>): Promise<Publication | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = issue.terminee
        ? await client.query<Ligne>(
            `UPDATE publications SET etat = 'publiee', id_externe = $2, lien = $3, publiee_le = now(), cause = NULL, action = NULL, modifie_le = now()
             WHERE tache_id = $1 AND etat = 'envoi_en_cours' RETURNING ${COLONNES}`,
            [tacheId, issue.idExterne, issue.lien],
          )
        : await client.query<Ligne>(
            // Rien n'est parti tant que la publication est `en_file` ; après `envoi_en_cours`, on ne sait plus.
            `UPDATE publications SET etat = CASE WHEN etat = 'en_file' THEN 'en_echec' ELSE 'incertaine' END,
                    cause = CASE WHEN etat = 'en_file' THEN $2 ELSE 'RESULTAT_INCONNU' END,
                    action = CASE WHEN etat = 'en_file' THEN 'relancer' ELSE 'verifier' END, modifie_le = now()
             WHERE tache_id = $1 AND etat IN ('en_file', 'envoi_en_cours') RETURNING ${COLONNES}`,
            [tacheId, issue.cause],
          );
      const p = rows[0];
      if (p === undefined) return undefined;
      if (p.tentatives > 0) {
        await client.query(
          "UPDATE publication_tentatives SET fin = coalesce(fin, now()), issue = $3, cause = $4 WHERE publication_id = $1 AND numero = $2 AND issue = 'en_cours'",
          [p.id, p.tentatives, p.etat, p.etat === 'publiee' ? null : p.cause],
        );
      }
      return versPublication(p);
    });
  }
}

/** Les tâches `reseau` finies depuis `depuis`, vues sans personne (la file est cloisonnée par marque seule). */
export type TacheReseauFinie = Readonly<{ id: string; utilisateurId: string; etat: 'terminee' | 'echouee'; resultat: unknown; cause: string | null }>;

export async function tachesReseauFinies(pool: Pool, marqueId: string, depuis: Date): Promise<TacheReseauFinie[]> {
  return dansTransactionMarque(pool, marqueId, async (client) => {
    const { rows } = await client.query<{ id: string; utilisateur_id: string; etat: 'terminee' | 'echouee'; resultat: unknown; cause: string | null }>(
      "SELECT id, utilisateur_id, etat, resultat, cause FROM taches WHERE type = 'reseau' AND etat IN ('terminee', 'echouee') AND cree_le >= $1 ORDER BY cree_le",
      [depuis],
    );
    return rows.map((r) => ({ id: r.id, utilisateurId: r.utilisateur_id, etat: r.etat, resultat: r.resultat, cause: r.cause }));
  });
}
