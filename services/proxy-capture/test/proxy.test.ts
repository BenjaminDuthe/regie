// Suite d'évasion du proxy de capture (histoire 4.2) : chaque tentative de sortir du périmètre est refusée ET tracée,
// et le tunnel autorisé ne se connecte qu'à l'adresse validée. Rien n'appelle Internet : le DNS et la connexion sortante
// sont des faux, les échanges se font sur la boucle locale.

import type { Server as ServeurHttp } from 'node:http';
import { createServer, connect, type AddressInfo, type Server, type Socket } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signerLaissezPasser } from '@regie/contrats';
import { causeAdresseRefusee } from '../src/adresses.ts';
import { creerProxy } from '../src/proxy.ts';
import { purgerTraces, traceurFichier, type Trace } from '../src/traces.ts';

const CLE = Buffer.alloc(32, 7);
const MAINTENANT = Date.parse('2026-10-21T10:00:00Z');

type Banc = {
  port: number;
  traces: Trace[];
  connexions: { ip: string; port: number }[];
  resolutions: string[];
  dns: Map<string, string[]>;
  jeton: (hotes: string[], tache?: string) => string;
};

let proxy: ServeurHttp;
let echo: Server;
let banc: Banc;
let foyer: string[];
let traceurEnPanne: boolean;
let echo2: Server | undefined;

async function ecouter(s: Server | ServeurHttp): Promise<number> {
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  return (s.address() as AddressInfo).port;
}

beforeEach(async () => {
  foyer = ['93.184.216.99'];
  traceurEnPanne = false;
  echo = createServer((s) => s.on('data', (d) => s.write(d)));
  const portEcho = await ecouter(echo);
  const dns = new Map<string, string[]>([
    ['demo.exemple.fr', ['93.184.216.34']],
    ['api.exemple.fr', ['93.184.216.35']],
    ['interne.exemple.fr', ['10.0.0.5']],
    ['melange.exemple.fr', ['93.184.216.34', '192.168.1.10']],
    ['boucle.exemple.fr', ['127.0.0.1']],
    ['metadata.exemple.fr', ['169.254.169.254']],
    ['v6local.exemple.fr', ['::1']],
    ['ula.exemple.fr', ['fd12:3456::1']],
    ['mappee.exemple.fr', ['::ffff:10.0.0.1']],
    ['cgnat.exemple.fr', ['100.64.3.4']],
    ['foyer.exemple.fr', ['93.184.216.99']],
  ]);
  banc = { port: 0, traces: [], connexions: [], resolutions: [], dns, jeton: (hotes, tache = 'tache-1') => signerLaissezPasser(CLE, tache, hotes, 600, MAINTENANT) };
  proxy = creerProxy({
    cle: CLE,
    foyer,
    maintenant: () => MAINTENANT,
    traceur: (t) => {
      if (traceurEnPanne) throw new Error('disque plein');
      banc.traces.push(t);
    },
    resoudre: async (hote) => {
      banc.resolutions.push(hote);
      const r = banc.dns.get(hote);
      if (r === undefined) throw new Error('NXDOMAIN');
      return r;
    },
    // Les faux ne sortent pas : toute « connexion sortante » est redirigée vers le serveur d'écho local.
    connecter: (ip, port) => {
      banc.connexions.push({ ip, port });
      return connect({ host: '127.0.0.1', port: portEcho });
    },
  });
  banc.port = await ecouter(proxy);
});

afterEach(async () => {
  proxy.closeAllConnections();
  await Promise.all([new Promise((ok) => proxy.close(ok)), new Promise((ok) => echo.close(ok))]);
  if (echo2 !== undefined) await new Promise((ok) => echo2!.close(ok));
  echo2 = undefined;
});

/** Envoie un CONNECT brut et rend la première ligne de la réponse (et la socket si le tunnel est ouvert). */
async function connecter(cible: string, jeton: string | undefined, entetesEnPlus = ''): Promise<{ ligne: string; socket: Socket }> {
  const socket = connect({ host: '127.0.0.1', port: banc.port });
  const auth = jeton === undefined ? '' : `Proxy-Authorization: Basic ${Buffer.from(`capture:${jeton}`).toString('base64')}\r\n`;
  socket.write(`CONNECT ${cible} HTTP/1.1\r\nHost: ${cible}\r\n${auth}${entetesEnPlus}\r\n`);
  const ligne = await new Promise<string>((ok) => {
    let tampon = '';
    socket.on('data', (d) => {
      tampon += d.toString();
      if (tampon.includes('\r\n')) ok(tampon.split('\r\n')[0]!);
    });
    socket.on('close', () => ok(tampon.split('\r\n')[0] ?? ''));
  });
  return { ligne, socket };
}

async function refusee(cible: string, jeton: string | undefined, statut: string, cause: string) {
  const { ligne, socket } = await connecter(cible, jeton);
  socket.destroy();
  expect(ligne).toContain(statut);
  expect(banc.connexions).toEqual([]);
  expect(banc.traces.at(-1)).toMatchObject({ decision: 'refusee', cause });
}

describe('tunnel autorisé', () => {
  it('relaie vers l’adresse VALIDÉE, trace la destination, et ne re-résout jamais le nom', async () => {
    const { ligne, socket } = await connecter('demo.exemple.fr:443', banc.jeton(['demo.exemple.fr']));
    expect(ligne).toBe('HTTP/1.1 200 Connection Established');
    const retour = await new Promise<string>((ok) => {
      socket.once('data', (d) => ok(d.toString()));
      socket.write('bonjour');
    });
    expect(retour).toBe('bonjour');
    socket.destroy();
    expect(banc.connexions).toEqual([{ ip: '93.184.216.34', port: 443 }]);
    expect(banc.resolutions).toEqual(['demo.exemple.fr']);
    expect(banc.traces).toEqual([{ date: '2026-10-21T10:00:00.000Z', tache: 'tache-1', hote: 'demo.exemple.fr', port: 443, ip: '93.184.216.34', decision: 'autorisee' }]);
  });

  it('accepte la casse et le point final de l’hôte demandé', async () => {
    const { ligne, socket } = await connecter('DEMO.Exemple.fr:443', banc.jeton(['demo.exemple.fr']));
    socket.destroy();
    expect(ligne).toContain('200');
  });
});

describe('laissez-passer', () => {
  it('sans laissez-passer : 407, tracé', async () => {
    await refusee('demo.exemple.fr:443', undefined, '407', 'LAISSEZ_PASSER_ABSENT');
  });
  it('falsifié (autre clé) : 407', async () => {
    const faux = signerLaissezPasser(Buffer.alloc(32, 9), 't', ['demo.exemple.fr'], 600, MAINTENANT);
    await refusee('demo.exemple.fr:443', faux, '407', 'LAISSEZ_PASSER_SIGNATURE');
  });
  it('expiré : 407', async () => {
    const vieux = signerLaissezPasser(CLE, 't', ['demo.exemple.fr'], 60, MAINTENANT - 3_600_000);
    await refusee('demo.exemple.fr:443', vieux, '407', 'LAISSEZ_PASSER_EXPIRE');
  });
  it('charge modifiée à la main (hôte ajouté) : signature refusée', async () => {
    const [v, , s] = banc.jeton(['demo.exemple.fr']).split('.');
    const charge = Buffer.from(JSON.stringify({ t: 'tache-1', h: ['demo.exemple.fr', 'api.exemple.fr'], e: MAINTENANT / 1000 + 600 })).toString('base64url');
    await refusee('api.exemple.fr:443', `${v}.${charge}.${s}`, '407', 'LAISSEZ_PASSER_SIGNATURE');
  });
  it('le laissez-passer d’une tâche n’ouvre pas les hôtes d’une autre', async () => {
    await refusee('api.exemple.fr:443', banc.jeton(['demo.exemple.fr'], 'tache-A'), '403', 'HOTE_NON_DECLARE');
    expect(banc.traces.at(-1)?.tache).toBe('tache-A');
  });
});

describe('hôtes et ports', () => {
  it('hôte non déclaré : 403, jamais résolu', async () => {
    await refusee('api.exemple.fr:443', banc.jeton(['demo.exemple.fr']), '403', 'HOTE_NON_DECLARE');
    expect(banc.resolutions).toEqual([]);
  });
  it('sous-domaine d’un hôte déclaré : refusé (liste stricte, pas de joker)', async () => {
    await refusee('x.demo.exemple.fr:443', banc.jeton(['demo.exemple.fr']), '403', 'HOTE_NON_DECLARE');
  });
  it('port autre que 443 (SSH, SMTP, PostgreSQL, 8443) : refusé', async () => {
    for (const port of [22, 25, 5432, 80, 8443]) await refusee(`demo.exemple.fr:${port}`, banc.jeton(['demo.exemple.fr']), '403', 'PORT_REFUSE');
  });
  it('adresse IP littérale, même « déclarée » : refusée sans résolution', async () => {
    for (const cible of ['127.0.0.1:443', '10.0.0.5:443', '93.184.216.34:443', '2130706433:443', '0x7f.1:443']) {
      await refusee(cible, banc.jeton(['127.0.0.1', '10.0.0.5', '93.184.216.34', '2130706433', '0x7f.1']), '403', 'HOTE_ADRESSE_IP');
    }
    expect(banc.resolutions).toEqual([]);
  });
  it('noms locaux (localhost, .local, .internal, sans point) : refusés', async () => {
    for (const hote of ['localhost', 'nas.local', 'api.internal', 'routeur']) {
      const { ligne, socket } = await connecter(`${hote}:443`, banc.jeton([hote]));
      socket.destroy();
      expect(ligne).toContain('403');
    }
    expect(banc.connexions).toEqual([]);
  });
  it('cibles tordues (identifiants, chemin, IPv6 entre crochets, sans port) : refusées', async () => {
    for (const cible of ['demo.exemple.fr@10.0.0.5:443', 'demo.exemple.fr/x:443', '[::1]:443', 'demo.exemple.fr']) {
      const { ligne, socket } = await connecter(cible, banc.jeton(['demo.exemple.fr']));
      socket.destroy();
      expect(ligne).toMatch(/40[03]/);
    }
    expect(banc.connexions).toEqual([]);
  });
  it('une requête HTTP en clair n’est pas relayée', async () => {
    const socket = connect({ host: '127.0.0.1', port: banc.port });
    socket.write('GET http://demo.exemple.fr/ HTTP/1.1\r\nHost: demo.exemple.fr\r\nConnection: close\r\n\r\n');
    const reponse = await new Promise<string>((ok) => {
      let t = '';
      socket.on('data', (d) => (t += d.toString()));
      socket.on('close', () => ok(t));
    });
    expect(reponse).toContain('405');
    expect(banc.connexions).toEqual([]);
  });
});

describe('évasion par le DNS (le réseau du foyer et des voisins)', () => {
  const cas: [string, string][] = [
    ['interne.exemple.fr', 'ADRESSE_PRIVEE'],
    ['melange.exemple.fr', 'ADRESSE_PRIVEE'],
    ['boucle.exemple.fr', 'ADRESSE_PRIVEE'],
    ['metadata.exemple.fr', 'ADRESSE_PRIVEE'],
    ['v6local.exemple.fr', 'ADRESSE_PRIVEE'],
    ['ula.exemple.fr', 'ADRESSE_PRIVEE'],
    ['mappee.exemple.fr', 'ADRESSE_PRIVEE'],
    ['cgnat.exemple.fr', 'ADRESSE_PRIVEE'],
    ['foyer.exemple.fr', 'ADRESSE_FOYER'],
  ];
  for (const [hote, cause] of cas) {
    it(`${hote} : refusé (${cause}), aucune connexion ouverte`, async () => {
      await refusee(`${hote}:443`, banc.jeton([hote]), '403', cause);
    });
  }

  it('rebinding : un nom qui change de réponse entre deux demandes est validé à CHAQUE demande, et seule l’adresse validée est jointe', async () => {
    const jeton = banc.jeton(['demo.exemple.fr']);
    const un = await connecter('demo.exemple.fr:443', jeton);
    un.socket.destroy();
    expect(un.ligne).toContain('200');
    // Le nom est maintenant détourné vers le réseau du foyer.
    banc.dns.set('demo.exemple.fr', ['192.168.1.1']);
    const deux = await connecter('demo.exemple.fr:443', jeton);
    deux.socket.destroy();
    expect(deux.ligne).toContain('403');
    expect(banc.connexions).toEqual([{ ip: '93.184.216.34', port: 443 }]);
    expect(banc.traces.at(-1)).toMatchObject({ decision: 'refusee', cause: 'ADRESSE_PRIVEE', ip: '192.168.1.1' });
  });

  it('résolution en échec ou vide : 502, rien d’ouvert', async () => {
    banc.dns.set('vide.exemple.fr', []);
    await refusee('vide.exemple.fr:443', banc.jeton(['vide.exemple.fr']), '502', 'RESOLUTION_VIDE');
    await refusee('inconnu.exemple.fr:443', banc.jeton(['inconnu.exemple.fr']), '502', 'RESOLUTION_ECHOUEE');
  });
});

describe('traces', () => {
  it('fail-closed : si la trace ne peut pas s’écrire, le tunnel ne s’ouvre pas', async () => {
    traceurEnPanne = true;
    const { ligne, socket } = await connecter('demo.exemple.fr:443', banc.jeton(['demo.exemple.fr']));
    socket.destroy();
    expect(ligne).toContain('503');
    expect(banc.connexions).toEqual([]);
  });
  it('ne contient ni laissez-passer ni clé', async () => {
    const jeton = banc.jeton(['demo.exemple.fr']);
    const { socket } = await connecter('demo.exemple.fr:443', jeton);
    socket.destroy();
    const texte = JSON.stringify(banc.traces);
    expect(texte).not.toContain(jeton);
    expect(texte).not.toContain(CLE.toString('base64url'));
  });
  it('fichier du jour, conservation d’un an puis purge', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'regie-traces-'));
    try {
      traceurFichier(dossier)({ date: '2026-10-21T10:00:00.000Z', hote: 'demo.exemple.fr', decision: 'refusee', cause: 'HOTE_NON_DECLARE' });
      expect(readdirSync(dossier)).toEqual(['traces-2026-10-21.ndjson']);
      expect(JSON.parse(readFileSync(join(dossier, 'traces-2026-10-21.ndjson'), 'utf8').trim())).toMatchObject({ hote: 'demo.exemple.fr' });
      writeFileSync(join(dossier, 'traces-2025-10-20.ndjson'), '{}\n');
      writeFileSync(join(dossier, 'traces-2025-10-22.ndjson'), '{}\n');
      writeFileSync(join(dossier, 'autre.txt'), 'x');
      utimesSync(join(dossier, 'autre.txt'), new Date(0), new Date(0));
      expect(purgerTraces(dossier, Date.parse('2026-10-21T10:00:00Z'))).toEqual(['traces-2025-10-20.ndjson']);
      expect(readdirSync(dossier).sort()).toEqual(['autre.txt', 'traces-2025-10-22.ndjson', 'traces-2026-10-21.ndjson']);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe('plafond de connexions', () => {
  it('réserve la place AVANT la résolution : N demandes simultanées n’ouvrent jamais plus que le plafond', async () => {
    const portEcho = await ecouter((echo2 = createServer((s) => s.on('data', (d) => s.write(d)))));
    let liberer!: () => void;
    const porte = new Promise<void>((ok) => (liberer = ok));
    const ouvertes: string[] = [];
    const p = creerProxy({
      cle: CLE,
      maintenant: () => MAINTENANT,
      connexionsMax: 2,
      traceur: () => undefined,
      resoudre: async () => (await porte, ['93.184.216.34']),
      connecter: (ip) => (ouvertes.push(ip), connect({ host: '127.0.0.1', port: portEcho })),
    });
    const port = await ecouter(p);
    const demande = () =>
      new Promise<{ ligne: string; socket: Socket }>((ok) => {
        const socket = connect({ host: '127.0.0.1', port });
        socket.write(`CONNECT demo.exemple.fr:443 HTTP/1.1\r\nProxy-Authorization: Basic ${Buffer.from(`capture:${banc.jeton(['demo.exemple.fr'])}`).toString('base64')}\r\n\r\n`);
        socket.once('data', (d) => ok({ ligne: d.toString().split('\r\n')[0]!, socket }));
        socket.once('close', () => ok({ ligne: '', socket }));
      });
    const reponses = Array.from({ length: 6 }, demande);
    // Laisse les six demandes atteindre la résolution (bloquée), puis la débloque.
    await new Promise((ok) => setTimeout(ok, 150));
    liberer();
    const lues = await Promise.all(reponses);
    expect(lues.filter((r) => r.ligne.includes('200')).length).toBe(2);
    expect(lues.filter((r) => r.ligne.includes('503')).length).toBe(4);
    expect(ouvertes.length).toBe(2);
    // Un refus rend sa place : après fermeture des deux tunnels, une nouvelle demande passe.
    for (const r of lues) r.socket.destroy();
    await new Promise((ok) => setTimeout(ok, 100));
    const encore = await demande();
    expect(encore.ligne).toContain('200');
    encore.socket.destroy();
    p.closeAllConnections();
    await new Promise((ok) => p.close(ok));
  });
  it('un refus après réservation (adresse privée) rend la place', async () => {
    const p = creerProxy({ cle: CLE, maintenant: () => MAINTENANT, connexionsMax: 1, traceur: () => undefined, resoudre: async () => ['10.0.0.5'], connecter: () => { throw new Error('jamais'); } });
    const port = await ecouter(p);
    for (let i = 0; i < 3; i++) {
      const socket = connect({ host: '127.0.0.1', port });
      socket.write(`CONNECT demo.exemple.fr:443 HTTP/1.1\r\nProxy-Authorization: Basic ${Buffer.from(`capture:${banc.jeton(['demo.exemple.fr'])}`).toString('base64')}\r\n\r\n`);
      const ligne = await new Promise<string>((ok) => socket.once('data', (d) => ok(d.toString().split('\r\n')[0]!)));
      expect(ligne).toContain('403');
      socket.destroy();
    }
    p.closeAllConnections();
    await new Promise((ok) => p.close(ok));
  });
});

describe('causeAdresseRefusee', () => {
  it('IPv6 en liste blanche : seul 2000::/3 hors plages spéciales passe', () => {
    for (const ip of ['64:ff9b::808:808', '64:ff9b:1::1', '2001::1', '2001:1::1', '2001:db8::1', '2002:5db8:d822::1', '3fff::1', '3fff:fff::1', '100::1', '5f00::1', '4000::1', 'fec0::1', 'ff02::1', '::ffff:0:10.0.0.1', '1::1']) {
      expect(causeAdresseRefusee(ip), ip).toBe('PRIVEE');
    }
    for (const ip of ['2606:2800:220:1:248:1893:25c8:1946', '2a00:1450:4007:80f::200e', '2001:4860:4860::8888', '2400:cb00::1']) expect(causeAdresseRefusee(ip), ip).toBeUndefined();
  });
  it('les IPv4 mappées suivent les règles IPv4 ; toutes les plages IPv4 spéciales sont refusées', () => {
    expect(causeAdresseRefusee('::ffff:93.184.216.34')).toBeUndefined();
    expect(causeAdresseRefusee('::ffff:10.0.0.1')).toBe('PRIVEE');
    expect(causeAdresseRefusee('::ffff:a9fe:a9fe')).toBe('PRIVEE');
    for (const ip of ['0.1.2.3', '10.255.0.1', '100.64.0.1', '100.127.0.1', '127.9.9.9', '169.254.1.1', '172.16.5.5', '172.31.0.1', '192.0.0.8', '192.168.7.7', '198.18.0.1', '198.19.255.255', '224.0.0.5', '239.1.1.1', '240.0.0.1', '255.255.255.254']) {
      expect(causeAdresseRefusee(ip), ip).toBe('PRIVEE');
      expect(causeAdresseRefusee(`::ffff:${ip}`), `::ffff:${ip}`).toBe('PRIVEE');
    }
  });
  it('refuse les plages privées sous toutes leurs formes', () => {
    for (const ip of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '100.127.255.254', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fe80::1', 'fc00::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:192.168.1.1', '2002:c0a8:0101::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2']) {
      expect(causeAdresseRefusee(ip), ip).toBe('PRIVEE');
    }
  });
  it('laisse passer les adresses publiques, refuse le foyer et les formes douteuses', () => {
    for (const ip of ['93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.0.1', '2606:2800:220:1:248:1893:25c8:1946']) expect(causeAdresseRefusee(ip), ip).toBeUndefined();
    expect(causeAdresseRefusee('93.184.216.34', ['93.184.216.34'])).toBe('FOYER');
    expect(causeAdresseRefusee('::ffff:93.184.216.34', ['93.184.216.34'])).toBe('FOYER');
    expect(causeAdresseRefusee('pas-une-ip')).toBe('FORME');
    expect(causeAdresseRefusee('010.0.0.1')).toBe('FORME');
  });
});
