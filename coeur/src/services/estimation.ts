// regie — estimation de la position et de l'heure de fin des tâches de la file (histoire 2.5, FR-61).
// Fonction pure : elle rejoue l'ordre de prise de la file (une seule tâche à la fois ; les tâches interactives avant
// les tâches de lot, puis la plus ancienne disponibilité, puis la plus ancienne création) avec des durées tirées de
// l'historique réel (médiane des 50 dernières tentatives réussies du type), à défaut de la durée typique du type.

import { TACHES, type EtatTache } from '@regie/contrats';

export type TacheEnAttente = Readonly<{
  id: string;
  type: string;
  classe: 'interactive' | 'lot';
  /** Seules les tâches prêtes ou en cours comptent dans la file ; les autres sont ignorées. */
  etat: EtatTache;
  disponibleLe: Date;
  creeLe: Date;
  demarreeLe: Date | undefined;
}>;

export type Estimation = Readonly<{
  /** 0 : en cours ; 1 : la prochaine ; etc. */
  position: number;
  /** Instant de fin estimé. */
  finLe: Date;
}>;

/** Nombre de tentatives réussies gardées par type pour la médiane. */
export const FENETRE_HISTORIQUE = 50;
/** Une tâche qui dépasse sa durée attendue est supposée finir dans cette part de sa durée. */
const PART_RESTANTE_EN_RETARD = 0.2;

export function mediane(valeurs: readonly number[]): number | undefined {
  if (valeurs.length === 0) return undefined;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 === 1 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
}

/** Durée attendue d'une tentative du type, en secondes. */
export function dureeAttendue(type: string, historique: Readonly<Record<string, readonly number[]>>): number {
  const m = mediane((historique[type] ?? []).slice(0, FENETRE_HISTORIQUE));
  return m !== undefined && m > 0 ? m : (TACHES[type]?.dureeTypiqueS ?? 60);
}

export function estimer(taches: readonly TacheEnAttente[], historique: Readonly<Record<string, readonly number[]>>, maintenant: Date): Map<string, Estimation> {
  const resultat = new Map<string, Estimation>();
  const t0 = maintenant.getTime();
  let curseur = t0;
  for (const t of taches.filter((x) => x.etat === 'en_cours')) {
    const duree = dureeAttendue(t.type, historique) * 1000;
    const ecoule = t0 - (t.demarreeLe?.getTime() ?? t0);
    const reste = ecoule < duree ? duree - ecoule : duree * PART_RESTANTE_EN_RETARD;
    curseur = Math.max(curseur, t0 + reste);
    resultat.set(t.id, { position: 0, finLe: new Date(t0 + reste) });
  }
  const restantes = taches.filter((x) => x.etat === 'prete');
  const avant = (a: TacheEnAttente, b: TacheEnAttente) =>
    Number(b.classe === 'interactive') - Number(a.classe === 'interactive') || a.disponibleLe.getTime() - b.disponibleLe.getTime() || a.creeLe.getTime() - b.creeLe.getTime();
  let rang = 0;
  while (restantes.length > 0) {
    let prises = restantes.filter((x) => x.disponibleLe.getTime() <= curseur);
    if (prises.length === 0) {
      // Rien n'est encore disponible : la file attend la première disponibilité.
      curseur = Math.min(...restantes.map((x) => x.disponibleLe.getTime()));
      prises = restantes.filter((x) => x.disponibleLe.getTime() <= curseur);
    }
    const suivante = prises.sort(avant)[0]!;
    restantes.splice(restantes.indexOf(suivante), 1);
    curseur += dureeAttendue(suivante.type, historique) * 1000;
    rang += 1;
    resultat.set(suivante.id, { position: rang, finLe: new Date(curseur) });
  }
  return resultat;
}
