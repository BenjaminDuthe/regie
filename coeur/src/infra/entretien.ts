// regie — ménage nocturne en base (histoire 2.2). Même règles que le ménage opportuniste d'`oauth.ts` et de `sessions.ts` :
// la nuit le fait pour toutes les marques, sans attendre qu'une personne se connecte.

import type { Pool } from 'pg';
import { dansTransactionMarque } from './base.ts';
import { CLIENT_INUTILISE_VIE_S } from './oauth.ts';

/** Supprime les sessions expirées ou révoquées depuis plus d'un jour ; rend leur nombre. */
export async function purgerSessions(pool: Pool, marqueId: string): Promise<number> {
  return dansTransactionMarque(pool, marqueId, async (c) => {
    const r = await c.query("DELETE FROM sessions WHERE expire_le < now() - interval '1 day' OR revoquee_le < now() - interval '1 day'");
    return r.rowCount ?? 0;
  });
}

/** Supprime les clients OAuth jamais utilisés (ni code ni connexion) au-delà de leur durée de vie, et les codes périmés. */
export async function purgerClientsOauth(pool: Pool, marqueId: string): Promise<number> {
  return dansTransactionMarque(pool, marqueId, async (c) => {
    await c.query("DELETE FROM oauth_codes WHERE expire_le < now() - interval '1 day'");
    const r = await c.query(
      `DELETE FROM oauth_clients k WHERE k.cree_le < now() - make_interval(secs => $1)
         AND NOT EXISTS (SELECT 1 FROM oauth_connexions x WHERE x.client_id = k.client_id)
         AND NOT EXISTS (SELECT 1 FROM oauth_codes x WHERE x.client_id = k.client_id)`,
      [CLIENT_INUTILISE_VIE_S],
    );
    return r.rowCount ?? 0;
  });
}
