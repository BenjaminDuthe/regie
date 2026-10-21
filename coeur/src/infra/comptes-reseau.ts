// regie — comptes reliés aux réseaux de publication (histoire 7.6, FR-41, AR-22). Le JETON du compte vit UNIQUEMENT au
// coffre (type `jeton_reseau`, nom `compte:<id>`) : la table ne garde que l'état, l'échéance et la personne à prévenir.
// Les rappels d'échéance (J-7 et la veille) sont inscrits dans la même transaction que la connexion : si elle échoue,
// aucun rappel ne reste ; si elle réussit, ils existent même si le serveur tombe aussitôt.

import type { Pool } from 'pg';
import type { Reseau } from '../domaine/bornes.ts';
import type { Coffre } from './coffre.ts';
import { dansTransactionUtilisateur, lireSecretParNom, remplacerSecret, supprimerSecret } from './base.ts';
import { inscrireEcheance } from './echeances.ts';

export const TYPE_SECRET_JETON_RESEAU = 'jeton_reseau';
export const nomSecretJeton = (compteId: string): string => `compte:${compteId}`;

/** Quand on prévient avant l'échéance du jeton : sept jours, puis la veille. */
export const RAPPELS_CONNEXION = Object.freeze([
  { suffixe: 'j7', avantMs: 7 * 86_400_000 },
  { suffixe: 'j1', avantMs: 86_400_000 },
] as const);

export type EtatCompte = 'connecte' | 'deconnecte';

export type CompteReseau = Readonly<{
  id: string;
  espaceId: string;
  utilisateurId: string;
  reseau: Reseau;
  compteExterne: string;
  nom: string;
  etat: EtatCompte;
  expireLe: Date;
  creeLe: Date;
  modifieLe: Date;
}>;

export type NouveauCompte = Readonly<{
  marqueId: string;
  utilisateurId: string;
  espaceId: string;
  reseau: Reseau;
  compteExterne: string;
  nom: string;
  /** Le jeton long : il part au coffre, nulle part ailleurs. */
  jeton: string;
  expireLe: Date;
}>;

/** Les rappels à inscrire pour une échéance : tout instant déjà passé est écarté. */
export function rappelsDu(compteId: string, utilisateurId: string, expireLe: Date, maintenant: Date): { type: 'rappel_connexion'; objet: string; instant: Date; cle: string }[] {
  const epoch = Math.floor(expireLe.getTime() / 1000);
  return RAPPELS_CONNEXION.map((r) => ({
    type: 'rappel_connexion' as const,
    objet: `${compteId}:${utilisateurId}:${epoch}:${r.suffixe}`,
    instant: new Date(expireLe.getTime() - r.avantMs),
    cle: `${compteId}:${epoch}:${r.suffixe}`,
  })).filter((r) => r.instant.getTime() > maintenant.getTime());
}

/** Décode l'objet d'un rappel de connexion ; `undefined` si la forme n'est pas la bonne. */
export function lireObjetRappel(objet: string): { compteId: string; utilisateurId: string; expireEpoch: number; suffixe: string } | undefined {
  const m = /^([0-9a-f-]{36}):([0-9a-f-]{36}):(\d{1,12}):(j7|j1)$/.exec(objet);
  return m === null ? undefined : { compteId: m[1]!, utilisateurId: m[2]!, expireEpoch: Number(m[3]), suffixe: m[4]! };
}

export interface ComptesReseau {
  /**
   * Relie (ou reconnecte) un compte : met à jour la ligne, range le jeton au coffre et inscrit les rappels. `undefined`
   * si l'espace n'existe pas pour cette personne. Un compte déjà relié est mis à jour, jamais dupliqué.
   */
  connecter(n: NouveauCompte, maintenant: Date): Promise<CompteReseau | undefined>;
  lister(marqueId: string, utilisateurId: string, espaceId?: string): Promise<CompteReseau[]>;
  lire(marqueId: string, utilisateurId: string, id: string): Promise<CompteReseau | undefined>;
  /** Réservé au connecteur et à la publication : aucune action ne rend ce résultat. */
  lireJeton(marqueId: string, compteId: string): Promise<string | undefined>;
  /** Passe le compte à `deconnecte` et retire le jeton du coffre. `undefined` si le compte n'existe pas pour cette personne. */
  deconnecter(marqueId: string, utilisateurId: string, id: string): Promise<CompteReseau | undefined>;
}

type Ligne = {
  id: string; espace_id: string; utilisateur_id: string; reseau: Reseau; compte_externe: string; nom: string;
  etat: EtatCompte; expire_le: Date; cree_le: Date; modifie_le: Date;
};
const COLONNES = 'id, espace_id, utilisateur_id, reseau, compte_externe, nom, etat, expire_le, cree_le, modifie_le';
const versCompte = (l: Ligne): CompteReseau => ({
  id: l.id, espaceId: l.espace_id, utilisateurId: l.utilisateur_id, reseau: l.reseau, compteExterne: l.compte_externe, nom: l.nom,
  etat: l.etat, expireLe: l.expire_le, creeLe: l.cree_le, modifieLe: l.modifie_le,
});

export class ComptesReseauPg implements ComptesReseau {
  readonly #pool: Pool;
  readonly #coffre: Coffre;

  constructor(pool: Pool, coffre: Coffre) {
    this.#pool = pool;
    this.#coffre = coffre;
  }

  async connecter(n: NouveauCompte, maintenant: Date): Promise<CompteReseau | undefined> {
    const compte = await dansTransactionUtilisateur(this.#pool, n.marqueId, n.utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `INSERT INTO comptes_reseau (marque_id, espace_id, utilisateur_id, reseau, compte_externe, nom, expire_le)
         SELECT e.marque_id, e.id, $2, $3, $4, $5, $6 FROM espaces e WHERE e.id = $1
         ON CONFLICT (espace_id, reseau, compte_externe)
         DO UPDATE SET utilisateur_id = EXCLUDED.utilisateur_id, nom = EXCLUDED.nom, etat = 'connecte', expire_le = EXCLUDED.expire_le, modifie_le = now()
         RETURNING ${COLONNES}`,
        [n.espaceId, n.utilisateurId, n.reseau, n.compteExterne, n.nom, n.expireLe],
      );
      const ligne = rows[0];
      if (ligne === undefined) return undefined;
      for (const r of rappelsDu(ligne.id, n.utilisateurId, n.expireLe, maintenant)) await inscrireEcheance(client, n.marqueId, r);
      return versCompte(ligne);
    });
    if (compte === undefined) return undefined;
    await remplacerSecret(this.#pool, this.#coffre, { marqueId: n.marqueId, type: TYPE_SECRET_JETON_RESEAU, nom: nomSecretJeton(compte.id), clair: n.jeton });
    return compte;
  }

  async lister(marqueId: string, utilisateurId: string, espaceId?: string): Promise<CompteReseau[]> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM comptes_reseau WHERE ($1::uuid IS NULL OR espace_id = $1::uuid) ORDER BY cree_le, id`, [espaceId ?? null]);
      return rows.map(versCompte);
    });
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<CompteReseau | undefined> {
    return dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`SELECT ${COLONNES} FROM comptes_reseau WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : versCompte(rows[0]);
    });
  }

  async lireJeton(marqueId: string, compteId: string): Promise<string | undefined> {
    return lireSecretParNom(this.#pool, this.#coffre, marqueId, TYPE_SECRET_JETON_RESEAU, nomSecretJeton(compteId));
  }

  async deconnecter(marqueId: string, utilisateurId: string, id: string): Promise<CompteReseau | undefined> {
    const compte = await dansTransactionUtilisateur(this.#pool, marqueId, utilisateurId, async (client) => {
      const { rows } = await client.query<Ligne>(`UPDATE comptes_reseau SET etat = 'deconnecte', modifie_le = now() WHERE id = $1 RETURNING ${COLONNES}`, [id]);
      return rows[0] === undefined ? undefined : versCompte(rows[0]);
    });
    if (compte !== undefined) await supprimerSecret(this.#pool, marqueId, TYPE_SECRET_JETON_RESEAU, nomSecretJeton(compte.id));
    return compte;
  }
}
