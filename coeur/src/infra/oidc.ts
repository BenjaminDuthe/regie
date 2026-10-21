// regie — client OpenID Connect de l'Authentik de Benjamin (histoire 1.14, FR-72).
// Code d'autorisation + PKCE S256, `state` et `nonce` ; l'id_token est vérifié ici avec node:crypto
// (RS256 et ES256 seulement : jamais `none`, jamais HS256) : signature, émetteur, audience, expiration,
// émission, nonce et, quand `max_age` est demandé, auth_time. Aucune bibliothèque : rien à épingler.
// Ce fichier est le seul à parler à Authentik (déclaré dans deploiement/sorties-autorisees.json).
// Aucun message d'erreur ne contient un jeton, un code ou un secret.

import { createHash, createPublicKey, randomBytes, verify, type KeyObject } from 'node:crypto';

export type CodeErreurOidc =
  | 'decouverte'
  | 'jwks'
  | 'echange'
  | 'jeton_invalide'
  | 'signature'
  | 'emetteur'
  | 'audience'
  | 'expire'
  | 'nonce'
  | 'auth_trop_ancienne';

export class ErreurOidc extends Error {
  readonly code: CodeErreurOidc;

  constructor(code: CodeErreurOidc, message: string) {
    super(message);
    this.name = 'ErreurOidc';
    this.code = code;
  }
}

/** Identité vérifiée tirée de l'id_token. Les secondes sont des secondes Unix, comme dans le jeton. */
export type ClaimsIdentite = Readonly<{
  sub: string;
  email: string | undefined;
  emailVerifie: boolean;
  /** Dernière authentification réelle auprès d'Authentik. */
  authTime: number | undefined;
  iat: number;
  exp: number;
}>;

export type AttenduJeton = Readonly<{ nonce: string; maxAge?: number }>;

export interface FournisseurOidc {
  urlAutorisation(parametres: Readonly<{ state: string; nonce: string; challenge: string; maxAge?: number }>): Promise<string>;
  /** Échange le code contre l'id_token (seul jeton gardé). */
  echangerCode(code: string, verifier: string): Promise<string>;
  verifierJeton(idToken: string, attendu: AttenduJeton): Promise<ClaimsIdentite>;
  /** Fin de session Authentik, si le fournisseur l'annonce. */
  urlFinSession(): Promise<string | undefined>;
}

export type ConfigOidc = Readonly<{
  emetteur: string;
  clientId: string;
  clientSecret: string;
  /** Adresse publique de regie : le retour d'Authentik arrive sur `${urlPublique}/connexion/retour`. */
  urlPublique: string;
}>;

type Metadonnees = Readonly<{
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}>;

type Jwk = Record<string, unknown>;

/** Tolérance sur les horloges d'Authentik et de regie. */
export const TOLERANCE_HORLOGE_S = 60;
const DELAI_REQUETE_MS = 10_000;
const DUREE_CACHE_DECOUVERTE_MS = 60 * 60_000;
const DELAI_ENTRE_RECHARGEMENTS_JWKS_MS = 60_000;

export const CHEMIN_RETOUR_OIDC = '/connexion/retour';

/** https partout ; http seulement vers la machine elle-même (développement, faux fournisseur des tests). */
export function adresseAutorisee(texte: string): boolean {
  try {
    const url = new URL(texte);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export const base64url = (donnees: Buffer): string => donnees.toString('base64url');

/** Valeur aléatoire pour `state`, `nonce` et le vérificateur PKCE (32 octets = 43 caractères). */
export const aleatoire = (): string => base64url(randomBytes(32));

export const defiPkce = (verifier: string): string => base64url(createHash('sha256').update(verifier).digest());

function decoderJson(partie: string): Record<string, unknown> {
  try {
    const valeur: unknown = JSON.parse(Buffer.from(partie, 'base64url').toString('utf8'));
    if (valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)) return valeur as Record<string, unknown>;
  } catch {
    // tombe sur l'erreur ci-dessous
  }
  throw new ErreurOidc('jeton_invalide', 'jeton d’identité illisible');
}

export class ClientOidc implements FournisseurOidc {
  readonly #config: ConfigOidc;
  readonly #requete: typeof fetch;
  readonly #maintenant: () => number;
  #decouverte: { valeur: Metadonnees; jusqua: number } | undefined;
  #cles: { valeur: Jwk[]; chargeLe: number } | undefined;

  constructor(config: ConfigOidc, options: { fetch?: typeof fetch; maintenant?: () => number } = {}) {
    if (!adresseAutorisee(config.emetteur)) throw new ErreurOidc('decouverte', 'émetteur OIDC : https attendu');
    if (!adresseAutorisee(config.urlPublique)) throw new ErreurOidc('decouverte', 'adresse publique de regie : https attendu');
    this.#config = config;
    this.#requete = options.fetch ?? fetch;
    this.#maintenant = options.maintenant ?? Date.now;
  }

  get redirectUri(): string {
    return `${this.#config.urlPublique.replace(/\/+$/, '')}${CHEMIN_RETOUR_OIDC}`;
  }

  async #json(url: string, init: RequestInit, code: CodeErreurOidc, quoi: string): Promise<Record<string, unknown>> {
    let reponse: Response;
    try {
      reponse = await this.#requete(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(DELAI_REQUETE_MS) });
    } catch {
      throw new ErreurOidc(code, `${quoi} : Authentik injoignable`);
    }
    if (!reponse.ok) throw new ErreurOidc(code, `${quoi} : réponse ${reponse.status}`);
    try {
      const valeur: unknown = await reponse.json();
      if (valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)) return valeur as Record<string, unknown>;
    } catch {
      // tombe sur l'erreur ci-dessous
    }
    throw new ErreurOidc(code, `${quoi} : réponse illisible`);
  }

  async metadonnees(): Promise<Metadonnees> {
    const maintenant = this.#maintenant();
    if (this.#decouverte !== undefined && this.#decouverte.jusqua > maintenant) return this.#decouverte.valeur;
    const adresse = `${this.#config.emetteur.replace(/\/+$/, '')}/.well-known/openid-configuration`;
    const doc = await this.#json(adresse, { headers: { accept: 'application/json' } }, 'decouverte', 'découverte OIDC');
    if (doc['issuer'] !== this.#config.emetteur) throw new ErreurOidc('emetteur', 'découverte OIDC : émetteur annoncé différent de celui configuré');
    const point = (cle: string): string => {
      const valeur = doc[cle];
      if (typeof valeur !== 'string' || !adresseAutorisee(valeur)) throw new ErreurOidc('decouverte', `découverte OIDC : ${cle} absent ou non sûr`);
      return valeur;
    };
    const fin = doc['end_session_endpoint'];
    const valeur: Metadonnees = {
      authorization_endpoint: point('authorization_endpoint'),
      token_endpoint: point('token_endpoint'),
      jwks_uri: point('jwks_uri'),
      ...(typeof fin === 'string' && adresseAutorisee(fin) ? { end_session_endpoint: fin } : {}),
    };
    this.#decouverte = { valeur, jusqua: maintenant + DUREE_CACHE_DECOUVERTE_MS };
    return valeur;
  }

  async urlAutorisation(p: Readonly<{ state: string; nonce: string; challenge: string; maxAge?: number }>): Promise<string> {
    const meta = await this.metadonnees();
    const url = new URL(meta.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.#config.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', p.state);
    url.searchParams.set('nonce', p.nonce);
    url.searchParams.set('code_challenge', p.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (p.maxAge !== undefined) {
      url.searchParams.set('max_age', String(p.maxAge));
      // Certains fournisseurs ignorent max_age : prompt=login force la nouvelle saisie ; auth_time est vérifié au retour.
      url.searchParams.set('prompt', 'login');
    }
    return url.toString();
  }

  async echangerCode(code: string, verifier: string): Promise<string> {
    const meta = await this.metadonnees();
    const identifiants = Buffer.from(`${encodeURIComponent(this.#config.clientId)}:${encodeURIComponent(this.#config.clientSecret)}`).toString('base64');
    const reponse = await this.#json(
      meta.token_endpoint,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          authorization: `Basic ${identifiants}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          code_verifier: verifier,
          client_id: this.#config.clientId,
        }).toString(),
      },
      'echange',
      'échange du code',
    );
    const idToken = reponse['id_token'];
    if (typeof idToken !== 'string' || idToken === '') throw new ErreurOidc('echange', 'échange du code : pas de jeton d’identité');
    return idToken;
  }

  async urlFinSession(): Promise<string | undefined> {
    return (await this.metadonnees()).end_session_endpoint;
  }

  async #jwks(forcer: boolean): Promise<Jwk[]> {
    const maintenant = this.#maintenant();
    const frais = this.#cles !== undefined && maintenant - this.#cles.chargeLe < DELAI_ENTRE_RECHARGEMENTS_JWKS_MS;
    if (this.#cles !== undefined && (!forcer || frais)) return this.#cles.valeur;
    const meta = await this.metadonnees();
    const doc = await this.#json(meta.jwks_uri, { headers: { accept: 'application/json' } }, 'jwks', 'clés de signature');
    const cles = doc['keys'];
    if (!Array.isArray(cles)) throw new ErreurOidc('jwks', 'clés de signature : liste absente');
    const valeur = cles.filter((cle): cle is Jwk => cle !== null && typeof cle === 'object');
    this.#cles = { valeur, chargeLe: maintenant };
    return valeur;
  }

  async #cle(alg: 'RS256' | 'ES256', kid: unknown): Promise<KeyObject | undefined> {
    const kty = alg === 'RS256' ? 'RSA' : 'EC';
    for (const forcer of [false, true]) {
      const candidates = (await this.#jwks(forcer)).filter(
        (cle) => cle['kty'] === kty && (cle['use'] === undefined || cle['use'] === 'sig') && (alg !== 'ES256' || cle['crv'] === 'P-256'),
      );
      const trouvee = typeof kid === 'string' ? candidates.find((cle) => cle['kid'] === kid) : candidates.length === 1 ? candidates[0] : undefined;
      if (trouvee !== undefined) {
        try {
          return createPublicKey({ key: trouvee as never, format: 'jwk' });
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  }

  async verifierJeton(idToken: string, attendu: AttenduJeton): Promise<ClaimsIdentite> {
    const parties = idToken.split('.');
    if (parties.length !== 3 || parties.some((partie) => partie === '' || !/^[A-Za-z0-9_-]+$/.test(partie))) {
      throw new ErreurOidc('jeton_invalide', 'jeton d’identité mal formé');
    }
    const [enteteB64, chargeB64, signatureB64] = parties as [string, string, string];
    const entete = decoderJson(enteteB64);
    const alg = entete['alg'];
    if (alg !== 'RS256' && alg !== 'ES256') throw new ErreurOidc('signature', 'algorithme de signature refusé (RS256 ou ES256 attendus)');

    const cle = await this.#cle(alg, entete['kid']);
    if (cle === undefined) throw new ErreurOidc('signature', 'clé de signature inconnue');
    const signature = Buffer.from(signatureB64, 'base64url');
    const donnees = Buffer.from(`${enteteB64}.${chargeB64}`);
    let valide = false;
    try {
      valide = verify('sha256', donnees, alg === 'ES256' ? { key: cle, dsaEncoding: 'ieee-p1363' } : cle, signature);
    } catch {
      valide = false;
    }
    if (!valide) throw new ErreurOidc('signature', 'signature du jeton invalide');

    const c = decoderJson(chargeB64);
    const maintenantS = Math.floor(this.#maintenant() / 1000);
    if (c['iss'] !== this.#config.emetteur) throw new ErreurOidc('emetteur', 'émetteur du jeton inattendu');
    const aud = c['aud'];
    const audiences = typeof aud === 'string' ? [aud] : Array.isArray(aud) ? aud : [];
    if (!audiences.includes(this.#config.clientId)) throw new ErreurOidc('audience', 'audience du jeton inattendue');
    if (audiences.length > 1 && c['azp'] !== this.#config.clientId) throw new ErreurOidc('audience', 'partie autorisée du jeton inattendue');
    const exp = c['exp'];
    const iat = c['iat'];
    if (typeof exp !== 'number' || typeof iat !== 'number') throw new ErreurOidc('expire', 'jeton sans date d’expiration ou d’émission');
    if (exp + TOLERANCE_HORLOGE_S <= maintenantS) throw new ErreurOidc('expire', 'jeton expiré');
    if (iat - TOLERANCE_HORLOGE_S > maintenantS) throw new ErreurOidc('expire', 'jeton émis dans le futur');
    if (typeof c['nonce'] !== 'string' || c['nonce'] !== attendu.nonce) throw new ErreurOidc('nonce', 'nonce du jeton inattendu');
    const sub = c['sub'];
    if (typeof sub !== 'string' || sub === '' || sub.length > 255) throw new ErreurOidc('jeton_invalide', 'jeton sans identifiant d’utilisateur');
    const authTime = typeof c['auth_time'] === 'number' ? c['auth_time'] : undefined;
    if (attendu.maxAge !== undefined) {
      if (authTime === undefined) throw new ErreurOidc('auth_trop_ancienne', 'auth_time absent alors que max_age était demandé');
      if (maintenantS - authTime > attendu.maxAge + TOLERANCE_HORLOGE_S) {
        throw new ErreurOidc('auth_trop_ancienne', 'authentification plus ancienne que max_age');
      }
    }
    return {
      sub,
      email: typeof c['email'] === 'string' ? c['email'] : undefined,
      emailVerifie: c['email_verified'] === true,
      authTime,
      iat,
      exp,
    };
  }
}
