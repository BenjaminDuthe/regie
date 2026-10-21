// regie — regie joue le serveur d'autorisation OAuth 2.1 de Claude (histoire 1.12, FR-46, AR-13).
// PKCE S256 obligatoire, enregistrement dynamique de clients publics borné (RFC 7591), paramètre `iss` dans la
// réponse (RFC 9207), jeton d'accès court, rafraîchissement tournant. Pas de CIMD (appel sortant vers l'adresse du
// client) : voir ARBITRAGES.md. Ce fichier ne touche ni fastify ni Astro : les routes l'appellent.

import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import chaines from '../chaines.json' with { type: 'json' };
import type { ClientOauth, Emission } from '../infra/oauth.ts';
import type { Portee } from '../infra/jetons.ts';
import type { Services } from './services.ts';

/** Ce que regie sait accorder : les deux portées des jetons d'API. */
export const PORTEES_OAUTH: readonly Portee[] = Object.freeze(['lecture', 'ecriture']);

const ERREURS = chaines.oauth.erreurs as Record<string, string>;
export type Resultat = Readonly<{ statut: number; corps: Record<string, unknown> }>;
const erreurOauth = (statut: number, code: string, description = ERREURS[code]): Resultat => ({ statut, corps: { error: code, error_description: description } });

/** L'adresse de regie, sans chemin : l'`issuer` du serveur d'autorisation. `undefined` tant qu'elle n'est pas réglée. */
export function emetteur(services: Pick<Services, 'urlPublique'>): string | undefined {
  return services.urlPublique === undefined ? undefined : new URL(services.urlPublique).origin;
}

export function metadonneesRessource(base: string): Record<string, unknown> {
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: [...PORTEES_OAUTH],
    resource_name: 'regie',
  };
}

export function metadonneesServeur(base: string): Record<string, unknown> {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/autoriser`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...PORTEES_OAUTH],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: false,
  };
}

// --- Enregistrement dynamique (RFC 7591) -----------------------------------------------------------------------------

const HOTES_BOUCLE_LOCALE = new Set(['127.0.0.1', '[::1]', 'localhost']);

/** Adresse de retour acceptée : https, ou http sur la boucle locale (RFC 8252) ; ni identifiants, ni fragment. */
export function redirectionValide(valeur: string): boolean {
  if (valeur.length > 512) return false;
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return false;
  }
  if (url.hash !== '' || url.username !== '' || url.password !== '' || valeur.includes('#')) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && HOTES_BOUCLE_LOCALE.has(url.hostname);
}

/** Correspondance exacte ; sur la boucle locale le port peut varier (le client ouvre un port libre). */
export function redirectionAutorisee(client: Pick<ClientOauth, 'redirectUris'>, demandee: string): boolean {
  if (client.redirectUris.includes(demandee)) return true;
  if (!redirectionValide(demandee)) return false;
  const d = new URL(demandee);
  if (d.protocol !== 'http:') return false;
  return client.redirectUris.some((enregistree) => {
    const e = new URL(enregistree);
    return e.protocol === 'http:' && e.hostname === d.hostname && e.pathname === d.pathname && e.search === d.search;
  });
}

const SANS_CONTROLE = (s: string) => !/[\u0000-\u001f\u007f]/.test(s);
const entreeEnregistrement = z.looseObject({
  client_name: z.string().trim().min(1).max(80).refine(SANS_CONTROLE).optional(),
  redirect_uris: z.array(z.string()).min(1).max(5),
  token_endpoint_auth_method: z.literal('none').optional(),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).min(1).optional(),
  response_types: z.array(z.literal('code')).min(1).optional(),
});

export async function enregistrerClient(services: Services, corps: unknown): Promise<Resultat> {
  const lecture = entreeEnregistrement.safeParse(corps);
  if (!lecture.success || !lecture.data.redirect_uris.every(redirectionValide)) return erreurOauth(400, 'invalid_client_metadata');
  const marque = await services.marques.trouverUnique();
  if (marque.etat !== 'une') return erreurOauth(503, 'temporarily_unavailable');
  const nom = lecture.data.client_name ?? chaines.oauth.clientSansNom;
  const redirectUris = [...new Set(lecture.data.redirect_uris)];
  const client = await services.oauth.enregistrerClient(marque.id, { nom, redirectUris });
  if (client === undefined) return erreurOauth(429, 'temporarily_unavailable');
  return {
    statut: 201,
    corps: {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(services.maintenant() / 1000),
      client_name: client.nom,
      redirect_uris: [...client.redirectUris],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  };
}

// --- Demande d'autorisation ------------------------------------------------------------------------------------------

export type Demande = Readonly<{
  client: ClientOauth;
  redirectUri: string;
  codeChallenge: string;
  state: string | undefined;
  /** La portée la plus large que Claude a demandée (« ecriture » si elle figure dans `scope`). */
  porteeDemandee: Portee;
}>;

export type Analyse =
  | Readonly<{ etat: 'ok'; demande: Demande }>
  /** Client ou adresse de retour inconnus : on n'ose pas rediriger, on l'explique sur la page. */
  | Readonly<{ etat: 'page'; cle: 'client_inconnu' | 'redirection_refusee' }>
  | Readonly<{ etat: 'redirection'; redirectUri: string; state: string | undefined; erreur: string }>;

const FORME_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export async function analyserDemande(services: Services, params: URLSearchParams): Promise<Analyse> {
  const clientId = params.get('client_id') ?? '';
  const client = clientId === '' ? undefined : await services.oauth.trouverClient(clientId);
  if (client === undefined) return { etat: 'page', cle: 'client_inconnu' };
  const fournie = params.get('redirect_uri');
  const redirectUri = fournie ?? (client.redirectUris.length === 1 ? client.redirectUris[0]! : undefined);
  if (redirectUri === undefined || !redirectionAutorisee(client, redirectUri)) return { etat: 'page', cle: 'redirection_refusee' };
  const state = params.get('state') ?? undefined;
  const refus = (erreur: string): Analyse => ({ etat: 'redirection', redirectUri, state, erreur });
  if (state !== undefined && state.length > 512) return refus('invalid_request');
  if (params.get('response_type') !== 'code') return refus('unsupported_response_type');
  const codeChallenge = params.get('code_challenge') ?? '';
  if (!FORME_CHALLENGE.test(codeChallenge) || params.get('code_challenge_method') !== 'S256') return refus('invalid_request');
  const portees = (params.get('scope') ?? '').split(/\s+/);
  return { etat: 'ok', demande: { client, redirectUri, codeChallenge, state, porteeDemandee: portees.includes('ecriture') ? 'ecriture' : 'lecture' } };
}

/** Adresse de retour vers Claude, avec le code (ou l'erreur), `state` et `iss` (RFC 9207). */
export function adresseDeRetour(redirectUri: string, base: string, resultat: Readonly<{ code: string } | { erreur: string }>, state: string | undefined): string {
  const url = new URL(redirectUri);
  if ('code' in resultat) url.searchParams.set('code', resultat.code);
  else url.searchParams.set('error', resultat.erreur);
  if (state !== undefined) url.searchParams.set('state', state);
  url.searchParams.set('iss', base);
  return url.toString();
}

// --- Point d'accès des jetons ----------------------------------------------------------------------------------------

/** PKCE S256 : base64url(SHA-256(verifier)) doit être égal au challenge, comparé à temps constant. */
export function verifierPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const attendu = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const recu = Buffer.from(challenge);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

const reponseJeton = (e: Emission): Resultat => ({
  statut: 200,
  corps: { access_token: e.acces, token_type: 'Bearer', expires_in: e.accesExpireDans, refresh_token: e.refresh, scope: e.portees.join(' ') },
});

export async function traiterToken(services: Services, params: URLSearchParams): Promise<Resultat> {
  const type = params.get('grant_type');
  const clientId = params.get('client_id') ?? '';
  if (type !== 'authorization_code' && type !== 'refresh_token') return erreurOauth(400, 'unsupported_grant_type');
  const client = clientId === '' ? undefined : await services.oauth.trouverClient(clientId);
  if (client === undefined) return erreurOauth(400, 'invalid_client');

  if (type === 'refresh_token') {
    const refresh = params.get('refresh_token') ?? '';
    if (refresh === '') return erreurOauth(400, 'invalid_request');
    const resultat = await services.oauth.rafraichir(refresh, client.clientId);
    if (resultat.etat === 'reutilise') {
      await services.audit.ajouter(resultat.marqueId, { acteur: resultat.sub, action: 'connexion_revoquee', objet: `connexion:${resultat.connexionId}`, details: { origine: 'mcp', pat: resultat.connexionId, motif: 'reutilisation' } });
      return erreurOauth(400, 'invalid_grant');
    }
    return resultat.etat === 'ok' ? reponseJeton(resultat.emission) : erreurOauth(400, 'invalid_grant');
  }

  const code = params.get('code') ?? '';
  const verifier = params.get('code_verifier') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  if (code === '' || verifier === '' || redirectUri === '') return erreurOauth(400, 'invalid_request');
  const consomme = await services.oauth.consommerCode(code);
  if (consomme === undefined || consomme.clientId !== client.clientId || consomme.redirectUri !== redirectUri || !verifierPkce(verifier, consomme.codeChallenge)) {
    return erreurOauth(400, 'invalid_grant');
  }
  const emission = await services.oauth.ouvrirConnexion(consomme);
  await services.audit.ajouter(consomme.marqueId, {
    acteur: consomme.sub,
    action: 'connexion_ouverte',
    objet: `connexion:${emission.connexionId}`,
    details: { origine: 'mcp', pat: emission.connexionId, client: client.nom },
  });
  return reponseJeton(emission);
}
