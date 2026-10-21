// regie — notifications d'interface (histoire 2.6, FR-32). Les échecs d'étape sont créés par un déclencheur SQL dans la
// transaction de l'échec ; les autres événements (journal rompu) passent par `creer`. Une même clé ne donne jamais
// deux notifications. Les lectures sont toujours filtrées sur la personne.

import type { Pool } from 'pg';
import { dansTransactionMarque } from './base.ts';

export type Notification = Readonly<{
  id: string;
  marqueId: string;
  utilisateurId: string;
  genre: string;
  etape: string | undefined;
  tacheId: string | undefined;
  cause: string | undefined;
  action: string | undefined;
  creeLe: Date;
  acquitteeLe: Date | undefined;
}>;

export type NouvelleNotification = Readonly<{
  utilisateurId: string;
  genre: string;
  etape?: string | undefined;
  tacheId?: string | undefined;
  cause?: string | undefined;
  action?: string | undefined;
  /** Déduplication : la même clé n'est jamais créée deux fois dans une marque. */
  cle: string;
}>;

export interface Notifications {
  /** Crée la notification ; faux si la clé existait déjà. */
  creer(marqueId: string, n: NouvelleNotification): Promise<boolean>;
  lister(marqueId: string, utilisateurId: string, limite: number): Promise<Notification[]>;
  /** Acquitte une notification de la personne ; faux si elle n'existe pas, n'est pas à elle ou l'était déjà. */
  acquitter(marqueId: string, utilisateurId: string, id: string): Promise<boolean>;
}

type Ligne = {
  id: string; marque_id: string; utilisateur_id: string; genre: string; etape: string | null; tache_id: string | null;
  cause: string | null; action: string | null; cree_le: Date; acquittee_le: Date | null;
};

const versNotification = (r: Ligne): Notification => ({
  id: r.id, marqueId: r.marque_id, utilisateurId: r.utilisateur_id, genre: r.genre, etape: r.etape ?? undefined, tacheId: r.tache_id ?? undefined,
  cause: r.cause ?? undefined, action: r.action ?? undefined, creeLe: r.cree_le, acquitteeLe: r.acquittee_le ?? undefined,
});

export class NotificationsPg implements Notifications {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async creer(marqueId: string, n: NouvelleNotification): Promise<boolean> {
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rowCount } = await c.query(
        `INSERT INTO notifications (marque_id, utilisateur_id, genre, etape, tache_id, cause, action, cle)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (marque_id, cle) DO NOTHING`,
        [marqueId, n.utilisateurId, n.genre, n.etape ?? null, n.tacheId ?? null, n.cause ?? null, n.action ?? null, n.cle],
      );
      return rowCount === 1;
    });
  }

  async lister(marqueId: string, utilisateurId: string, limite: number): Promise<Notification[]> {
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rows } = await c.query<Ligne>('SELECT * FROM notifications WHERE utilisateur_id = $1 ORDER BY cree_le DESC, id LIMIT $2', [utilisateurId, limite]);
      return rows.map(versNotification);
    });
  }

  async acquitter(marqueId: string, utilisateurId: string, id: string): Promise<boolean> {
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rowCount } = await c.query('UPDATE notifications SET acquittee_le = now() WHERE id = $1 AND utilisateur_id = $2 AND acquittee_le IS NULL', [id, utilisateurId]);
      return rowCount === 1;
    });
  }
}
