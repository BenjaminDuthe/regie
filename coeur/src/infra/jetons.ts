// regie — jetons d'API personnels (histoire 1.11, FR-45).
// Format : `regie_pat_<marque, 32 hexa>_<43 caractères base64url>` (32 octets aléatoires). La marque dans le jeton
// permet de le retrouver sous la RLS ; seul le SHA-256 du jeton entier est stocké. Le clair n'existe qu'à la création.

import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { dansTransactionMarque } from './base.ts';

export type Portee = 'lecture' | 'ecriture';
export const PORTEES: readonly Portee[] = Object.freeze(['lecture', 'ecriture']);
/** Un jeton vit 90 jours au plus. */
export const DUREE_MAX_JETON_JOURS = 90;
/** Un jeton de rejeu (lié à un script) vit un an au plus (histoire 4.11). */
export const DUREE_MAX_REJEU_JOURS = 365;

export type NouveauJeton = Readonly<{
  marqueId: string;
  utilisateurId: string;
  sub: string;
  nom: string;
  portees: readonly Portee[];
  espaceIds: readonly string[];
  dureeJours: number;
  /** Jeton de rejeu : lié à ce script, il ne sait que le rejouer. */
  scriptId?: string | undefined;
}>;

/** Ce qu'on montre d'un jeton : jamais le jeton ni son haché. */
export type JetonApi = Readonly<{
  id: string;
  nom: string;
  portees: readonly Portee[];
  espaceIds: readonly string[];
  creeLe: Date;
  expireLe: Date;
  revoqueLe: Date | undefined;
  /** Le script d'un jeton de rejeu ; `undefined` pour un jeton personnel. */
  scriptId?: string | undefined;
}>;

/** Qui se cache derrière un jeton valide. */
export type Principal = Readonly<{
  marqueId: string;
  utilisateurId: string;
  sub: string;
  jetonId: string;
  portees: readonly Portee[];
  espaceIds: readonly string[];
  /** Présent pour un jeton de rejeu : il n'est bon que pour `script.rejouer` sur ce script. */
  scriptId?: string | undefined;
}>;

export interface JetonsApi {
  /** Crée le jeton et rend sa valeur en clair, la seule fois qu'elle existe. */
  creer(nouveau: NouveauJeton): Promise<{ jeton: JetonApi; clair: string }>;
  /** Les jetons de cet utilisateur, les plus récents d'abord. */
  lister(marqueId: string, utilisateurId: string): Promise<JetonApi[]>;
  /** Révoque un jeton de cet utilisateur ; rend faux s'il n'existe pas, n'est pas le sien ou l'est déjà. */
  revoquer(marqueId: string, utilisateurId: string, jetonId: string): Promise<boolean>;
  /** Révoque les jetons de rejeu encore valides d'un script de cet utilisateur ; rend leur nombre. */
  revoquerDuScript(marqueId: string, utilisateurId: string, scriptId: string): Promise<number>;
  /** Rend le principal si le jeton est valide : bien formé, connu, non expiré, non révoqué. */
  authentifier(clair: string): Promise<Principal | undefined>;
}

const FORME = /^regie_pat_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/;

export const hacherJeton = (clair: string): Buffer => createHash('sha256').update(clair).digest();

export function composerJeton(marqueId: string): string {
  return `regie_pat_${marqueId.replaceAll('-', '')}_${randomBytes(32).toString('base64url')}`;
}

/** Un identifiant de 32 caractères hexadécimaux remis sous la forme d'un uuid. */
export const uuidDepuisHexa = (hexa: string): string => `${hexa.slice(0, 8)}-${hexa.slice(8, 12)}-${hexa.slice(12, 16)}-${hexa.slice(16, 20)}-${hexa.slice(20)}`;

/** La marque écrite dans le jeton, ou `undefined` si la forme n'est pas la bonne (aucune requête alors). */
export function marqueDuJeton(clair: string): string | undefined {
  const hexa = FORME.exec(clair)?.[1];
  return hexa === undefined ? undefined : uuidDepuisHexa(hexa);
}

type Ligne = {
  id: string;
  nom: string;
  portees: Portee[];
  espace_ids: string[];
  cree_le: Date;
  expire_le: Date;
  revoque_le: Date | null;
  script_id: string | null;
};
const versJeton = (l: Ligne): JetonApi => ({
  id: l.id,
  nom: l.nom,
  portees: l.portees,
  espaceIds: l.espace_ids,
  creeLe: l.cree_le,
  expireLe: l.expire_le,
  revoqueLe: l.revoque_le ?? undefined,
  ...(l.script_id === null ? {} : { scriptId: l.script_id }),
});

export class JetonsApiPg implements JetonsApi {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async creer(n: NouveauJeton) {
    const clair = composerJeton(n.marqueId);
    const jeton = await dansTransactionMarque(this.#pool, n.marqueId, async (client) => {
      const { rows } = await client.query<Ligne>(
        `INSERT INTO jetons_api (marque_id, utilisateur_id, sub, nom, hache, portees, espace_ids, expire_le, script_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(days => $8), $9)
         RETURNING id, nom, portees, espace_ids, cree_le, expire_le, revoque_le, script_id`,
        [n.marqueId, n.utilisateurId, n.sub, n.nom, hacherJeton(clair), n.portees, n.espaceIds, n.dureeJours, n.scriptId ?? null],
      );
      return versJeton(rows[0]!);
    });
    return { jeton, clair };
  }

  async lister(marqueId: string, utilisateurId: string): Promise<JetonApi[]> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<Ligne>(
        'SELECT id, nom, portees, espace_ids, cree_le, expire_le, revoque_le, script_id FROM jetons_api WHERE utilisateur_id = $1 ORDER BY cree_le DESC, id',
        [utilisateurId],
      );
      return rows.map(versJeton);
    });
  }

  async revoquer(marqueId: string, utilisateurId: string, jetonId: string): Promise<boolean> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const r = await client.query('UPDATE jetons_api SET revoque_le = now() WHERE id = $1 AND utilisateur_id = $2 AND revoque_le IS NULL', [jetonId, utilisateurId]);
      return (r.rowCount ?? 0) > 0;
    });
  }

  async revoquerDuScript(marqueId: string, utilisateurId: string, scriptId: string): Promise<number> {
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const r = await client.query('UPDATE jetons_api SET revoque_le = now() WHERE script_id = $1 AND utilisateur_id = $2 AND revoque_le IS NULL', [scriptId, utilisateurId]);
      return r.rowCount ?? 0;
    });
  }

  async authentifier(clair: string): Promise<Principal | undefined> {
    const marqueId = marqueDuJeton(clair);
    if (marqueId === undefined) return undefined;
    return dansTransactionMarque(this.#pool, marqueId, async (client) => {
      const { rows } = await client.query<{ id: string; utilisateur_id: string; sub: string; portees: Portee[]; espace_ids: string[]; script_id: string | null }>(
        'SELECT id, utilisateur_id, sub, portees, espace_ids, script_id FROM jetons_api WHERE hache = $1 AND revoque_le IS NULL AND expire_le > now()',
        [hacherJeton(clair)],
      );
      const l = rows[0];
      return l === undefined ? undefined : { marqueId, utilisateurId: l.utilisateur_id, sub: l.sub, jetonId: l.id, portees: l.portees, espaceIds: l.espace_ids, ...(l.script_id === null ? {} : { scriptId: l.script_id }) };
    });
  }
}
