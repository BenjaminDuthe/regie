// regie — échéances et travaux internes en base (histoire 2.2, AR-22). Chaque appel passe par une transaction de marque.

import type { ClientBase, Pool } from 'pg';
import { dansTransactionMarque } from './base.ts';

export type Echeance = Readonly<{ id: string; marqueId: string; type: string; objet: string; instant: Date; cle: string | undefined; etat: string; cause: string | undefined }>;
export type TravailInterne = Readonly<{ id: string; marqueId: string; echeanceId: string; type: string; objet: string; etat: string; tentatives: number; cause: string | undefined }>;

export type Decision = 'declencher' | 'echouer';

/** Bail d'un travail interne pris : au-delà, un autre passage peut le reprendre (ils sont rejouables). */
export const BAIL_TRAVAIL_S = 300;

type LigneEcheance = { id: string; marque_id: string; type: string; objet: string; instant: Date; cle: string | null; etat: string; cause: string | null };
const versEcheance = (l: LigneEcheance): Echeance => ({ id: l.id, marqueId: l.marque_id, type: l.type, objet: l.objet, instant: l.instant, cle: l.cle ?? undefined, etat: l.etat, cause: l.cause ?? undefined });
type LigneTravail = { id: string; marque_id: string; echeance_id: string; type: string; objet: string; etat: string; tentatives: number; cause: string | null };
const versTravail = (l: LigneTravail): TravailInterne => ({ id: l.id, marqueId: l.marque_id, echeanceId: l.echeance_id, type: l.type, objet: l.objet, etat: l.etat, tentatives: l.tentatives, cause: l.cause ?? undefined });

/**
 * Inscrit une échéance dans la transaction de l'appelant (la même que l'action métier). Avec une `cle` déjà inscrite,
 * ne fait rien et rend `undefined`.
 */
export async function inscrireEcheance(
  client: ClientBase,
  marqueId: string,
  echeance: Readonly<{ type: string; objet: string; instant: Date; cle?: string }>,
): Promise<string | undefined> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO echeances (marque_id, type, objet, instant, cle) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (marque_id, type, cle) WHERE cle IS NOT NULL DO NOTHING RETURNING id`,
    [marqueId, echeance.type, echeance.objet, echeance.instant, echeance.cle ?? null],
  );
  return rows[0]?.id;
}

export class EcheancesPg {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  /**
   * Déclenche les échéances dues : un travail interne chacune (une seule fois), ou un échec avec sa cause quand la règle
   * de son type le veut. `decider` rend la décision ; elle est prise dans la transaction qui verrouille la ligne.
   */
  async declencher(marqueId: string, maintenant: Date, decider: (e: Echeance) => Decision): Promise<{ declenchees: number; echouees: number }> {
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rows } = await c.query<LigneEcheance>(
        `SELECT id, marque_id, type, objet, instant, cle, etat, cause FROM echeances
          WHERE etat = 'programmee' AND instant <= $1 ORDER BY instant LIMIT 200 FOR UPDATE SKIP LOCKED`,
        [maintenant],
      );
      let declenchees = 0;
      let echouees = 0;
      for (const ligne of rows) {
        const e = versEcheance(ligne);
        if (decider(e) === 'echouer') {
          await c.query("UPDATE echeances SET etat = 'echouee', cause = 'ECHEANCE_PERIMEE', declenchee_le = $2 WHERE id = $1", [e.id, maintenant]);
          echouees += 1;
        } else {
          await c.query('INSERT INTO travaux_internes (marque_id, echeance_id, type, objet) VALUES ($1, $2, $3, $4) ON CONFLICT (echeance_id) DO NOTHING', [marqueId, e.id, e.type, e.objet]);
          await c.query("UPDATE echeances SET etat = 'declenchee', declenchee_le = $2 WHERE id = $1", [e.id, maintenant]);
          declenchees += 1;
        }
      }
      return { declenchees, echouees };
    });
  }

  /** Prend un travail prêt (ou dont le bail a expiré) parmi les types qu'on sait faire. */
  async prendreTravail(marqueId: string, types: readonly string[], maintenant: Date): Promise<TravailInterne | undefined> {
    if (types.length === 0) return undefined;
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rows } = await c.query<LigneTravail>(
        `UPDATE travaux_internes SET etat = 'en_cours', tentatives = tentatives + 1, bail_jusqua = $2::timestamptz + make_interval(secs => $3)
          WHERE id = (SELECT id FROM travaux_internes
                       WHERE type = ANY($1) AND (etat = 'pret' OR (etat = 'en_cours' AND bail_jusqua < $2))
                       ORDER BY cree_le LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING id, marque_id, echeance_id, type, objet, etat, tentatives, cause`,
        [types, maintenant, BAIL_TRAVAIL_S],
      );
      return rows[0] === undefined ? undefined : versTravail(rows[0]);
    });
  }

  async terminerTravail(marqueId: string, id: string, maintenant: Date): Promise<void> {
    await dansTransactionMarque(this.#pool, marqueId, (c) =>
      c.query("UPDATE travaux_internes SET etat = 'termine', bail_jusqua = NULL, termine_le = $2 WHERE id = $1 AND etat = 'en_cours'", [id, maintenant]),
    );
  }

  async echouerTravail(marqueId: string, id: string, cause: string, maintenant: Date): Promise<void> {
    await dansTransactionMarque(this.#pool, marqueId, (c) =>
      c.query("UPDATE travaux_internes SET etat = 'echoue', cause = $2, bail_jusqua = NULL, termine_le = $3 WHERE id = $1 AND etat = 'en_cours'", [id, cause, maintenant]),
    );
  }

  async lister(marqueId: string, limite: number): Promise<{ echeances: Echeance[]; travaux: TravailInterne[] }> {
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const e = await c.query<LigneEcheance>('SELECT id, marque_id, type, objet, instant, cle, etat, cause FROM echeances ORDER BY instant DESC LIMIT $1', [limite]);
      const t = await c.query<LigneTravail>('SELECT id, marque_id, echeance_id, type, objet, etat, tentatives, cause FROM travaux_internes ORDER BY cree_le DESC LIMIT $1', [limite]);
      return { echeances: e.rows.map(versEcheance), travaux: t.rows.map(versTravail) };
    });
  }

  /** Inscrit une échéance dans sa propre transaction (pour le planificateur ; les actions métier utilisent `inscrireEcheance`). */
  async inscrire(marqueId: string, echeance: Readonly<{ type: string; objet: string; instant: Date; cle?: string }>): Promise<string | undefined> {
    return dansTransactionMarque(this.#pool, marqueId, (c) => inscrireEcheance(c, marqueId, echeance));
  }
}
