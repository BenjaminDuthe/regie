// regie — adresses signées des fichiers vidéo lus par les réseaux (FR-72, histoire 1.14).
// Une adresse `/v/<chemin>?e=<expiration>&s=<signature>` porte une expiration (secondes Unix) et un HMAC-SHA-256
// du chemin et de l'expiration, avec la sous-clé « hmac-adresses » dérivée de la clé maîtresse.
// Elle vit moins d'une heure : on refuse de signer plus long, et de croire une signature plus longue.
// La route qui sert les fichiers arrive avec les histoires de publication ; ici, seulement la vérification.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const DUREE_MAX_ADRESSE_S = 3600;

export function signature(cle: Buffer, chemin: string, expiration: number): string {
  return createHmac('sha256', cle).update(`${chemin}\n${expiration}`).digest('base64url');
}

/** Rend l'adresse signée (chemin + requête). `dureeS` est plafonnée à une heure. */
export function signerAdresse(cle: Buffer, chemin: string, options: { maintenant?: number; dureeS?: number } = {}): string {
  const maintenantS = Math.floor((options.maintenant ?? Date.now()) / 1000);
  const dureeS = options.dureeS ?? DUREE_MAX_ADRESSE_S;
  if (!Number.isInteger(dureeS) || dureeS <= 0 || dureeS >= DUREE_MAX_ADRESSE_S + 1) {
    throw new RangeError(`durée d’une adresse signée : 1 à ${DUREE_MAX_ADRESSE_S} secondes`);
  }
  const expiration = maintenantS + dureeS;
  return `${chemin}?e=${expiration}&s=${signature(cle, chemin, expiration)}`;
}

export type ResultatAdresse = 'valide' | 'signature' | 'expiree' | 'trop_longue' | 'mal_formee';

/** Vérifie une adresse reçue : chemin, paramètre `e` (expiration) et paramètre `s` (signature). */
export function verifierAdresse(
  cle: Buffer,
  chemin: string,
  e: string | null | undefined,
  s: string | null | undefined,
  maintenant: number = Date.now(),
): ResultatAdresse {
  if (e === null || e === undefined || s === null || s === undefined || !/^\d{1,12}$/.test(e) || !/^[A-Za-z0-9_-]{43}$/.test(s)) {
    return 'mal_formee';
  }
  const attendue = Buffer.from(signature(cle, chemin, Number(e)));
  const recue = Buffer.from(s);
  // Signature d'abord : on ne dit rien de l'expiration à qui ne sait pas signer.
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return 'signature';
  const maintenantS = Math.floor(maintenant / 1000);
  if (Number(e) <= maintenantS) return 'expiree';
  if (Number(e) - maintenantS > DUREE_MAX_ADRESSE_S) return 'trop_longue';
  return 'valide';
}
