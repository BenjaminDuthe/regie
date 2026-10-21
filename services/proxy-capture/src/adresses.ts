// regie — adresses que le proxy de capture ne joint jamais (histoire 4.2, AD-10). Le proxy valide CHAQUE adresse
// résolue : privées, bouclage, lien local (dont les métadonnées cloud 169.254.169.254), CGNAT, ULA IPv6, IPv4 mappées
// en IPv6 (on valide l'IPv4 qu'elles portent), et l'adresse publique du foyer (réglée par l'administrateur).

import { BlockList, isIP } from 'node:net';

const PLAGES_V4: readonly [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const PLAGES_V6: readonly [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

const bloc = new BlockList();
for (const [base, bits] of PLAGES_V4) bloc.addSubnet(base, bits, 'ipv4');
for (const [base, bits] of PLAGES_V6) bloc.addSubnet(base, bits, 'ipv6');

/** Si `ip` est une IPv4 portée par une IPv6 (::ffff:a.b.c.d ou ::ffff:xxxx:xxxx, ::a.b.c.d), rend cette IPv4. */
function ipv4Portee(ip: string): string | undefined {
  const m = /^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (m?.[1] !== undefined) return m[1];
  const h = /^(?:::ffff:|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (h?.[1] !== undefined && h[2] !== undefined) {
    const a = parseInt(h[1], 16);
    const b = parseInt(h[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return undefined;
}

export type CauseAdresse = 'FORME' | 'PRIVEE' | 'FOYER';

/**
 * Dit pourquoi une adresse est refusée, ou `undefined` si elle est publique et permise.
 * `foyer` : adresses publiques du foyer (jamais joignables, même si elles semblent publiques).
 */
export function causeAdresseRefusee(ip: string, foyer: readonly string[] = []): CauseAdresse | undefined {
  const famille = isIP(ip);
  if (famille === 0) return 'FORME';
  const portee = famille === 6 ? ipv4Portee(ip) : undefined;
  const reelle = portee ?? ip;
  const reelleFamille = portee !== undefined ? 4 : famille;
  if (bloc.check(reelle, reelleFamille === 4 ? 'ipv4' : 'ipv6')) return 'PRIVEE';
  // Toute IPv6 mappée ou compatible non reconnue plus haut reste refusée par prudence.
  if (famille === 6 && /^::(?:ffff:)?/i.test(ip) && portee === undefined) return 'PRIVEE';
  if (foyer.some((f) => f === reelle || f === ip)) return 'FOYER';
  return undefined;
}
