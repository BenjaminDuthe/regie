// regie — laissez-passer de la capture (histoire 4.2, AD-10). Le cœur signe, pour UNE tâche, la liste des hôtes que
// son conteneur peut joindre et une échéance ; le proxy de sortie ne vérifie que la signature : il ne sait rien
// d'autre de regie et ne tient aucune liste globale. Un laissez-passer d'une tâche n'ouvre jamais les hôtes d'une autre.
// Le conteneur Chromium ne reçoit que ce laissez-passer (jamais la clé) ; il expire vite et ne se renouvelle pas.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const LAISSEZ_PASSER_DUREE_MAX_S = 3600;
const PREFIXE = 'v1';

export type ContenuLaissezPasser = Readonly<{ tache: string; hotes: readonly string[]; expireLe: number }>;

export type ResultatLaissezPasser =
  | Readonly<{ ok: true; contenu: ContenuLaissezPasser }>
  | Readonly<{ ok: false; cause: 'FORME' | 'SIGNATURE' | 'EXPIRE' | 'DUREE' }>;

function signature(cle: Uint8Array, charge: string): Buffer {
  return createHmac('sha256', cle).update(`${PREFIXE}.${charge}`).digest();
}

/** Signe un laissez-passer valable `dureeS` secondes (au plus une heure). La clé fait au moins 32 octets. */
export function signerLaissezPasser(cle: Uint8Array, tache: string, hotes: readonly string[], dureeS: number, maintenantMs: number = Date.now()): string {
  if (cle.byteLength < 32) throw new Error('clé de laissez-passer trop courte (32 octets au moins)');
  if (!Number.isFinite(dureeS) || dureeS <= 0 || dureeS > LAISSEZ_PASSER_DUREE_MAX_S) throw new Error('durée de laissez-passer hors bornes');
  const expireLe = Math.floor(maintenantMs / 1000) + Math.ceil(dureeS);
  const charge = Buffer.from(JSON.stringify({ t: tache, h: hotes, e: expireLe })).toString('base64url');
  return `${PREFIXE}.${charge}.${signature(cle, charge).toString('base64url')}`;
}

/** Vérifie signature, forme et échéance. Aucune exception : un refus dit seulement sa cause. */
export function verifierLaissezPasser(cle: Uint8Array, jeton: string, maintenantMs: number = Date.now()): ResultatLaissezPasser {
  const morceaux = jeton.split('.');
  if (morceaux.length !== 3 || morceaux[0] !== PREFIXE || jeton.length > 4096) return { ok: false, cause: 'FORME' };
  const [, charge, sig] = morceaux as [string, string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(charge) || !/^[A-Za-z0-9_-]+$/.test(sig)) return { ok: false, cause: 'FORME' };
  const attendue = signature(cle, charge);
  const recue = Buffer.from(sig, 'base64url');
  if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return { ok: false, cause: 'SIGNATURE' };
  let brut: unknown;
  try {
    brut = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, cause: 'FORME' };
  }
  if (typeof brut !== 'object' || brut === null) return { ok: false, cause: 'FORME' };
  const { t, h, e } = brut as Record<string, unknown>;
  if (typeof t !== 'string' || !Array.isArray(h) || !h.every((x) => typeof x === 'string') || typeof e !== 'number' || !Number.isInteger(e)) {
    return { ok: false, cause: 'FORME' };
  }
  const maintenantS = Math.floor(maintenantMs / 1000);
  if (e <= maintenantS) return { ok: false, cause: 'EXPIRE' };
  if (e > maintenantS + LAISSEZ_PASSER_DUREE_MAX_S + 60) return { ok: false, cause: 'DUREE' };
  return { ok: true, contenu: { tache: t, hotes: h as string[], expireLe: e } };
}
