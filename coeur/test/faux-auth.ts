// Doubles de test de la connexion (histoire 1.14) : un faux fournisseur OIDC qui écoute sur la machine locale,
// avec des clés RSA et EC générées à la volée, et des magasins en mémoire. Rien ne sort de la machine.

import { createHash, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Services } from '../src/auth/services.ts';
import { chainer, type Audit, type EntreeAudit, type LigneAudit } from '../src/infra/audit.ts';
import { Coffre } from '../src/infra/coffre.ts';
import type { Marques, MarqueUnique } from '../src/infra/marques.ts';
import { composerCookie, decomposerCookie, hacherIdentifiant, nouvelIdentifiant, type MagasinSessions, type NouvelleSession, type Session } from '../src/infra/sessions.ts';

const b64 = (donnees: Buffer | string): string => Buffer.from(donnees).toString('base64url');

export type Signature = 'RS256' | 'ES256' | 'HS256' | 'none';

export type FauxFournisseur = {
  emetteur: string;
  clientId: string;
  clientSecret: string;
  /** Adresse de retour attendue à l'échange du code. */
  redirectUri: string;
  appels: { chemin: string; methode: string }[];
  /** Mode « jwks » : clés publiques à publier (par défaut les deux). */
  signer(claims: Record<string, unknown>, options?: { alg?: Signature; kid?: string; cle?: KeyObject; entete?: Record<string, unknown> }): string;
  /** Jeton conforme pour ce flux, avec des claims par défaut modifiables. */
  jetonValide(nonce: string, claims?: Record<string, unknown>, options?: { alg?: Signature; kid?: string }): string;
  /** Mémorise le jeton à rendre quand on présentera ce code avec le bon vérificateur PKCE. */
  poserCode(code: string, jeton: string, challenge: string): void;
  finSession: string | undefined;
  cleRsaAutre: KeyObject;
  cleEc: KeyObject;
  arreter(): Promise<void>;
};

export async function demarrerFauxFournisseur(options: { finSession?: boolean; cles?: 'toutes' | 'aucune'; maintenant?: () => number } = {}): Promise<FauxFournisseur> {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rsaAutre = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const clientId = 'regie-test';
  const clientSecret = randomBytes(18).toString('hex');
  const codes = new Map<string, { jeton: string; challenge: string }>();
  const appels: { chemin: string; methode: string }[] = [];
  const maintenant = options.maintenant ?? Date.now;
  let base = '';
  let redirectUri = '';

  const jwk = (cle: KeyObject, kid: string, alg: string) => ({ ...(cle.export({ format: 'jwk' }) as Record<string, unknown>), kid, alg, use: 'sig' });

  const lireCorps = (requete: IncomingMessage) =>
    new Promise<string>((resolve) => {
      const morceaux: Buffer[] = [];
      requete.on('data', (m: Buffer) => morceaux.push(m));
      requete.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
    });

  const serveur: Server = createServer(async (requete, reponse) => {
    const url = new URL(requete.url ?? '/', base);
    appels.push({ chemin: url.pathname, methode: requete.method ?? 'GET' });
    const json = (code: number, corps: unknown) => {
      reponse.writeHead(code, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify(corps));
    };
    if (url.pathname === '/application/o/regie/.well-known/openid-configuration') {
      return json(200, {
        issuer: `${base}/application/o/regie/`,
        authorization_endpoint: `${base}/application/o/authorize/`,
        token_endpoint: `${base}/application/o/token/`,
        jwks_uri: `${base}/application/o/regie/jwks/`,
        ...(options.finSession ? { end_session_endpoint: `${base}/application/o/regie/end-session/` } : {}),
      });
    }
    if (url.pathname === '/application/o/regie/jwks/') {
      return json(200, { keys: options.cles === 'aucune' ? [] : [jwk(rsa.publicKey, 'rsa-1', 'RS256'), jwk(ec.publicKey, 'ec-1', 'ES256')] });
    }
    if (url.pathname === '/application/o/token/' && requete.method === 'POST') {
      const corps = new URLSearchParams(await lireCorps(requete));
      const attendu = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      if (requete.headers.authorization !== attendu) return json(401, { error: 'invalid_client' });
      const code = codes.get(corps.get('code') ?? '');
      const verifier = corps.get('code_verifier') ?? '';
      if (code === undefined || corps.get('redirect_uri') !== redirectUri || createHash('sha256').update(verifier).digest('base64url') !== code.challenge) {
        return json(400, { error: 'invalid_grant' });
      }
      codes.delete(corps.get('code') ?? '');
      return json(200, { id_token: code.jeton, access_token: 'inutile', token_type: 'Bearer' });
    }
    return json(404, {});
  });
  await new Promise<void>((resolve) => serveur.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  const emetteur = `${base}/application/o/regie/`;
  redirectUri = 'http://127.0.0.1:4321/connexion/retour';

  const signer: FauxFournisseur['signer'] = (claims, opts = {}) => {
    const alg = opts.alg ?? 'RS256';
    const entete = { alg, typ: 'JWT', kid: opts.kid ?? (alg === 'ES256' ? 'ec-1' : 'rsa-1'), ...(opts.entete ?? {}) };
    const partie = `${b64(JSON.stringify(entete))}.${b64(JSON.stringify(claims))}`;
    if (alg === 'none') return `${partie}.`;
    if (alg === 'HS256') {
      // Attaque classique : HMAC avec la clé publique RSA (au format PEM) comme secret.
      return `${partie}.${createHmac('sha256', rsa.publicKey.export({ type: 'spki', format: 'pem' })).update(partie).digest('base64url')}`;
    }
    const cle = opts.cle ?? (alg === 'ES256' ? ec.privateKey : rsa.privateKey);
    const signature = alg === 'ES256' ? sign('sha256', Buffer.from(partie), { key: cle, dsaEncoding: 'ieee-p1363' }) : sign('sha256', Buffer.from(partie), cle);
    return `${partie}.${b64(signature)}`;
  };

  return {
    emetteur,
    clientId,
    clientSecret,
    redirectUri,
    appels,
    signer,
    jetonValide(nonce, claims = {}, opts = {}) {
      const s = Math.floor(maintenant() / 1000);
      return signer({ iss: emetteur, aud: clientId, sub: 'sub-benjamin', email: 'benjamin@exemple.test', email_verified: true, iat: s, exp: s + 300, auth_time: s, nonce, ...claims }, opts);
    },
    poserCode(code, jeton, challenge) {
      codes.set(code, { jeton, challenge });
    },
    finSession: options.finSession ? `${base}/application/o/regie/end-session/` : undefined,
    cleRsaAutre: createPrivateKey(rsaAutre.privateKey.export({ type: 'pkcs8', format: 'pem' })),
    cleEc: ec.privateKey,
    arreter: () => new Promise<void>((resolve) => serveur.close(() => resolve())),
  };
}

/** Sessions en mémoire, avec la même logique de hachage et de cookie que la version PostgreSQL. */
export class SessionsMemoire implements MagasinSessions {
  readonly lignes = new Map<string, { marqueId: string; sub: string; email: string | undefined; authentifieLe: Date; expireLe: Date; revoquee: boolean }>();
  maintenant: () => number = Date.now;

  async creer(nouvelle: NouvelleSession): Promise<string> {
    const identifiant = nouvelIdentifiant();
    this.lignes.set(hacherIdentifiant(identifiant).toString('hex'), {
      marqueId: nouvelle.marqueId,
      sub: nouvelle.sub,
      email: nouvelle.email,
      authentifieLe: nouvelle.authentifieLe,
      expireLe: new Date(this.maintenant() + 7 * 24 * 3600_000),
      revoquee: false,
    });
    return composerCookie(nouvelle.marqueId, identifiant);
  }

  async trouver(valeur: string): Promise<Session | undefined> {
    const cookie = decomposerCookie(valeur);
    const ligne = cookie === undefined ? undefined : this.lignes.get(hacherIdentifiant(cookie.identifiant).toString('hex'));
    if (cookie === undefined || ligne === undefined || ligne.marqueId !== cookie.marqueId || ligne.revoquee || ligne.expireLe.getTime() <= this.maintenant()) return undefined;
    return { marqueId: ligne.marqueId, sub: ligne.sub, email: ligne.email, authentifieLe: ligne.authentifieLe, expireLe: ligne.expireLe };
  }

  async revoquer(valeur: string): Promise<boolean> {
    const session = await this.trouver(valeur);
    const cookie = decomposerCookie(valeur);
    if (session === undefined || cookie === undefined) return false;
    this.lignes.get(hacherIdentifiant(cookie.identifiant).toString('hex'))!.revoquee = true;
    return true;
  }
}

export class MarquesMemoire implements Marques {
  ids: string[] = [];
  async trouverUnique(): Promise<MarqueUnique> {
    return this.ids.length === 0 ? { etat: 'aucune' } : this.ids.length === 1 ? { etat: 'une', id: this.ids[0]! } : { etat: 'plusieurs' };
  }
  async creer(): Promise<string> {
    const id = crypto.randomUUID();
    this.ids.push(id);
    return id;
  }
}

export class AuditMemoire implements Audit {
  readonly lignes: LigneAudit[] = [];
  async ajouter(marqueId: string, entree: EntreeAudit): Promise<void> {
    this.lignes.push(chainer(marqueId, entree, this.lignes.filter((l) => l.marqueId === marqueId).at(-1)?.hache, new Date()));
  }
}

export type BancDeTest = { services: Services; sessions: SessionsMemoire; marques: MarquesMemoire; audit: AuditMemoire; horloge: { t: number } };

export function creerServicesDeTest(oidc: Services['oidc'], options: Partial<Pick<Services, 'admin' | 'urlPublique' | 'verifierJetonMcp'>> = {}): BancDeTest {
  const horloge = { t: Date.now() };
  const sessions = new SessionsMemoire();
  sessions.maintenant = () => horloge.t;
  const marques = new MarquesMemoire();
  const audit = new AuditMemoire();
  const services: Services = {
    oidc,
    sessions,
    marques,
    audit,
    coffre: new Coffre(randomBytes(32)),
    cleAdresses: randomBytes(32),
    admin: options.admin ?? { sub: 'sub-benjamin', email: undefined },
    urlPublique: options.urlPublique ?? 'http://127.0.0.1:4321',
    verifierJetonMcp: options.verifierJetonMcp ?? (async () => false),
    maintenant: () => horloge.t,
  };
  return { services, sessions, marques, audit, horloge };
}
