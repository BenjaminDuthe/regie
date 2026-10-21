// regie — le planificateur d'échéances (histoire 2.2, AR-3, AR-22). Démarre en dernier : il déclenche ce qui est dû,
// rattrape ce qui a manqué pendant un arrêt (moins de 2 h : toujours ; plus ancien : selon la règle du type), garde
// les échéances récurrentes de la nuit inscrites, et exécute les travaux internes qui en découlent.

import { RATTRAPAGE_MAX_MS, RECURRENCES, TYPES_ECHEANCE } from '@regie/contrats';
import type { Decision, Echeance, EcheancesPg, TravailInterne } from '../infra/echeances.ts';
import { prochainHoraireParis } from './horaires.ts';
import type { Journal } from './travailleur.ts';

/** Échec d'un gestionnaire, avec la cause (code) gardée en base. */
export class ErreurTravail extends Error {
  readonly cause_: string;

  constructor(cause: string) {
    super(cause);
    this.name = 'ErreurTravail';
    this.cause_ = cause;
  }
}

export type Gestionnaire = (travail: TravailInterne) => Promise<void>;

/** Le gestionnaire d'un travail est cherché par `type` puis par `type:objet` (une purge de sessions n'est pas une purge d'OAuth). */
export type Gestionnaires = Readonly<Record<string, Gestionnaire>>;

export const cleGestionnaire = (type: string, objet: string): string => `${type}:${objet}`;

/** Règle du type : rattraper tant que le retard est inférieur à 2 h, ensuite selon `regle`. Type inconnu : échec. */
export function decider(e: Pick<Echeance, 'type' | 'instant'>, maintenant: Date): Decision {
  const definition = TYPES_ECHEANCE[e.type];
  if (definition === undefined) return 'echouer';
  const retard = maintenant.getTime() - e.instant.getTime();
  if (retard < RATTRAPAGE_MAX_MS) return 'declencher';
  return definition.regle === 'rattraper' ? 'declencher' : 'echouer';
}

export type OptionsPlanificateur = Readonly<{
  echeances: EcheancesPg;
  marques: () => Promise<readonly string[]>;
  gestionnaires: Gestionnaires;
  journal: Journal;
  maintenant?: () => Date;
  /** Période des passes, en ms (1 minute). */
  periodeMs?: number;
}>;

export class Planificateur {
  readonly #o: OptionsPlanificateur;
  #minuterie: NodeJS.Timeout | undefined;
  #enCours = false;
  #arrete = false;

  constructor(options: OptionsPlanificateur) {
    this.#o = options;
  }

  #maintenant(): Date {
    return this.#o.maintenant?.() ?? new Date();
  }

  /** Inscrit, pour chaque récurrence, la prochaine occurrence (clé = jour de Paris : jamais deux fois la même). */
  async assurerRecurrences(marqueId: string): Promise<void> {
    const maintenant = this.#maintenant();
    for (const r of RECURRENCES) {
      const { instant, jour } = prochainHoraireParis(maintenant, r.heureParis);
      await this.#o.echeances.inscrire(marqueId, { type: r.type, objet: r.objet, instant, cle: `${r.objet}:${jour}` });
    }
  }

  /** Une passe pour une marque : récurrences, déclenchement, puis travaux. Rend le nombre de travaux exécutés. */
  async passerMarque(marqueId: string): Promise<number> {
    await this.assurerRecurrences(marqueId);
    const maintenant = this.#maintenant();
    const bilan = await this.#o.echeances.declencher(marqueId, maintenant, (e) => decider(e, maintenant));
    if (bilan.echouees > 0) this.#o.journal.warn({ marque: marqueId, echouees: bilan.echouees }, 'échéances trop en retard : passées en échec');
    let faits = 0;
    for (;;) {
      const travail = await this.#o.echeances.prendreTravail(marqueId, this.#typesConnus(), this.#maintenant());
      if (travail === undefined) break;
      faits += 1;
      await this.#executer(marqueId, travail);
    }
    return faits;
  }

  async passer(): Promise<number> {
    let total = 0;
    for (const marqueId of await this.#o.marques()) {
      if (this.#arrete) break;
      total += await this.passerMarque(marqueId);
    }
    return total;
  }

  /** Les types dont on sait faire le travail ; les autres restent prêts jusqu'à ce que leur histoire arrive. */
  #typesConnus(): string[] {
    return [...new Set(Object.keys(this.#o.gestionnaires).map((cle) => cle.split(':')[0]!))];
  }

  async #executer(marqueId: string, travail: TravailInterne): Promise<void> {
    const g = this.#o.gestionnaires[cleGestionnaire(travail.type, travail.objet)] ?? this.#o.gestionnaires[travail.type];
    if (g === undefined) {
      await this.#o.echeances.echouerTravail(marqueId, travail.id, 'SANS_GESTIONNAIRE', this.#maintenant());
      return;
    }
    try {
      await g(travail);
      await this.#o.echeances.terminerTravail(marqueId, travail.id, this.#maintenant());
    } catch (erreur) {
      const cause = erreur instanceof ErreurTravail ? erreur.cause_ : 'ECHEC';
      if (!(erreur instanceof ErreurTravail)) this.#o.journal.error({ travail: travail.id, type: travail.type, erreur: erreur instanceof Error ? erreur.message : String(erreur) }, 'travail interne en échec');
      await this.#o.echeances.echouerTravail(marqueId, travail.id, cause, this.#maintenant());
    }
  }

  /** Démarre : une première passe tout de suite (le rattrapage), puis une par période. */
  async demarrer(): Promise<void> {
    const tourner = async (): Promise<void> => {
      if (this.#enCours || this.#arrete) return;
      this.#enCours = true;
      try {
        await this.passer();
      } catch (erreur) {
        this.#o.journal.error({ erreur: erreur instanceof Error ? erreur.message : String(erreur) }, 'passe du planificateur en échec');
      } finally {
        this.#enCours = false;
      }
    };
    await tourner();
    this.#minuterie = setInterval(() => void tourner(), this.#o.periodeMs ?? 60_000);
  }

  arreter(): void {
    this.#arrete = true;
    if (this.#minuterie !== undefined) clearInterval(this.#minuterie);
    this.#minuterie = undefined;
  }
}
