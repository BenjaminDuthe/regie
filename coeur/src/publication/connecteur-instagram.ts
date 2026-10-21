// regie — connecteur Instagram (histoires 7.1, 7.3, 7.6) : « Instagram API with Instagram Login » (Meta). Aucune
// dépendance : `fetch` de Node. Les adresses du réseau sont injectables (les tests visent un faux serveur local) ; par
// défaut ce sont les hôtes déclarés dans deploiement/sorties-autorisees.json. Le jeton ne voyage que dans l'en-tête
// Authorization (sauf l'échange du jeton long, qui l'exige en paramètre : cette adresse n'est jamais journalisée).
// Rien ici n'a été vérifié contre le vrai réseau : voir docs/planning/ARBITRAGES.md (histoire 7.1).

import { ErreurReseau, type CleApplication, type ConnecteurReseau, type DemandePublication, type JetonObtenu, type QuotaReseau, type ResultatPublication } from './connecteur.ts';

export type AdressesInstagram = Readonly<{ autorisation: string; jeton: string; graphe: string; application: string }>;

export const ADRESSES_INSTAGRAM: AdressesInstagram = Object.freeze({
  autorisation: 'https://www.instagram.com/oauth/authorize',
  jeton: 'https://api.instagram.com/oauth/access_token',
  graphe: 'https://graph.instagram.com/v23.0',
  application: 'https://graph.facebook.com/oauth/access_token',
});

export type OptionsInstagram = Readonly<{
  adresses?: AdressesInstagram;
  /** Délai d'un appel avant abandon, en ms. */
  delaiMs?: number;
  /** Attente entre deux relevés de l'état du traitement de la vidéo, en ms (0 dans les tests). */
  pauseMs?: number;
  /** Nombre maximal de relevés de l'état du traitement. */
  relevesMax?: number;
}>;

/** Un jeton long d'Instagram vit 60 jours. */
const JETON_LONG_PAR_DEFAUT_S = 60 * 24 * 3600;

type Json = Record<string, unknown>;

export class ConnecteurInstagram implements ConnecteurReseau {
  readonly reseau = 'instagram' as const;
  readonly #a: AdressesInstagram;
  readonly #delaiMs: number;
  readonly #pauseMs: number;
  readonly #relevesMax: number;

  constructor(options: OptionsInstagram = {}) {
    this.#a = options.adresses ?? ADRESSES_INSTAGRAM;
    this.#delaiMs = options.delaiMs ?? 30_000;
    this.#pauseMs = options.pauseMs ?? 5_000;
    this.#relevesMax = options.relevesMax ?? 60;
  }

  urlAutorisation(p: Readonly<{ cle: CleApplication; state: string; redirectUri: string; portees: readonly string[] }>): string {
    const u = new URL(this.#a.autorisation);
    u.searchParams.set('client_id', p.cle.idApplication);
    u.searchParams.set('redirect_uri', p.redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', p.portees.join(','));
    u.searchParams.set('state', p.state);
    return u.toString();
  }

  async echangerCode(p: Readonly<{ cle: CleApplication; code: string; redirectUri: string; maintenant: Date }>): Promise<JetonObtenu> {
    const court = await this.#appeler(this.#a.jeton, {
      methode: 'POST',
      corps: new URLSearchParams({ client_id: p.cle.idApplication, client_secret: p.cle.secret, grant_type: 'authorization_code', redirect_uri: p.redirectUri, code: p.code }),
      cause: 'RESEAU_CODE_REFUSE',
    });
    const jetonCourt = texte(court['access_token']);
    const compteExterne = texte(court['user_id']) ?? (typeof court['user_id'] === 'number' ? String(court['user_id']) : undefined);
    if (jetonCourt === undefined || compteExterne === undefined) throw new ErreurReseau('RESEAU_REPONSE_INVALIDE', true);
    const url = new URL(`${this.#a.graphe}/access_token`);
    url.searchParams.set('grant_type', 'ig_exchange_token');
    url.searchParams.set('client_secret', p.cle.secret);
    url.searchParams.set('access_token', jetonCourt);
    const long = await this.#appeler(url.toString(), { methode: 'GET', cause: 'RESEAU_CODE_REFUSE' });
    const jeton = texte(long['access_token']);
    if (jeton === undefined) throw new ErreurReseau('RESEAU_REPONSE_INVALIDE', true);
    const duree = typeof long['expires_in'] === 'number' && long['expires_in'] > 0 ? long['expires_in'] : JETON_LONG_PAR_DEFAUT_S;
    const moi = await this.#appeler(`${this.#a.graphe}/me?fields=username`, { methode: 'GET', jeton, cause: 'RESEAU_REFUSE' });
    return { jeton, expireLe: new Date(p.maintenant.getTime() + duree * 1000), compteExterne, nom: texte(moi['username']) ?? compteExterne };
  }

  async tester(cle: CleApplication): Promise<void> {
    const url = new URL(this.#a.application);
    url.searchParams.set('client_id', cle.idApplication);
    url.searchParams.set('client_secret', cle.secret);
    url.searchParams.set('grant_type', 'client_credentials');
    const r = await this.#appeler(url.toString(), { methode: 'GET', cause: 'RESEAU_CLE_REFUSEE' });
    if (texte(r['access_token']) === undefined) throw new ErreurReseau('RESEAU_CLE_REFUSEE', true);
  }

  async quota(p: Readonly<{ jeton: string; compteExterne: string }>): Promise<QuotaReseau> {
    const r = await this.#appeler(`${this.#a.graphe}/${encodeURIComponent(p.compteExterne)}/content_publishing_limit?fields=quota_usage,config`, { methode: 'GET', jeton: p.jeton, cause: 'RESEAU_REFUSE' });
    const ligne = Array.isArray(r['data']) ? (r['data'][0] as Json | undefined) : undefined;
    const config = (ligne?.['config'] ?? {}) as Json;
    const utilise = ligne?.['quota_usage'];
    const total = config['quota_total'];
    if (typeof utilise !== 'number' || typeof total !== 'number') throw new ErreurReseau('RESEAU_REPONSE_INVALIDE', false);
    return { utilise, total };
  }

  async publier(d: DemandePublication): Promise<ResultatPublication> {
    const compte = encodeURIComponent(d.compteExterne);
    const conteneur = await this.#appeler(`${this.#a.graphe}/${compte}/media`, {
      methode: 'POST',
      jeton: d.jeton,
      signal: d.signal,
      corps: new URLSearchParams({ media_type: 'REELS', video_url: d.urlVideo, caption: d.legende }),
      cause: 'RESEAU_REFUSE',
    });
    const idConteneur = texte(conteneur['id']);
    if (idConteneur === undefined) throw new ErreurReseau('RESEAU_REPONSE_INVALIDE', false);
    for (let i = 0; ; i += 1) {
      const etat = await this.#appeler(`${this.#a.graphe}/${encodeURIComponent(idConteneur)}?fields=status_code`, { methode: 'GET', jeton: d.jeton, signal: d.signal, cause: 'RESEAU_REFUSE' });
      const code = texte(etat['status_code']);
      if (code === 'FINISHED') break;
      if (code === 'ERROR' || code === 'EXPIRED') throw new ErreurReseau('RESEAU_VIDEO_REFUSEE', true);
      if (i + 1 >= this.#relevesMax) throw new ErreurReseau('RESEAU_TRAITEMENT_LONG', false);
      await new Promise((r) => setTimeout(r, this.#pauseMs));
    }
    const media = await this.#appeler(`${this.#a.graphe}/${compte}/media_publish`, {
      methode: 'POST',
      jeton: d.jeton,
      signal: d.signal,
      corps: new URLSearchParams({ creation_id: idConteneur }),
      cause: 'RESEAU_REFUSE',
    });
    const idExterne = texte(media['id']);
    if (idExterne === undefined) throw new ErreurReseau('RESEAU_REPONSE_INVALIDE', false);
    const lien = await this.#appeler(`${this.#a.graphe}/${encodeURIComponent(idExterne)}?fields=permalink`, { methode: 'GET', jeton: d.jeton, signal: d.signal, cause: 'RESEAU_REFUSE' }).catch(() => ({}) as Json);
    return { idExterne, lien: lienSur(texte(lien['permalink'])) ?? 'https://www.instagram.com/' };
  }

  /** Un appel : toute panne devient une `ErreurReseau` sans donnée du réseau ; 4xx = définitif, 5xx et coupure = à revoir. */
  async #appeler(url: string, o: Readonly<{ methode: 'GET' | 'POST'; jeton?: string | undefined; corps?: URLSearchParams | undefined; signal?: AbortSignal | undefined; cause: string }>): Promise<Json> {
    const signaux = [AbortSignal.timeout(this.#delaiMs), ...(o.signal === undefined ? [] : [o.signal])];
    let reponse: Response;
    try {
      reponse = await fetch(url, {
        method: o.methode,
        headers: { ...(o.jeton === undefined ? {} : { authorization: `Bearer ${o.jeton}` }), accept: 'application/json' },
        ...(o.corps === undefined ? {} : { body: o.corps }),
        signal: AbortSignal.any(signaux),
        redirect: 'error',
      });
    } catch {
      throw new ErreurReseau('RESEAU_INJOIGNABLE', false);
    }
    if (reponse.status === 401 || reponse.status === 403) throw new ErreurReseau(o.jeton === undefined ? o.cause : 'RESEAU_JETON_REFUSE', true);
    if (reponse.status === 429) throw new ErreurReseau('RESEAU_QUOTA_ATTEINT', false);
    if (reponse.status >= 500) throw new ErreurReseau('RESEAU_INJOIGNABLE', false);
    if (reponse.status >= 400) throw new ErreurReseau(o.cause, true);
    try {
      const corps: unknown = await reponse.json();
      return typeof corps === 'object' && corps !== null && !Array.isArray(corps) ? (corps as Json) : {};
    } catch {
      throw new ErreurReseau('RESEAU_REPONSE_INVALIDE', false);
    }
  }
}

const texte = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Un lien rendu par le réseau n'est affiché que s'il est en https. */
const lienSur = (v: string | undefined): string | undefined => {
  if (v === undefined) return undefined;
  try {
    return new URL(v).protocol === 'https:' ? v : undefined;
  } catch {
    return undefined;
  }
};
