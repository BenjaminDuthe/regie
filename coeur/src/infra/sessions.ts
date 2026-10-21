// regie — sessions en base (histoire 1.14, FR-72).
// L'identifiant de session fait 32 octets aléatoires ; seul son SHA-256 est stocké, jamais l'identifiant.
// Le cookie porte `<marque_id>.<identifiant>` : la marque n'est pas un secret, et elle permet de retrouver la
// ligne sous la RLS (aucune variable de session ne l'élargit). Une session expire et se révoque.

import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { dansTransactionMarque } from './base.ts';

/** Durée absolue d'une session. Les actions sensibles redemandent Authentik bien avant (auth récente 10 min). */
export const DUREE_SESSION_MS = 7 * 24 * 3600_000;

export type Session = Readonly<{
  marqueId: string;
  sub: string;
  email: string | undefined;
  /** Dernière authentification réelle auprès d'Authentik. */
  authentifieLe: Date;
  expireLe: Date;
}>;

export type NouvelleSession = Readonly<{
  marqueId: string;
  sub: string;
  email: string | undefined;
  authentifieLe: Date;
}>;

export interface MagasinSessions {
  /** Crée la session et rend la valeur du cookie. */
  creer(nouvelle: NouvelleSession): Promise<string>;
  /** Rend la session si la valeur du cookie désigne une session ni expirée ni révoquée. */
  trouver(valeurCookie: string): Promise<Session | undefined>;
  /** Révoque la session désignée ; rend vrai si une session valide a été révoquée. */
  revoquer(valeurCookie: string): Promise<boolean>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IDENTIFIANT = /^[A-Za-z0-9_-]{43}$/;

export function nouvelIdentifiant(): string {
  return randomBytes(32).toString('base64url');
}

export const hacherIdentifiant = (identifiant: string): Buffer => createHash('sha256').update(identifiant).digest();

export const composerCookie = (marqueId: string, identifiant: string): string => `${marqueId}.${identifiant}`;

/** Décompose la valeur d'un cookie ; `undefined` si elle n'a pas la forme attendue (aucune requête en base alors). */
export function decomposerCookie(valeur: string | undefined): { marqueId: string; identifiant: string } | undefined {
  if (valeur === undefined) return undefined;
  const [marqueId, identifiant, reste] = valeur.split('.');
  if (reste !== undefined || marqueId === undefined || identifiant === undefined) return undefined;
  if (!UUID.test(marqueId) || !IDENTIFIANT.test(identifiant)) return undefined;
  return { marqueId, identifiant };
}

export class MagasinSessionsPg implements MagasinSessions {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async creer(nouvelle: NouvelleSession): Promise<string> {
    const identifiant = nouvelIdentifiant();
    const expireLe = new Date(Date.now() + DUREE_SESSION_MS);
    await dansTransactionMarque(this.#pool, nouvelle.marqueId, async (client) => {
      // Ménage au passage : les sessions finies depuis plus d'un jour ne servent plus à rien.
      await client.query("DELETE FROM sessions WHERE expire_le < now() - interval '1 day' OR revoquee_le < now() - interval '1 day'");
      await client.query(
        'INSERT INTO sessions (marque_id, hache_jeton, sub, email, authentifie_le, expire_le) VALUES ($1, $2, $3, $4, $5, $6)',
        [nouvelle.marqueId, hacherIdentifiant(identifiant), nouvelle.sub, nouvelle.email ?? null, nouvelle.authentifieLe, expireLe],
      );
    });
    return composerCookie(nouvelle.marqueId, identifiant);
  }

  async trouver(valeurCookie: string): Promise<Session | undefined> {
    const cookie = decomposerCookie(valeurCookie);
    if (cookie === undefined) return undefined;
    return dansTransactionMarque(this.#pool, cookie.marqueId, async (client) => {
      const { rows } = await client.query<{ sub: string; email: string | null; authentifie_le: Date; expire_le: Date }>(
        'SELECT sub, email, authentifie_le, expire_le FROM sessions WHERE hache_jeton = $1 AND revoquee_le IS NULL AND expire_le > now()',
        [hacherIdentifiant(cookie.identifiant)],
      );
      const ligne = rows[0];
      if (ligne === undefined) return undefined;
      return {
        marqueId: cookie.marqueId,
        sub: ligne.sub,
        email: ligne.email ?? undefined,
        authentifieLe: ligne.authentifie_le,
        expireLe: ligne.expire_le,
      };
    });
  }

  async revoquer(valeurCookie: string): Promise<boolean> {
    const cookie = decomposerCookie(valeurCookie);
    if (cookie === undefined) return false;
    return dansTransactionMarque(this.#pool, cookie.marqueId, async (client) => {
      const resultat = await client.query(
        'UPDATE sessions SET revoquee_le = now() WHERE hache_jeton = $1 AND revoquee_le IS NULL AND expire_le > now()',
        [hacherIdentifiant(cookie.identifiant)],
      );
      return (resultat.rowCount ?? 0) > 0;
    });
  }
}
