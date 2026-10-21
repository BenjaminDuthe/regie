// regie — proxy de sortie de la capture (histoire 4.2, AD-10). Un serveur CONNECT minimal :
//  - le laissez-passer (Proxy-Authorization, signé par le cœur) fixe les hôtes joignables pour UNE tâche ;
//  - seul le port 443 est ouvert, seuls des NOMS d'hôte déclarés passent (jamais une adresse IP, jamais un joker) ;
//  - le proxy résout LUI-MÊME le nom, refuse si UNE adresse résolue est privée, de bouclage, de lien local, CGNAT, ULA,
//    IPv4 mappée ou celle du foyer, puis se connecte À L'ADRESSE VALIDÉE : le nom n'est jamais re-résolu (anti-rebinding) ;
//  - toute décision est tracée avant le tunnel ; si la trace échoue, la connexion est refusée (fail-closed) ;
//  - aucune requête HTTP en clair n'est relayée.
// Le tunnel est chiffré de bout en bout (TLS entre Chromium et le site) : le proxy n'en lit rien.

import { lookup } from 'node:dns/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { hoteAutorise, normaliserHote, verifierLaissezPasser } from '@regie/contrats';
import { causeAdresseRefusee } from './adresses.ts';
import type { Trace, Traceur } from './traces.ts';

export type OptionsProxy = Readonly<{
  /** Clé partagée avec le cœur (32 octets au moins). */
  cle: Uint8Array;
  traceur: Traceur;
  /** Adresses publiques du foyer, jamais joignables. */
  foyer?: readonly string[];
  /** Résolution d'un nom en adresses (tests : un faux). Par défaut le DNS du système. */
  resoudre?: (hote: string) => Promise<readonly string[]>;
  /** Ouverture de la connexion vers l'adresse validée (tests : un faux). */
  connecter?: (ip: string, port: number) => Socket;
  maintenant?: () => number;
  /** Connexions simultanées au plus (défaut 64). */
  connexionsMax?: number;
  /** Inactivité au bout de laquelle un tunnel est fermé, en ms (défaut 60 s). */
  inactiviteMs?: number;
  /** Délai de connexion vers le site, en ms (défaut 10 s). */
  delaiConnexionMs?: number;
}>;

const PORT_PERMIS = 443;

async function resoudreSysteme(hote: string): Promise<readonly string[]> {
  return (await lookup(hote, { all: true, verbatim: true })).map((a) => a.address);
}

function repondre(socket: Duplex, ligne: string, entetes = ''): void {
  if (!socket.writable) return;
  socket.end(`HTTP/1.1 ${ligne}\r\n${entetes}Connection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** Lit « Basic base64(capture:<laissez-passer>) » ; rend le laissez-passer ou undefined. */
function laissezPasserDe(requete: IncomingMessage): string | undefined {
  const entete = requete.headers['proxy-authorization'];
  if (typeof entete !== 'string') return undefined;
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(entete);
  if (m?.[1] === undefined) return undefined;
  const decode = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decode.indexOf(':');
  return i === -1 ? undefined : decode.slice(i + 1);
}

/** « hote:port » d'une cible CONNECT ; les formes avec identifiants, chemin ou crochets sont refusées. */
function cibleDe(url: string | undefined): { hote: string; port: number } | undefined {
  const m = /^([^\s:/@?#[\]\\%]+):(\d{1,5})$/.exec(url ?? '');
  if (m?.[1] === undefined || m[2] === undefined) return undefined;
  return { hote: m[1], port: Number(m[2]) };
}

export function creerProxy(options: OptionsProxy): Server {
  const resoudre = options.resoudre ?? resoudreSysteme;
  const ouvrir = options.connecter ?? ((ip, port) => connect({ host: ip, port }));
  const maintenant = options.maintenant ?? Date.now;
  const foyer = options.foyer ?? [];
  const connexionsMax = options.connexionsMax ?? 64;
  const inactiviteMs = options.inactiviteMs ?? 60_000;
  const delaiMs = options.delaiConnexionMs ?? 10_000;
  let actives = 0;

  const serveur = createServer((_requete, reponse) => {
    // Ni HTTP en clair ni requête d'origine : ce proxy ne sait faire que CONNECT.
    reponse.writeHead(405, { Allow: 'CONNECT', 'Content-Length': '0', Connection: 'close' }).end();
  });
  serveur.headersTimeout = 10_000;
  serveur.requestTimeout = 10_000;

  // Écrit la trace ; si elle échoue, rend faux (la connexion est alors refusée).
  const tracer = (t: Trace): boolean => {
    try {
      options.traceur(t);
      return true;
    } catch {
      return false;
    }
  };

  serveur.on('connect', (requete: IncomingMessage, socket: Duplex, tete: Buffer) => {
    socket.on('error', () => undefined);
    const date = () => new Date(maintenant()).toISOString();
    const cible = cibleDe(requete.url);
    const hoteBrut = cible?.hote ?? String(requete.url ?? '').slice(0, 253);
    const refus = (ligne: string, cause: string, tache?: string, ip?: string) => {
      tracer({
        date: date(),
        ...(tache !== undefined ? { tache } : {}),
        hote: hoteBrut,
        ...(cible !== undefined ? { port: cible.port } : {}),
        ...(ip !== undefined ? { ip } : {}),
        decision: 'refusee',
        cause,
      });
      repondre(socket, ligne);
    };

    void (async () => {
      const jeton = laissezPasserDe(requete);
      const proxyAuth = 'Proxy-Authenticate: Basic realm="regie-capture"\r\n';
      if (jeton === undefined) {
        tracer({ date: date(), hote: hoteBrut, decision: 'refusee', cause: 'LAISSEZ_PASSER_ABSENT' });
        return repondre(socket, '407 Proxy Authentication Required', proxyAuth);
      }
      const laissez = verifierLaissezPasser(options.cle, jeton, maintenant());
      if (!laissez.ok) {
        tracer({ date: date(), hote: hoteBrut, decision: 'refusee', cause: `LAISSEZ_PASSER_${laissez.cause}` });
        return repondre(socket, '407 Proxy Authentication Required', proxyAuth);
      }
      const tache = laissez.contenu.tache;
      if (cible === undefined) return refus('400 Bad Request', 'CIBLE_INVALIDE', tache);
      if (cible.port !== PORT_PERMIS) return refus('403 Forbidden', 'PORT_REFUSE', tache);
      const nom = normaliserHote(cible.hote);
      if (!nom.ok) return refus('403 Forbidden', `HOTE_${nom.cause}`, tache);
      if (!hoteAutorise(nom.hote, laissez.contenu.hotes)) return refus('403 Forbidden', 'HOTE_NON_DECLARE', tache);
      if (actives >= connexionsMax) return refus('503 Service Unavailable', 'TROP_DE_CONNEXIONS', tache);
      // La place est réservée ICI, de façon synchrone, avant tout await : sinon N connexions passent la vérification
      // pendant la résolution DNS. `liberer` ne libère qu'une fois, quel que soit le chemin (refus, erreur, fin).
      actives += 1;
      let libere = false;
      const liberer = () => {
        if (libere) return;
        libere = true;
        actives -= 1;
      };
      // Le client qui raccroche pendant la résolution rend sa place.
      socket.once('close', liberer);

      let adresses: readonly string[];
      try {
        adresses = await resoudre(nom.hote);
      } catch {
        liberer();
        return refus('502 Bad Gateway', 'RESOLUTION_ECHOUEE', tache);
      }
      if (adresses.length === 0) {
        liberer();
        return refus('502 Bad Gateway', 'RESOLUTION_VIDE', tache);
      }
      // UNE seule adresse refusée suffit à tout refuser : un nom qui mêle publique et privée est une attaque.
      for (const ip of adresses) {
        const cause = causeAdresseRefusee(ip, foyer);
        if (cause !== undefined) {
          liberer();
          return refus('403 Forbidden', `ADRESSE_${cause}`, tache, ip);
        }
      }
      if (socket.destroyed) return liberer();
      const ip = adresses[0]!;
      // La trace précède le tunnel : sans trace, pas de connexion.
      if (!tracer({ date: date(), tache, hote: nom.hote, port: PORT_PERMIS, ip, decision: 'autorisee' })) {
        liberer();
        return repondre(socket, '503 Service Unavailable');
      }
      let amont: Socket;
      try {
        amont = ouvrir(ip, PORT_PERMIS);
      } catch {
        liberer();
        return repondre(socket, '502 Bad Gateway');
      }
      const fin = () => {
        liberer();
        amont.destroy();
        socket.destroy();
      };
      amont.setTimeout(delaiMs, () => {
        if (!amont.connecting) return;
        repondre(socket, '504 Gateway Timeout');
        fin();
      });
      amont.once('connect', () => {
        amont.setTimeout(inactiviteMs, fin);
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (tete.length > 0) amont.write(tete);
        amont.pipe(socket);
        socket.pipe(amont);
      });
      amont.on('error', () => {
        repondre(socket, '502 Bad Gateway');
        fin();
      });
      amont.on('close', fin);
      socket.on('close', fin);
    })();
  });

  return serveur;
}
