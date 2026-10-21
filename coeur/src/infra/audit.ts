// regie — journal d'audit chaîné, en ajout seul (NFR-21, histoire 1.14).
// Chaque ligne porte le SHA-256 de la précédente de la même marque : supprimer ou modifier une ligne
// casse la chaîne, et `verifierChaine` le montre. Aucun secret n'y entre : `details` est contrôlé avant l'écriture.

import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { dansTransactionMarque } from './base.ts';

export const HACHE_INITIAL = '0'.repeat(64);

export type EntreeAudit = Readonly<{
  /** Qui agit : identifiant Authentik (`sub`), `jeton:<id>` ou `inconnu`. */
  acteur: string;
  /** `connexion`, `connexion_echec`, `deconnexion`, … */
  action: string;
  /** Sur quoi : `session`, `jeton:<id>`, … */
  objet: string;
  /** Origine (interface, MCP, API), cause d'un échec… Jamais un secret. */
  details?: Readonly<Record<string, unknown>>;
}>;

export type LigneAudit = Readonly<{
  marqueId: string;
  horodatage: string;
  acteur: string;
  action: string;
  objet: string;
  details: Readonly<Record<string, unknown>>;
  hachePrecedent: string;
  hache: string;
}>;

export interface Audit {
  ajouter(marqueId: string, entree: EntreeAudit): Promise<void>;
}

export class ErreurAudit extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurAudit';
  }
}

const CLES_SECRETES = /(secret|token|jeton|mot_?de_?passe|passw(or)?d|cookie|authorization|code_verifier|api_?key|cle_?maitresse)/i;
const FORME_JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/;
const FORME_BEARER = /\bBearer\s+\S{8,}/i;

/** Refuse (et nomme la clé) tout `details` qui ressemble à un secret : mieux vaut échouer qu'écrire un secret. */
export function verifierSansSecret(details: unknown, chemin = 'details'): void {
  if (typeof details === 'string') {
    if (FORME_JWT.test(details) || FORME_BEARER.test(details)) throw new ErreurAudit(`${chemin} : valeur qui ressemble à un jeton`);
    return;
  }
  if (details === null || typeof details !== 'object') return;
  if (Array.isArray(details)) {
    details.forEach((element, index) => verifierSansSecret(element, `${chemin}[${index}]`));
    return;
  }
  for (const [cle, valeur] of Object.entries(details)) {
    if (CLES_SECRETES.test(cle)) throw new ErreurAudit(`${chemin}.${cle} : clé interdite dans le journal d'audit`);
    verifierSansSecret(valeur, `${chemin}.${cle}`);
  }
}

/** JSON à clés triées : le même objet donne toujours les mêmes octets, quel que soit l'ordre des clés. */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur) ?? 'null';
  if (Array.isArray(valeur)) return `[${valeur.map(jsonCanonique).join(',')}]`;
  const cles = Object.keys(valeur).sort();
  return `{${cles.map((cle) => `${JSON.stringify(cle)}:${jsonCanonique((valeur as Record<string, unknown>)[cle])}`).join(',')}}`;
}

export function calculerHache(ligne: Omit<LigneAudit, 'hache'>): string {
  return createHash('sha256')
    .update(
      jsonCanonique([ligne.hachePrecedent, ligne.marqueId, ligne.horodatage, ligne.acteur, ligne.action, ligne.objet, ligne.details]),
    )
    .digest('hex');
}

/** Construit la ligne suivante de la chaîne d'une marque. */
export function chainer(marqueId: string, entree: EntreeAudit, precedent: string | undefined, horodatage: Date): LigneAudit {
  const details = entree.details ?? {};
  verifierSansSecret(details);
  const base = {
    marqueId,
    horodatage: horodatage.toISOString(),
    acteur: entree.acteur,
    action: entree.action,
    objet: entree.objet,
    details,
    hachePrecedent: precedent ?? HACHE_INITIAL,
  };
  return { ...base, hache: calculerHache(base) };
}

/** Rend la position (à partir de 0) de la première ligne qui rompt la chaîne, ou `undefined` si elle tient. */
export function verifierChaine(lignes: readonly LigneAudit[]): number | undefined {
  let attendu = HACHE_INITIAL;
  for (const [index, ligne] of lignes.entries()) {
    const { hache, ...reste } = ligne;
    if (ligne.hachePrecedent !== attendu || calculerHache(reste) !== hache) return index;
    attendu = hache;
  }
  return undefined;
}

/** Journal en base : une transaction par ajout, verrouillée par marque pour que la chaîne reste linéaire. */
export class AuditPg implements Audit {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async ajouter(marqueId: string, entree: EntreeAudit): Promise<void> {
    await dansTransactionMarque(this.#pool, marqueId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`audit:${marqueId}`]);
      const dernier = await client.query<{ hache: string }>('SELECT hache FROM journal_audit ORDER BY id DESC LIMIT 1');
      const ligne = chainer(marqueId, entree, dernier.rows[0]?.hache, new Date());
      await client.query(
        `INSERT INTO journal_audit (marque_id, horodatage, acteur, action, objet, details, hache_precedent, hache)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [marqueId, ligne.horodatage, ligne.acteur, ligne.action, ligne.objet, JSON.stringify(ligne.details), ligne.hachePrecedent, ligne.hache],
      );
    });
  }

  /** Relit la chaîne d'une marque, dans l'ordre (pour `verifierChaine` ; la consultation arrive en 1.13). */
  async lire(marqueId: string): Promise<LigneAudit[]> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<{
        horodatage: Date;
        acteur: string;
        action: string;
        objet: string;
        details: Record<string, unknown>;
        hache_precedent: string;
        hache: string;
      }>('SELECT horodatage, acteur, action, objet, details, hache_precedent, hache FROM journal_audit ORDER BY id');
      return rows.map((ligne) => ({
        marqueId,
        horodatage: ligne.horodatage.toISOString(),
        acteur: ligne.acteur,
        action: ligne.action,
        objet: ligne.objet,
        details: ligne.details,
        hachePrecedent: ligne.hache_precedent,
        hache: ligne.hache,
      }));
    });
  }
}
