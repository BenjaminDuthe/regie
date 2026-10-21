// regie — connexion de Claude par OAuth 2.1 (histoire 1.12, FR-46, AR-13) : clients enregistrés, codes d'autorisation,
// connexions (jeton d'accès court + jeton de rafraîchissement tournant). Seuls les SHA-256 sont en base.
// Formats : `regie_oac_` (code), `regie_oat_` (accès), `regie_ort_` (rafraîchissement), chacun
// `<préfixe>_<marque, 32 hexa>_<43 caractères base64url>` ; l'identifiant de client `regie_cli_<marque>_<22 caractères>`.
// La marque écrite dans la valeur permet de la retrouver sous la RLS sans rien savoir de la personne.

import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { dansTransactionMarque } from './base.ts';
import { hacherJeton, uuidDepuisHexa, type Portee, type Principal } from './jetons.ts';

/** Le code d'autorisation vit une minute ; le jeton d'accès une demi-heure ; le rafraîchissement 30 jours, 90 au total. */
export const CODE_VIE_S = 60;
export const ACCES_VIE_S = 1800;
export const REFRESH_VIE_JOURS = 30;
export const CONNEXION_VIE_MAX_JOURS = 90;
/** Plafond de clients enregistrés par marque : l'enregistrement est ouvert (RFC 7591), il doit rester borné. */
export const CLIENTS_MAX = 200;

export type TypeSecret = 'oac' | 'oat' | 'ort';

const FORME_SECRET = /^regie_(oac|oat|ort)_([0-9a-f]{32})_[A-Za-z0-9_-]{43}$/;
const FORME_CLIENT = /^regie_cli_([0-9a-f]{32})_[A-Za-z0-9_-]{22}$/;

export function composerSecret(type: TypeSecret, marqueId: string): string {
  return `regie_${type}_${marqueId.replaceAll('-', '')}_${randomBytes(32).toString('base64url')}`;
}

/** La marque écrite dans un secret de ce type, ou `undefined` si la forme n'est pas la bonne (aucune requête alors). */
export function marqueDuSecret(type: TypeSecret, clair: string): string | undefined {
  const m = FORME_SECRET.exec(clair);
  return m !== null && m[1] === type ? uuidDepuisHexa(m[2]!) : undefined;
}

export function composerIdentifiantClient(marqueId: string): string {
  return `regie_cli_${marqueId.replaceAll('-', '')}_${randomBytes(16).toString('base64url')}`;
}

export function marqueDuClient(clientId: string): string | undefined {
  const hexa = FORME_CLIENT.exec(clientId)?.[1];
  return hexa === undefined ? undefined : uuidDepuisHexa(hexa);
}

export type ClientOauth = Readonly<{ clientId: string; marqueId: string; nom: string; redirectUris: readonly string[] }>;

export type NouveauCode = Readonly<{
  marqueId: string;
  clientId: string;
  utilisateurId: string;
  sub: string;
  redirectUri: string;
  codeChallenge: string;
  portees: readonly Portee[];
  espaceIds: readonly string[];
}>;

/** Ce que racontait un code d'autorisation, rendu une seule fois. */
export type CodeConsomme = NouveauCode;

/** Les deux jetons rendus à Claude : la seule fois où ils existent en clair. */
export type Emission = Readonly<{
  connexionId: string;
  acces: string;
  refresh: string;
  accesExpireDans: number;
  portees: readonly Portee[];
  espaceIds: readonly string[];
}>;

export type Rafraichissement =
  | Readonly<{ etat: 'ok'; emission: Emission }>
  | Readonly<{ etat: 'invalide' }>
  /** Un ancien jeton de rafraîchissement a été présenté : la connexion est révoquée. */
  | Readonly<{ etat: 'reutilise'; marqueId: string; sub: string; connexionId: string }>;

/** Ce qu'on montre d'une connexion : jamais un jeton ni un haché. */
export type ConnexionClaude = Readonly<{
  id: string;
  clientNom: string;
  portees: readonly Portee[];
  espaceIds: readonly string[];
  creeLe: Date;
  expireLe: Date;
  revoqueLe: Date | undefined;
}>;

export interface Oauth {
  /** Enregistre un client public ; `undefined` si le plafond de la marque est atteint. */
  enregistrerClient(marqueId: string, client: Readonly<{ nom: string; redirectUris: readonly string[] }>): Promise<ClientOauth | undefined>;
  trouverClient(clientId: string): Promise<ClientOauth | undefined>;
  /** Rend le code en clair (valable une minute, à usage unique). */
  emettreCode(code: NouveauCode): Promise<string>;
  /** Consomme le code : rend son contenu une seule fois, `undefined` s'il est inconnu, périmé ou déjà utilisé. */
  consommerCode(clair: string): Promise<CodeConsomme | undefined>;
  ouvrirConnexion(code: CodeConsomme): Promise<Emission>;
  rafraichir(refresh: string, clientId: string): Promise<Rafraichissement>;
  /** Rend le principal si le jeton d'accès est valide : connu, non expiré, connexion non révoquée. */
  authentifierAcces(clair: string): Promise<Principal | undefined>;
  lister(marqueId: string, utilisateurId: string): Promise<ConnexionClaude[]>;
  /** Révoque une connexion de cette personne ; rend faux si elle n'existe pas, n'est pas la sienne ou l'est déjà. */
  revoquer(marqueId: string, utilisateurId: string, connexionId: string): Promise<boolean>;
}

type LigneClient = { client_id: string; marque_id: string; nom: string; redirect_uris: string[] };
const versClient = (l: LigneClient): ClientOauth => ({ clientId: l.client_id, marqueId: l.marque_id, nom: l.nom, redirectUris: l.redirect_uris });

export class OauthPg implements Oauth {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async enregistrerClient(marqueId: string, client: Readonly<{ nom: string; redirectUris: readonly string[] }>): Promise<ClientOauth | undefined> {
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      // Ménage : un client enregistré depuis plus d'un jour et jamais utilisé n'a plus de raison d'être.
      await c.query(
        `DELETE FROM oauth_clients k WHERE k.cree_le < now() - interval '1 day'
           AND NOT EXISTS (SELECT 1 FROM oauth_connexions x WHERE x.client_id = k.client_id)
           AND NOT EXISTS (SELECT 1 FROM oauth_codes x WHERE x.client_id = k.client_id)`,
      );
      const { rows: compte } = await c.query<{ n: string }>('SELECT count(*)::text AS n FROM oauth_clients');
      if (Number(compte[0]!.n) >= CLIENTS_MAX) return undefined;
      const { rows } = await c.query<LigneClient>(
        'INSERT INTO oauth_clients (client_id, marque_id, nom, redirect_uris) VALUES ($1, $2, $3, $4) RETURNING client_id, marque_id, nom, redirect_uris',
        [composerIdentifiantClient(marqueId), marqueId, client.nom, client.redirectUris],
      );
      return versClient(rows[0]!);
    });
  }

  async trouverClient(clientId: string): Promise<ClientOauth | undefined> {
    const marqueId = marqueDuClient(clientId);
    if (marqueId === undefined) return undefined;
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rows } = await c.query<LigneClient>('SELECT client_id, marque_id, nom, redirect_uris FROM oauth_clients WHERE client_id = $1', [clientId]);
      return rows[0] === undefined ? undefined : versClient(rows[0]);
    });
  }

  async emettreCode(n: NouveauCode): Promise<string> {
    const clair = composerSecret('oac', n.marqueId);
    await dansTransactionMarque(this.#pool, n.marqueId, async (c) => {
      await c.query("DELETE FROM oauth_codes WHERE expire_le < now() - interval '1 day'");
      await c.query(
        `INSERT INTO oauth_codes (hache, marque_id, client_id, utilisateur_id, sub, redirect_uri, code_challenge, portees, espace_ids, expire_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(secs => $10))`,
        [hacherJeton(clair), n.marqueId, n.clientId, n.utilisateurId, n.sub, n.redirectUri, n.codeChallenge, n.portees, n.espaceIds, CODE_VIE_S],
      );
    });
    return clair;
  }

  async consommerCode(clair: string): Promise<CodeConsomme | undefined> {
    const marqueId = marqueDuSecret('oac', clair);
    if (marqueId === undefined) return undefined;
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rows } = await c.query<{ client_id: string; utilisateur_id: string; sub: string; redirect_uri: string; code_challenge: string; portees: Portee[]; espace_ids: string[] }>(
        `UPDATE oauth_codes SET utilise_le = now() WHERE hache = $1 AND utilise_le IS NULL AND expire_le > now()
         RETURNING client_id, utilisateur_id, sub, redirect_uri, code_challenge, portees, espace_ids`,
        [hacherJeton(clair)],
      );
      const l = rows[0];
      return l === undefined
        ? undefined
        : { marqueId, clientId: l.client_id, utilisateurId: l.utilisateur_id, sub: l.sub, redirectUri: l.redirect_uri, codeChallenge: l.code_challenge, portees: l.portees, espaceIds: l.espace_ids };
    });
  }

  async ouvrirConnexion(code: CodeConsomme): Promise<Emission> {
    const acces = composerSecret('oat', code.marqueId);
    const refresh = composerSecret('ort', code.marqueId);
    const id = await dansTransactionMarque(this.#pool, code.marqueId, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO oauth_connexions (marque_id, client_id, utilisateur_id, sub, portees, espace_ids, hache_acces, acces_expire_le, hache_refresh, refresh_expire_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8), $9, now() + make_interval(days => $10))
         RETURNING id`,
        [code.marqueId, code.clientId, code.utilisateurId, code.sub, code.portees, code.espaceIds, hacherJeton(acces), ACCES_VIE_S, hacherJeton(refresh), REFRESH_VIE_JOURS],
      );
      return rows[0]!.id;
    });
    return { connexionId: id, acces, refresh, accesExpireDans: ACCES_VIE_S, portees: code.portees, espaceIds: code.espaceIds };
  }

  async rafraichir(refresh: string, clientId: string): Promise<Rafraichissement> {
    const marqueId = marqueDuSecret('ort', refresh);
    if (marqueId === undefined) return { etat: 'invalide' };
    const h = hacherJeton(refresh);
    return dansTransactionMarque(this.#pool, marqueId, async (c): Promise<Rafraichissement> => {
      const { rows } = await c.query<{ id: string; client_id: string; sub: string; portees: Portee[]; espace_ids: string[]; revoque_le: Date | null; hache_refresh: Buffer; refresh_expire_le: Date }>(
        `SELECT id, client_id, sub, portees, espace_ids, revoque_le, hache_refresh, refresh_expire_le
           FROM oauth_connexions WHERE hache_refresh = $1 OR refresh_precedent = $1 FOR UPDATE`,
        [h],
      );
      const l = rows[0];
      if (l === undefined || l.client_id !== clientId || l.revoque_le !== null) return { etat: 'invalide' };
      if (!l.hache_refresh.equals(h)) {
        // L'ancien jeton revient : il a été copié. On coupe toute la connexion.
        await c.query('UPDATE oauth_connexions SET revoque_le = now() WHERE id = $1', [l.id]);
        return { etat: 'reutilise', marqueId, sub: l.sub, connexionId: l.id };
      }
      const { rows: vivante } = await c.query('SELECT 1 FROM oauth_connexions WHERE id = $1 AND refresh_expire_le > now()', [l.id]);
      if (vivante.length === 0) return { etat: 'invalide' };
      const acces = composerSecret('oat', marqueId);
      const suivant = composerSecret('ort', marqueId);
      await c.query(
        `UPDATE oauth_connexions
            SET hache_acces = $2, acces_expire_le = now() + make_interval(secs => $3),
                refresh_precedent = hache_refresh, hache_refresh = $4,
                refresh_expire_le = LEAST(now() + make_interval(days => $5), cree_le + make_interval(days => $6))
          WHERE id = $1`,
        [l.id, hacherJeton(acces), ACCES_VIE_S, hacherJeton(suivant), REFRESH_VIE_JOURS, CONNEXION_VIE_MAX_JOURS],
      );
      return { etat: 'ok', emission: { connexionId: l.id, acces, refresh: suivant, accesExpireDans: ACCES_VIE_S, portees: l.portees, espaceIds: l.espace_ids } };
    });
  }

  async authentifierAcces(clair: string): Promise<Principal | undefined> {
    const marqueId = marqueDuSecret('oat', clair);
    if (marqueId === undefined) return undefined;
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rows } = await c.query<{ id: string; utilisateur_id: string; sub: string; portees: Portee[]; espace_ids: string[] }>(
        `SELECT id, utilisateur_id, sub, portees, espace_ids FROM oauth_connexions
          WHERE hache_acces = $1 AND revoque_le IS NULL AND acces_expire_le > now() AND refresh_expire_le > now()`,
        [hacherJeton(clair)],
      );
      const l = rows[0];
      return l === undefined ? undefined : { marqueId, utilisateurId: l.utilisateur_id, sub: l.sub, jetonId: l.id, portees: l.portees, espaceIds: l.espace_ids };
    });
  }

  async lister(marqueId: string, utilisateurId: string): Promise<ConnexionClaude[]> {
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const { rows } = await c.query<{ id: string; nom: string; portees: Portee[]; espace_ids: string[]; cree_le: Date; refresh_expire_le: Date; revoque_le: Date | null }>(
        `SELECT x.id, k.nom, x.portees, x.espace_ids, x.cree_le, x.refresh_expire_le, x.revoque_le
           FROM oauth_connexions x JOIN oauth_clients k ON k.client_id = x.client_id
          WHERE x.utilisateur_id = $1 ORDER BY x.cree_le DESC, x.id`,
        [utilisateurId],
      );
      return rows.map((l) => ({ id: l.id, clientNom: l.nom, portees: l.portees, espaceIds: l.espace_ids, creeLe: l.cree_le, expireLe: l.refresh_expire_le, revoqueLe: l.revoque_le ?? undefined }));
    });
  }

  async revoquer(marqueId: string, utilisateurId: string, connexionId: string): Promise<boolean> {
    return dansTransactionMarque(this.#pool, marqueId, async (c) => {
      const r = await c.query('UPDATE oauth_connexions SET revoque_le = now() WHERE id = $1 AND utilisateur_id = $2 AND revoque_le IS NULL', [connexionId, utilisateurId]);
      return (r.rowCount ?? 0) > 0;
    });
  }
}
