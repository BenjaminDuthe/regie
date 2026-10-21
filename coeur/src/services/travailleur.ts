// regie — le travailleur de la file (histoire 2.1, AR-15) : prend les tâches prêtes, les exécute en renouvelant son
// bail, termine ou fait échouer, reprend celles d'un service mort, et applique les résultats une seule fois.
// Une seule tâche à la fois par travailleur (la machine n'a qu'un GPU). Aucune équité entre comptes (recentrage du
// 2026-10-18) : l'ordre est celui de la file (classe, puis ancienneté).

import { BAIL_S, RENOUVELLEMENT_S, type Applicateur, type File, type Tache } from '../infra/file.ts';

/** Échec d'un exécutant avec sa cause (code) et l'action conseillée ; `reessayer` : la file peut retenter. */
export class ErreurTache extends Error {
  readonly cause_: string;
  readonly action: string;
  readonly reessayer: boolean;

  constructor(cause: string, action: string, reessayer: boolean) {
    super(cause);
    this.name = 'ErreurTache';
    this.cause_ = cause;
    this.action = action;
    this.reessayer = reessayer;
  }
}

export type AideExecutant = Readonly<{
  /** Se déclenche quand le bail est perdu (annulation, délai de garde, reprise par un autre) : il faut s'arrêter. */
  signal: AbortSignal;
  /** À appeler juste avant l'effet extérieur : plus d'annulation ni de reprise automatique après. */
  pointDeNonRetour: () => Promise<void>;
}>;

export type Executant = Readonly<{
  executer: (tache: Tache, aide: AideExecutant) => Promise<unknown>;
  /** Applique le résultat dans la transaction de la base ; une seule fois par tâche. */
  appliquer?: Applicateur;
}>;

export type Journal = Readonly<{ info: (o: object, m: string) => void; warn: (o: object, m: string) => void; error: (o: object, m: string) => void }>;

export type OptionsTravailleur = Readonly<{
  file: File;
  marques: () => Promise<readonly string[]>;
  executants: Readonly<Record<string, Executant>>;
  service: string;
  journal: Journal;
  bailS?: number;
  renouvellementS?: number;
  /** Intervalle de prise des tâches, en ms. */
  sondageMs?: number;
  /** Balayage de l'application des résultats, en ms (30 s). */
  balayageMs?: number;
}>;

export class Travailleur {
  readonly #o: OptionsTravailleur;
  readonly #bailS: number;
  readonly #renouvellementS: number;
  #minuteries: NodeJS.Timeout[] = [];
  #enCours = false;
  #arrete = false;

  constructor(options: OptionsTravailleur) {
    this.#o = options;
    this.#bailS = options.bailS ?? BAIL_S;
    this.#renouvellementS = options.renouvellementS ?? RENOUVELLEMENT_S;
  }

  /** Prend et exécute une tâche de cette marque. Rend faux s'il n'y en avait pas. */
  async traiterUne(marqueId: string): Promise<boolean> {
    const { file, service, journal } = this.#o;
    const tache = await file.prendre(marqueId, service, this.#bailS, this.#renouvellementS);
    if (tache === undefined) return false;
    const executant = this.#o.executants[tache.type];
    if (executant === undefined) {
      await file.echouer(marqueId, tache.id, service, 'TYPE_SANS_EXECUTANT', 'verifier', false);
      journal.error({ tache: tache.id, type: tache.type }, 'tâche sans exécutant');
      return true;
    }
    const arret = new AbortController();
    // Renouvelle le bail tant que la tâche tourne ; s'il est perdu, l'exécutant en est averti.
    const renouvellement = setInterval(() => {
      file.renouveler(marqueId, tache.id, service, this.#bailS).then(
        (ok) => {
          if (!ok) arret.abort();
        },
        () => undefined, // une base injoignable un instant : le prochain renouvellement réessaie, le bail couvre trois essais
      );
    }, this.#renouvellementS * 1000);
    try {
      const resultat = await executant.executer(tache, {
        signal: arret.signal,
        pointDeNonRetour: async () => {
          if (!(await file.pointDeNonRetour(marqueId, tache.id, service))) throw new ErreurTache('TACHE_PERDUE', 'relancer', false);
        },
      });
      if (!(await file.terminer(marqueId, tache.id, service, resultat))) journal.warn({ tache: tache.id }, 'résultat écarté : la tâche n’est plus à ce service');
    } catch (erreur) {
      if (erreur instanceof ErreurTache) {
        await file.echouer(marqueId, tache.id, service, erreur.cause_, erreur.action, erreur.reessayer);
      } else {
        // Le message brut peut citer un chemin ou une valeur : il va au journal (masqué), pas dans la base.
        journal.error({ tache: tache.id, type: tache.type, erreur: erreur instanceof Error ? erreur.message : String(erreur) }, 'tâche en échec');
        await file.echouer(marqueId, tache.id, service, 'ECHEC', 'relancer', true);
      }
    } finally {
      clearInterval(renouvellement);
    }
    return true;
  }

  /** Une passe : reprise des tâches d'un service mort, puis prise de tout ce qui est prêt. Rend le nombre de tâches exécutées. */
  async passer(): Promise<number> {
    let faites = 0;
    for (const marqueId of await this.#o.marques()) {
      await this.#o.file.recuperer(marqueId);
      while (!this.#arrete && (await this.traiterUne(marqueId))) faites += 1;
    }
    return faites;
  }

  /** Applique les résultats des tâches terminées : exécutant par type, une seule fois. */
  async appliquer(): Promise<number> {
    let total = 0;
    for (const marqueId of await this.#o.marques()) {
      total += await this.#o.file.appliquerResultats(marqueId, async (tache, transaction) => {
        await this.#o.executants[tache.type]?.appliquer?.(tache, transaction);
      });
    }
    return total;
  }

  /** Démarre : application des résultats d'abord (ceux qu'un arrêt a laissés), puis les passes périodiques. */
  async demarrer(): Promise<void> {
    await this.#sansBruit(() => this.appliquer());
    const tourner = (travail: () => Promise<unknown>) => async () => {
      if (this.#enCours || this.#arrete) return;
      this.#enCours = true;
      try {
        await this.#sansBruit(travail);
      } finally {
        this.#enCours = false;
      }
    };
    this.#minuteries.push(setInterval(tourner(async () => { await this.passer(); await this.appliquer(); }), this.#o.sondageMs ?? 2000));
    this.#minuteries.push(setInterval(tourner(() => this.appliquer()), this.#o.balayageMs ?? 30_000));
  }

  /** Réveil sur NOTIFY : applique tout de suite les résultats qui viennent d'arriver. */
  surNotification(): void {
    if (!this.#arrete) void this.#sansBruit(() => this.appliquer());
  }

  arreter(): void {
    this.#arrete = true;
    for (const m of this.#minuteries) clearInterval(m);
    this.#minuteries = [];
  }

  async #sansBruit(travail: () => Promise<unknown>): Promise<void> {
    try {
      await travail();
    } catch (erreur) {
      this.#o.journal.error({ erreur: erreur instanceof Error ? erreur.message : String(erreur) }, 'passe de la file en échec');
    }
  }
}
