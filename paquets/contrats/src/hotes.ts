// regie — hôtes autorisés d'une application à filmer (histoire 4.1, FR-13, FR-17, AR-21). Module pur, partagé par le
// cœur (déclaration, scripts) et la capture (proxy). Un hôte est un NOM de domaine complet, en minuscules, sans
// joker, sans port, sans adresse IP : la liste est stricte. Aucune résolution DNS ici (le cœur n'ouvre aucune
// connexion) : le proxy de sortie refuse, à chaque connexion, les adresses privées et le rebinding (histoire 4.2).

import { domainToASCII } from 'node:url';

export type CauseHoteRefuse = 'VIDE' | 'TROP_LONG' | 'JOKER' | 'FORME' | 'ADRESSE_IP' | 'LOCAL';

export type ResultatHote = Readonly<{ ok: true; hote: string }> | Readonly<{ ok: false; cause: CauseHoteRefuse }>;

/** Terminaisons réservées ou privées : jamais un site public que regie pourrait filmer. */
const SUFFIXES_LOCAUX = ['localhost', 'local', 'localdomain', 'internal', 'lan', 'home', 'intranet', 'corp', 'private', 'test', 'invalid', 'onion', 'arpa'] as const;

const ETIQUETTE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const HOTES_MAX_PAR_APPLICATION = 20;

/** Normalise un nom d'hôte saisi (minuscules, punycode, point final retiré) ou dit pourquoi il est refusé. */
export function normaliserHote(brut: string): ResultatHote {
  let h = brut.trim().toLowerCase();
  if (h.endsWith('.')) h = h.slice(0, -1);
  if (h === '') return { ok: false, cause: 'VIDE' };
  if (h.length > 253 * 2) return { ok: false, cause: 'TROP_LONG' };
  if (h.includes('*')) return { ok: false, cause: 'JOKER' };
  // Port, chemin, identifiants, crochets d'une IPv6, espaces ou pour-cent : pas un nom d'hôte.
  if (/[\s/:@?#[\]\\%]/.test(h)) return { ok: false, cause: h.includes(':') && /^[\d.:a-f[\]]+$/.test(h) ? 'ADRESSE_IP' : 'FORME' };
  const ascii = domainToASCII(h);
  if (ascii === '') return { ok: false, cause: 'FORME' };
  if (ascii.length > 253) return { ok: false, cause: 'TROP_LONG' };
  const etiquettes = ascii.split('.');
  if (etiquettes.some((e) => !ETIQUETTE.test(e))) return { ok: false, cause: 'FORME' };
  const derniere = etiquettes.at(-1)!;
  // Une dernière étiquette numérique (127.0.0.1, 2130706433, 0x7f.1) est une adresse IPv4 sous une autre écriture.
  if (/^(?:0x[0-9a-f]*|\d+)$/.test(derniere)) return { ok: false, cause: 'ADRESSE_IP' };
  if (etiquettes.length < 2 || SUFFIXES_LOCAUX.includes(derniere as (typeof SUFFIXES_LOCAUX)[number])) return { ok: false, cause: 'LOCAL' };
  return { ok: true, hote: ascii };
}

/** L'hôte d'une adresse https (port 443 ou absent, sans identifiants) ; `undefined` sinon. */
export function hoteDeUrl(adresse: string): string | undefined {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || (url.port !== '' && url.port !== '443')) return undefined;
  const r = normaliserHote(url.hostname);
  return r.ok ? r.hote : undefined;
}

/** Vrai si l'hôte (déjà normalisé) figure dans la liste stricte. */
export const hoteAutorise = (hote: string, autorises: readonly string[]): boolean => autorises.includes(hote.toLowerCase());
