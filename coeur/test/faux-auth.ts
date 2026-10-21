// Doubles de test de la connexion (histoire 1.14) : un faux fournisseur OIDC qui écoute sur la machine locale,
// avec des clés RSA et EC générées à la volée, et des magasins en mémoire. Rien ne sort de la machine.

import { createHash, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Services } from '../src/auth/services.ts';
import { chainer, type Audit, type EntreeAudit, type LigneAudit } from '../src/infra/audit.ts';
import { GABARIT_DE_DEPART, NOM_GABARIT_DE_DEPART, type DefinitionGabarit } from '../src/domaine/gabarit.ts';
import { NomApplicationPris, type Application, type Applications, type ChampsApplication } from '../src/infra/applications.ts';
import type { Gabarit, Gabarits } from '../src/infra/gabarits.ts';
import { idUtilisateur, trierEspaces, type Espace, type Espaces } from '../src/infra/espaces.ts';
import { DUREE_MAX_JETON_JOURS, composerJeton, hacherJeton, marqueDuJeton, type JetonApi, type JetonsApi, type NouveauJeton, type Principal } from '../src/infra/jetons.ts';
import { ACCES_VIE_S, CONNEXION_VIE_MAX_JOURS, CLIENTS_MAX, CODE_VIE_S, REFRESH_VIE_JOURS, composerIdentifiantClient, composerSecret, marqueDuClient, marqueDuSecret, type ClientOauth, type CodeConsomme, type ConnexionClaude, type Emission, type NouveauCode, type Oauth, type Rafraichissement } from '../src/infra/oauth.ts';
import { Coffre } from '../src/infra/coffre.ts';
import { FileMemoire } from './faux-file.ts';
import { NotificationsMemoire } from './faux-notifications.ts';
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
  readonly lignes = new Map<string, { marqueId: string; sub: string; email: string | undefined; authentifieLe: Date; expireLe: Date; revoquee: boolean; espaceActifId: string | undefined }>();
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
      espaceActifId: nouvelle.espaceActifId,
    });
    return composerCookie(nouvelle.marqueId, identifiant);
  }

  async trouver(valeur: string): Promise<Session | undefined> {
    const cookie = decomposerCookie(valeur);
    const ligne = cookie === undefined ? undefined : this.lignes.get(hacherIdentifiant(cookie.identifiant).toString('hex'));
    if (cookie === undefined || ligne === undefined || ligne.marqueId !== cookie.marqueId || ligne.revoquee || ligne.expireLe.getTime() <= this.maintenant()) return undefined;
    return { marqueId: ligne.marqueId, sub: ligne.sub, email: ligne.email, authentifieLe: ligne.authentifieLe, expireLe: ligne.expireLe, espaceActifId: ligne.espaceActifId };
  }

  async revoquer(valeur: string): Promise<boolean> {
    const session = await this.trouver(valeur);
    const cookie = decomposerCookie(valeur);
    if (session === undefined || cookie === undefined) return false;
    this.lignes.get(hacherIdentifiant(cookie.identifiant).toString('hex'))!.revoquee = true;
    return true;
  }

  async changerEspace(valeur: string, espaceId: string): Promise<boolean> {
    const cookie = decomposerCookie(valeur);
    if ((await this.trouver(valeur)) === undefined || cookie === undefined) return false;
    this.lignes.get(hacherIdentifiant(cookie.identifiant).toString('hex'))!.espaceActifId = espaceId;
    return true;
  }
}

/** Utilisateurs et espaces en mémoire : chaque personne ne voit que les siens, comme la RLS. */
export class EspacesMemoire implements Espaces {
  readonly tous: Espace[] = [];
  async assurer(marqueId: string, sub: string, _email: string | undefined, nomMarque: string) {
    const utilisateurId = idUtilisateur(marqueId, sub);
    const crees: Espace[] = [];
    for (const [genre, nom] of [['personnel', 'Espace personnel'], ['marque', nomMarque]] as const) {
      if (this.tous.some((e) => e.proprietaireId === utilisateurId && e.genre === genre)) continue;
      const espace: Espace = { id: crypto.randomUUID(), marqueId, proprietaireId: utilisateurId, genre, nom };
      this.tous.push(espace);
      crees.push(espace);
    }
    return { utilisateurId, espaces: await this.lister(marqueId, sub), crees };
  }
  async lister(marqueId: string, sub: string): Promise<Espace[]> {
    const utilisateurId = idUtilisateur(marqueId, sub);
    return trierEspaces(this.tous.filter((e) => e.marqueId === marqueId && e.proprietaireId === utilisateurId));
  }
}

/** Gabarits en mémoire : même contrat que GabaritsPg (départ donné au premier accès, cloisonnement par espace de la personne). */
export class GabaritsMemoire implements Gabarits {
  readonly lignes: (Gabarit & { marqueId: string })[] = [];
  maintenant = () => Date.now();
  readonly #espaces: EspacesMemoire;
  constructor(espaces: EspacesMemoire) {
    this.#espaces = espaces;
  }
  #visibles(marqueId: string, utilisateurId: string): string[] {
    return this.#espaces.tous.filter((e) => e.marqueId === marqueId && e.proprietaireId === utilisateurId).map((e) => e.id);
  }
  async lister(marqueId: string, utilisateurId: string, espaceId?: string) {
    const ids = this.#visibles(marqueId, utilisateurId);
    for (const id of ids) {
      if (!this.lignes.some((l) => l.espaceId === id)) {
        const t = new Date(this.maintenant());
        this.lignes.push({ id: crypto.randomUUID(), marqueId, espaceId: id, nom: NOM_GABARIT_DE_DEPART, definition: structuredClone(GABARIT_DE_DEPART), parDefaut: true, version: 1, creeLe: t, modifieLe: t });
      }
    }
    return this.lignes.filter((l) => l.marqueId === marqueId && ids.includes(l.espaceId) && (espaceId === undefined || l.espaceId === espaceId));
  }
  async lire(marqueId: string, utilisateurId: string, id: string) {
    const ids = this.#visibles(marqueId, utilisateurId);
    return this.lignes.find((l) => l.id === id && l.marqueId === marqueId && ids.includes(l.espaceId));
  }
  async creer(n: { marqueId: string; utilisateurId: string; espaceId: string; nom: string; definition: DefinitionGabarit }) {
    if (!this.#visibles(n.marqueId, n.utilisateurId).includes(n.espaceId)) return undefined;
    const t = new Date(this.maintenant());
    const g = { id: crypto.randomUUID(), marqueId: n.marqueId, espaceId: n.espaceId, nom: n.nom, definition: structuredClone(n.definition), parDefaut: false, version: 1, creeLe: t, modifieLe: t };
    this.lignes.push(g);
    return g;
  }
  async remplacer(marqueId: string, utilisateurId: string, id: string, c: { nom?: string; definition: DefinitionGabarit }) {
    const i = this.lignes.findIndex((l) => l.id === id && l.marqueId === marqueId && this.#visibles(marqueId, utilisateurId).includes(l.espaceId));
    if (i < 0) return undefined;
    const avant = this.lignes[i]!;
    const apres = { ...avant, nom: c.nom ?? avant.nom, definition: structuredClone(c.definition), version: avant.version + 1, modifieLe: new Date(this.maintenant()) };
    this.lignes[i] = apres;
    return apres;
  }
}

/** Jetons d'API en mémoire : même contrat que JetonsApiPg (haché seul gardé, expiration, révocation, cloisonnement). */
export class JetonsMemoire implements JetonsApi {
  readonly lignes: (JetonApi & { marqueId: string; utilisateurId: string; sub: string; hache: string })[] = [];
  maintenant = () => Date.now();
  async creer(n: NouveauJeton) {
    if (n.dureeJours < 1 || n.dureeJours > DUREE_MAX_JETON_JOURS) throw new Error('durée hors limites');
    const clair = composerJeton(n.marqueId);
    const cree = this.maintenant();
    const jeton: JetonApi = { id: crypto.randomUUID(), nom: n.nom, portees: n.portees, espaceIds: n.espaceIds, creeLe: new Date(cree), expireLe: new Date(cree + n.dureeJours * 86_400_000), revoqueLe: undefined };
    this.lignes.push({ ...jeton, marqueId: n.marqueId, utilisateurId: n.utilisateurId, sub: n.sub, hache: hacherJeton(clair).toString('hex') });
    return { jeton, clair };
  }
  async lister(marqueId: string, utilisateurId: string) {
    return this.lignes.filter((l) => l.marqueId === marqueId && l.utilisateurId === utilisateurId).sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime());
  }
  async revoquer(marqueId: string, utilisateurId: string, jetonId: string) {
    const ligne = this.lignes.find((l) => l.id === jetonId && l.marqueId === marqueId && l.utilisateurId === utilisateurId && l.revoqueLe === undefined);
    if (ligne === undefined) return false;
    (ligne as { revoqueLe: Date | undefined }).revoqueLe = new Date(this.maintenant());
    return true;
  }
  async authentifier(clair: string): Promise<Principal | undefined> {
    const marqueId = marqueDuJeton(clair);
    const ligne = marqueId === undefined ? undefined : this.lignes.find((l) => l.hache === hacherJeton(clair).toString('hex'));
    if (marqueId === undefined || ligne === undefined || ligne.marqueId !== marqueId || ligne.revoqueLe !== undefined || ligne.expireLe.getTime() <= this.maintenant()) return undefined;
    return { marqueId, utilisateurId: ligne.utilisateurId, sub: ligne.sub, jetonId: ligne.id, portees: ligne.portees, espaceIds: ligne.espaceIds };
  }
}

/** OAuth en mémoire : même contrat que OauthPg (usage unique du code, rotation du refresh, révocation, cloisonnement). */
export class OauthMemoire implements Oauth {
  readonly clients: ClientOauth[] = [];
  readonly codes = new Map<string, NouveauCode & { expireLe: number; utilise: boolean }>();
  readonly connexions: { id: string; marqueId: string; clientId: string; utilisateurId: string; sub: string; portees: NouveauCode['portees']; espaceIds: readonly string[]; creeLe: number; revoqueLe: number | undefined; acces: string; accesExpireLe: number; refresh: string; refreshPrecedent: string | undefined; refreshExpireLe: number }[] = [];
  maintenant = () => Date.now();

  async enregistrerClient(marqueId: string, c: Readonly<{ nom: string; redirectUris: readonly string[] }>) {
    if (this.clients.filter((k) => k.marqueId === marqueId).length >= CLIENTS_MAX) return undefined;
    const client: ClientOauth = { clientId: composerIdentifiantClient(marqueId), marqueId, nom: c.nom, redirectUris: c.redirectUris };
    this.clients.push(client);
    return client;
  }
  async trouverClient(clientId: string) {
    return marqueDuClient(clientId) === undefined ? undefined : this.clients.find((k) => k.clientId === clientId);
  }
  async emettreCode(n: NouveauCode) {
    const clair = composerSecret('oac', n.marqueId);
    this.codes.set(hacherJeton(clair).toString('hex'), { ...n, expireLe: this.maintenant() + CODE_VIE_S * 1000, utilise: false });
    return clair;
  }
  async consommerCode(clair: string): Promise<CodeConsomme | undefined> {
    const marqueId = marqueDuSecret('oac', clair);
    const c = marqueId === undefined ? undefined : this.codes.get(hacherJeton(clair).toString('hex'));
    if (c === undefined || c.utilise || c.expireLe <= this.maintenant() || c.marqueId !== marqueId) return undefined;
    c.utilise = true;
    const { expireLe: _e, utilise: _u, ...reste } = c;
    return reste;
  }
  async ouvrirConnexion(code: CodeConsomme): Promise<Emission> {
    const acces = composerSecret('oat', code.marqueId);
    const refresh = composerSecret('ort', code.marqueId);
    const t = this.maintenant();
    const id = crypto.randomUUID();
    this.connexions.push({ id, marqueId: code.marqueId, clientId: code.clientId, utilisateurId: code.utilisateurId, sub: code.sub, portees: code.portees, espaceIds: code.espaceIds, creeLe: t, revoqueLe: undefined, acces, accesExpireLe: t + ACCES_VIE_S * 1000, refresh, refreshPrecedent: undefined, refreshExpireLe: t + REFRESH_VIE_JOURS * 86_400_000 });
    return { connexionId: id, acces, refresh, accesExpireDans: ACCES_VIE_S, portees: code.portees, espaceIds: code.espaceIds };
  }
  async rafraichir(refresh: string, clientId: string): Promise<Rafraichissement> {
    const marqueId = marqueDuSecret('ort', refresh);
    const c = marqueId === undefined ? undefined : this.connexions.find((x) => x.marqueId === marqueId && (x.refresh === refresh || x.refreshPrecedent === refresh));
    if (c === undefined || c.clientId !== clientId || c.revoqueLe !== undefined) return { etat: 'invalide' };
    if (c.refresh !== refresh) {
      c.revoqueLe = this.maintenant();
      return { etat: 'reutilise', marqueId: c.marqueId, sub: c.sub, connexionId: c.id };
    }
    const t = this.maintenant();
    if (c.refreshExpireLe <= t) return { etat: 'invalide' };
    c.acces = composerSecret('oat', c.marqueId);
    c.accesExpireLe = t + ACCES_VIE_S * 1000;
    c.refreshPrecedent = c.refresh;
    c.refresh = composerSecret('ort', c.marqueId);
    c.refreshExpireLe = Math.min(t + REFRESH_VIE_JOURS * 86_400_000, c.creeLe + CONNEXION_VIE_MAX_JOURS * 86_400_000);
    return { etat: 'ok', emission: { connexionId: c.id, acces: c.acces, refresh: c.refresh, accesExpireDans: ACCES_VIE_S, portees: c.portees, espaceIds: c.espaceIds } };
  }
  async authentifierAcces(clair: string): Promise<Principal | undefined> {
    const marqueId = marqueDuSecret('oat', clair);
    const c = marqueId === undefined ? undefined : this.connexions.find((x) => x.marqueId === marqueId && x.acces === clair);
    const t = this.maintenant();
    if (c === undefined || c.revoqueLe !== undefined || c.accesExpireLe <= t || c.refreshExpireLe <= t) return undefined;
    return { marqueId: c.marqueId, utilisateurId: c.utilisateurId, sub: c.sub, jetonId: c.id, portees: c.portees, espaceIds: c.espaceIds };
  }
  async lister(marqueId: string, utilisateurId: string): Promise<ConnexionClaude[]> {
    return this.connexions
      .filter((x) => x.marqueId === marqueId && x.utilisateurId === utilisateurId)
      .sort((a, b) => b.creeLe - a.creeLe)
      .map((x) => ({ id: x.id, clientNom: this.clients.find((k) => k.clientId === x.clientId)?.nom ?? '', portees: x.portees, espaceIds: x.espaceIds, creeLe: new Date(x.creeLe), expireLe: new Date(x.refreshExpireLe), revoqueLe: x.revoqueLe === undefined ? undefined : new Date(x.revoqueLe) }));
  }
  async revoquer(marqueId: string, utilisateurId: string, connexionId: string) {
    const c = this.connexions.find((x) => x.id === connexionId && x.marqueId === marqueId && x.utilisateurId === utilisateurId && x.revoqueLe === undefined);
    if (c === undefined) return false;
    c.revoqueLe = this.maintenant();
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
  async lister(): Promise<string[]> {
    return [...this.ids];
  }
}

export class AuditMemoire implements Audit {
  readonly lignes: LigneAudit[] = [];
  async ajouter(marqueId: string, entree: EntreeAudit): Promise<void> {
    this.lignes.push(chainer(marqueId, entree, this.lignes.filter((l) => l.marqueId === marqueId).at(-1)?.hache, new Date()));
  }
  async lire(marqueId: string): Promise<LigneAudit[]> {
    return this.lignes.filter((l) => l.marqueId === marqueId);
  }
}

/** Applications en mémoire : même contrat que ApplicationsPg (cloisonnement par espace de la personne, nom unique par espace). */
export class ApplicationsMemoire implements Applications {
  readonly lignes: (Application & { marqueId: string })[] = [];
  maintenant = () => Date.now();
  readonly #espaces: EspacesMemoire;
  constructor(espaces: EspacesMemoire) {
    this.#espaces = espaces;
  }
  #visibles(marqueId: string, utilisateurId: string): string[] {
    return this.#espaces.tous.filter((e) => e.marqueId === marqueId && e.proprietaireId === utilisateurId).map((e) => e.id);
  }
  async lister(marqueId: string, utilisateurId: string, espaceId?: string) {
    const ids = this.#visibles(marqueId, utilisateurId);
    return this.lignes.filter((l) => l.marqueId === marqueId && ids.includes(l.espaceId) && (espaceId === undefined || l.espaceId === espaceId));
  }
  async lire(marqueId: string, utilisateurId: string, id: string) {
    const ids = this.#visibles(marqueId, utilisateurId);
    return this.lignes.find((l) => l.id === id && l.marqueId === marqueId && ids.includes(l.espaceId));
  }
  async creer(n: { marqueId: string; utilisateurId: string; espaceId: string } & ChampsApplication) {
    if (!this.#visibles(n.marqueId, n.utilisateurId).includes(n.espaceId)) return undefined;
    if (this.lignes.some((l) => l.espaceId === n.espaceId && l.nom === n.nom)) throw new NomApplicationPris();
    const t = new Date(this.maintenant());
    const a = { id: crypto.randomUUID(), marqueId: n.marqueId, espaceId: n.espaceId, nom: n.nom, accueil: n.accueil, hotes: [...n.hotes], version: 1, creeLe: t, modifieLe: t };
    this.lignes.push(a);
    return a;
  }
  async remplacer(marqueId: string, utilisateurId: string, id: string, c: ChampsApplication) {
    const i = this.lignes.findIndex((l) => l.id === id && l.marqueId === marqueId && this.#visibles(marqueId, utilisateurId).includes(l.espaceId));
    if (i < 0) return undefined;
    const avant = this.lignes[i]!;
    if (this.lignes.some((l) => l.id !== id && l.espaceId === avant.espaceId && l.nom === c.nom)) throw new NomApplicationPris();
    const apres = { ...avant, nom: c.nom, accueil: c.accueil, hotes: [...c.hotes], version: avant.version + 1, modifieLe: new Date(this.maintenant()) };
    this.lignes[i] = apres;
    return apres;
  }
}

export type BancDeTest = { services: Services; applications: ApplicationsMemoire; gabarits: GabaritsMemoire; file: FileMemoire; sessions: SessionsMemoire; marques: MarquesMemoire; espaces: EspacesMemoire; audit: AuditMemoire; jetons: JetonsMemoire; oauth: OauthMemoire; notifications: NotificationsMemoire; horloge: { t: number } };

export function creerServicesDeTest(oidc: Services['oidc'], options: Partial<Pick<Services, 'admin' | 'urlPublique'>> = {}): BancDeTest {
  const horloge = { t: Date.now() };
  const sessions = new SessionsMemoire();
  sessions.maintenant = () => horloge.t;
  const marques = new MarquesMemoire();
  const espaces = new EspacesMemoire();
  const audit = new AuditMemoire();
  const jetons = new JetonsMemoire();
  jetons.maintenant = () => horloge.t;
  const oauth = new OauthMemoire();
  oauth.maintenant = () => horloge.t;
  const file = new FileMemoire();
  file.maintenant = () => horloge.t;
  const gabarits = new GabaritsMemoire(espaces);
  gabarits.maintenant = () => horloge.t;
  const applications = new ApplicationsMemoire(espaces);
  applications.maintenant = () => horloge.t;
  const notifications = new NotificationsMemoire();
  notifications.maintenant = () => horloge.t;
  file.surEchec = notifications.surEchec;
  const services: Services = {
    oidc,
    sessions,
    marques,
    espaces,
    audit,
    coffre: new Coffre(randomBytes(32)),
    cleAdresses: randomBytes(32),
    admin: options.admin ?? { sub: 'sub-benjamin', email: undefined },
    urlPublique: options.urlPublique ?? 'http://127.0.0.1:4321',
    jetons,
    oauth,
    file,
    notifications,
    gabarits,
    applications,
    maintenant: () => horloge.t,
  };
  return { services, applications, gabarits, file, notifications, sessions, marques, espaces, audit, jetons, oauth, horloge };
}
