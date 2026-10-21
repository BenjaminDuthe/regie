// Faux serveur de Meta (Instagram) sur 127.0.0.1 : rien ne sort vers Internet pendant les tests (histoires 7.1, 7.6, 7.3).
// Il garde chaque requête reçue (méthode, chemin, en-tête Authorization, corps) pour que les tests vérifient ce qui part.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AdressesInstagram } from '../src/publication/connecteur-instagram.ts';

export type RequeteMeta = Readonly<{ methode: string; chemin: string; requete: URLSearchParams; autorisation: string | undefined; corps: URLSearchParams }>;

export type ReglagesMeta = {
  secretValide: string;
  codeValide: string;
  compteExterne: string;
  jetonLong: string;
  expireDansS: number;
  quota: { utilise: number; total: number };
  /** Suite des `status_code` rendus au relevé du conteneur ; le dernier se répète. */
  etatsTraitement: string[];
  /** Statut forcé pour un chemin (ex. { '/v23.0/42/media_publish': 503 }). */
  statutsForces: Record<string, number>;
  /** Coupe la connexion sans réponse pour un chemin : simule une coupure après envoi. */
  couper: Set<string>;
  permalink: string | null;
};

export type FauxMeta = {
  adresses: AdressesInstagram;
  requetes: RequeteMeta[];
  reglages: ReglagesMeta;
  fermer: () => Promise<void>;
};

const lire = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    const morceaux: Buffer[] = [];
    req.on('data', (m: Buffer) => morceaux.push(m));
    req.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
  });

const json = (res: ServerResponse, statut: number, corps: unknown): void => {
  res.writeHead(statut, { 'content-type': 'application/json' });
  res.end(JSON.stringify(corps));
};

export async function demarrerFauxMeta(): Promise<FauxMeta> {
  const requetes: RequeteMeta[] = [];
  const reglages: ReglagesMeta = {
    secretValide: 'secret-valide-123',
    codeValide: 'code-valide',
    compteExterne: '17841400000000001',
    jetonLong: 'jeton-long-instagram',
    expireDansS: 5_184_000,
    quota: { utilise: 3, total: 100 },
    etatsTraitement: ['FINISHED'],
    statutsForces: {},
    couper: new Set(),
    permalink: 'https://www.instagram.com/reel/ABC123/',
  };
  let releves = 0;
  const serveur: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const corps = new URLSearchParams(await lire(req));
      const autorisation = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
      requetes.push({ methode: req.method ?? 'GET', chemin: url.pathname, requete: url.searchParams, autorisation, corps });
      if (reglages.couper.has(url.pathname)) return void req.socket.destroy();
      const force = reglages.statutsForces[url.pathname];
      if (force !== undefined) return json(res, force, { error: { message: 'forcé' } });
      const q = url.searchParams;
      if (url.pathname === '/fb/oauth/access_token') {
        return q.get('client_secret') === reglages.secretValide ? json(res, 200, { access_token: 'jeton-application', token_type: 'bearer' }) : json(res, 400, { error: { message: 'clé refusée' } });
      }
      if (url.pathname === '/oauth/access_token') {
        if (corps.get('client_secret') !== reglages.secretValide || corps.get('code') !== reglages.codeValide) return json(res, 400, { error_message: 'code refusé' });
        return json(res, 200, { access_token: 'jeton-court-instagram', user_id: Number(reglages.compteExterne) > 0 ? reglages.compteExterne : 1 });
      }
      if (url.pathname === '/v23.0/access_token') {
        return q.get('access_token') === 'jeton-court-instagram' && q.get('client_secret') === reglages.secretValide ? json(res, 200, { access_token: reglages.jetonLong, expires_in: reglages.expireDansS }) : json(res, 400, {});
      }
      if (autorisation !== `Bearer ${reglages.jetonLong}`) return json(res, 401, { error: { message: 'jeton refusé' } });
      if (url.pathname === '/v23.0/me') return json(res, 200, { username: 'compte_de_demo', user_id: reglages.compteExterne });
      if (url.pathname.endsWith('/content_publishing_limit')) return json(res, 200, { data: [{ quota_usage: reglages.quota.utilise, config: { quota_total: reglages.quota.total, quota_duration: 86400 } }] });
      if (url.pathname.endsWith('/media') && req.method === 'POST') return json(res, 200, { id: 'conteneur-1' });
      if (url.pathname === '/v23.0/conteneur-1') {
        const etat = reglages.etatsTraitement[Math.min(releves, reglages.etatsTraitement.length - 1)]!;
        releves += 1;
        return json(res, 200, { status_code: etat, id: 'conteneur-1' });
      }
      if (url.pathname.endsWith('/media_publish')) return json(res, 200, { id: 'media-9001' });
      if (url.pathname === '/v23.0/media-9001') return json(res, 200, reglages.permalink === null ? {} : { permalink: reglages.permalink });
      return json(res, 404, {});
    })();
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  return {
    adresses: { autorisation: `${base}/oauth/authorize`, jeton: `${base}/oauth/access_token`, graphe: `${base}/v23.0`, application: `${base}/fb/oauth/access_token` },
    requetes,
    reglages,
    fermer: () => new Promise<void>((ok) => (serveur.closeAllConnections(), serveur.close(() => ok()))),
  };
}
