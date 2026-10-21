// regie — heures de Paris (histoire 2.2, NFR-25). Les instants sont toujours stockés en UTC ; ce fichier convertit
// « tous les jours à HH:MM, heure de Paris » en instant UTC, en tenant compte des changements d'heure.

import chaines from '../chaines.json' with { type: 'json' };
import { decalageParis } from './journal.ts';

const FORME_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Date du jour à Paris à cet instant, en [année, mois, jour]. */
function jourParis(instant: Date): [number, number, number] {
  const parties = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const v = (t: string) => Number(parties.find((p) => p.type === t)!.value);
  return [v('year'), v('month'), v('day')];
}

/** L'instant UTC où il est `heure:minute` à Paris ce jour-là. Heure inexistante (saut de printemps) : décalée d'une heure. */
export function parisVersUtc(annee: number, mois: number, jour: number, heure: number, minute: number): Date {
  const mur = Date.UTC(annee, mois - 1, jour, heure, minute);
  // Deux passes : le décalage se lit à l'instant visé, qui dépend lui-même du décalage.
  let instant = new Date(mur - decalageParis(new Date(mur)) * 60_000);
  instant = new Date(mur - decalageParis(instant) * 60_000);
  return instant;
}

/** Le prochain `HH:MM` heure de Paris strictement après `apres`. */
export function prochainHoraireParis(apres: Date, heureParis: string): { instant: Date; jour: string } {
  const m = FORME_HEURE.exec(heureParis);
  if (m === null) throw new Error(`heure invalide : ${heureParis}`);
  const [a, mo, j] = jourParis(apres);
  for (let decalage = 0; decalage < 3; decalage += 1) {
    const mur = new Date(Date.UTC(a, mo - 1, j + decalage));
    const instant = parisVersUtc(mur.getUTCFullYear(), mur.getUTCMonth() + 1, mur.getUTCDate(), Number(m[1]), Number(m[2]));
    if (instant.getTime() > apres.getTime()) return { instant, jour: mur.toISOString().slice(0, 10) };
  }
  throw new Error('prochain horaire introuvable');
}


/**
 * « vers 18 h 40 » (heure de Paris, arrondie à 5 minutes) ; « demain vers 9 h 05 » ou « le 24/10 vers 9 h 05 » si ce n'est pas
 * aujourd'hui. Une estimation n'est jamais présentée comme une promesse (UX-DR25).
 */
export function heureEnClair(instant: Date, maintenant: Date): string {
  const arrondi = new Date(Math.round(instant.getTime() / 300_000) * 300_000);
  const parties = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(arrondi);
  const heure = Number(parties.find((p) => p.type === 'hour')?.value);
  const minute = Number(parties.find((p) => p.type === 'minute')?.value);
  const horloge = (minute === 0 ? chaines.horaires.heurePile : chaines.horaires.heure).replace('{h}', String(heure)).replace('{m}', String(minute).padStart(2, '0'));
  const [a, m, j] = jourParis(arrondi);
  const [a0, m0, j0] = jourParis(maintenant);
  const ecart = Math.round((Date.UTC(a, m - 1, j) - Date.UTC(a0, m0 - 1, j0)) / 86_400_000);
  if (ecart <= 0) return horloge;
  if (ecart === 1) return chaines.horaires.demain.replace('{heure}', horloge);
  return chaines.horaires.date.replace('{jour}', String(j).padStart(2, '0')).replace('{mois}', String(m).padStart(2, '0')).replace('{heure}', horloge);
}
