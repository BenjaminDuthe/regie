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

// IPv6 en LISTE BLANCHE : seul l'unicast global 2000::/3 est permis, moins les plages spéciales qu'il contient.
// Tout le reste (::, ::1, 64:ff9b::/96 et 64:ff9b:1::/48, 100::/64, fc00::/7, fe80::/10, ff00::/8, …) est refusé par défaut.
const PERMIS_V6: readonly [string, number][] = [['2000::', 3]];
const EXCLUES_V6: readonly [string, number][] = [
  ['2001::', 23], // protocoles IETF (Teredo, ORCHID…) : refusé en entier, on ne gère pas les sous-plages routables
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 : porte une IPv4 arbitraire
  ['3fff::', 20], // documentation
];

const bloc = new BlockList();
for (const [base, bits] of PLAGES_V4) bloc.addSubnet(base, bits, 'ipv4');
const permisV6 = new BlockList();
for (const [base, bits] of PERMIS_V6) permisV6.addSubnet(base, bits, 'ipv6');
const exclusV6 = new BlockList();
for (const [base, bits] of EXCLUES_V6) exclusV6.addSubnet(base, bits, 'ipv6');

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
  if (reelleFamille === 4) {
    if (bloc.check(reelle, 'ipv4')) return 'PRIVEE';
  } else if (!permisV6.check(reelle, 'ipv6') || exclusV6.check(reelle, 'ipv6')) {
    // Liste blanche : une IPv6 hors 2000::/3 (dont les formes mappées ou compatibles non reconnues) est refusée.
    return 'PRIVEE';
  }
  if (foyer.some((f) => f === reelle || f === ip)) return 'FOYER';
  return undefined;
}
