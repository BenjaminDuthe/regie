// Double de test de la file (histoire 2.1) : mêmes règles que les fonctions SQL de la migration 0006, en mémoire.
// Les règles réelles sont éprouvées contre PostgreSQL (postgres.integration.test.ts) ; ce double sert aux tests du
// travailleur, des actions et des pages, qui n'ont pas de base.

import { TACHES, type EtatTache } from '@regie/contrats';
import { ErreurFile, type Applicateur, type File, type OptionsEnfiler, type Tache, type Tentative } from '../src/infra/file.ts';

type Modifiable = { -readonly [K in keyof Tache]: Tache[K] } & { serie: number };

export class FileMemoire implements File {
  readonly taches: Modifiable[] = [];
  readonly tentatives = new Map<string, { numero: number; debut: Date; fin: Date | undefined; issue: string; cause: string | undefined }[]>();
  maintenant: () => number = Date.now;
  /** Appels de NOTIFY (un par tâche terminée). */
  readonly notifications: string[] = [];

  async enfiler(marqueId: string, utilisateurId: string, type: string, entree: Readonly<Record<string, unknown>>, options: OptionsEnfiler = {}): Promise<Tache> {
    const d = TACHES[type];
    if (d === undefined) throw new ErreurFile(`type de tâche inconnu : ${type}`);
    const t: Modifiable = {
      id: crypto.randomUUID(), marqueId, utilisateurId, type, classe: d.classe, gpu: d.gpu, reprise: d.reprise,
      delaiGardeS: options.delaiGardeS ?? d.delaiGardeS, tentativesMax: d.tentativesMax, entree, etat: 'prete', tentatives: 0, serie: 0, reprises: 0,
      disponibleLe: options.disponibleLe ?? new Date(this.maintenant()), verrouPar: undefined, bailJusqua: undefined, pointDeNonRetour: false,
      resultat: undefined, cause: undefined, action: undefined, creeLe: new Date(this.maintenant()), demarreeLe: undefined, termineeLe: undefined, resultatAppliqueLe: undefined,
    };
    this.taches.push(t);
    return { ...t };
  }

  #de(marqueId: string, id: string): Modifiable | undefined {
    return this.taches.find((t) => t.id === id && t.marqueId === marqueId);
  }

  #tentative(id: string, numero: number, issue: string, cause?: string): void {
    const l = this.tentatives.get(id)?.find((x) => x.numero === numero);
    if (l !== undefined) Object.assign(l, { fin: new Date(this.maintenant()), issue, cause });
  }

  async prendre(marqueId: string, service: string, bailS = 60, renouvellementS = 15): Promise<Tache | undefined> {
    if (renouvellementS < 1 || bailS < 3 * renouvellementS) throw new ErreurFile('bail trop court : au moins 3 fois l’intervalle de renouvellement');
    const maintenant = this.maintenant();
    const gpuPris = this.taches.some((t) => t.gpu && t.etat === 'en_cours');
    const candidates = this.taches
      .filter((t) => t.marqueId === marqueId && t.etat === 'prete' && t.disponibleLe.getTime() <= maintenant && !(t.gpu && gpuPris))
      .sort((a, b) => Number(b.classe === 'interactive') - Number(a.classe === 'interactive') || a.disponibleLe.getTime() - b.disponibleLe.getTime() || a.creeLe.getTime() - b.creeLe.getTime());
    const t = candidates[0];
    if (t === undefined) return undefined;
    Object.assign(t, { etat: 'en_cours', tentatives: t.tentatives + 1, verrouPar: service, bailJusqua: new Date(maintenant + bailS * 1000), demarreeLe: new Date(maintenant), cause: undefined, action: undefined });
    this.tentatives.set(t.id, [...(this.tentatives.get(t.id) ?? []), { numero: t.tentatives, debut: new Date(maintenant), fin: undefined, issue: 'en_cours', cause: undefined }]);
    return { ...t };
  }

  async renouveler(marqueId: string, id: string, service: string, bailS = 60): Promise<boolean> {
    const t = this.#de(marqueId, id);
    const maintenant = this.maintenant();
    if (t === undefined || t.etat !== 'en_cours' || t.verrouPar !== service || t.demarreeLe!.getTime() + t.delaiGardeS * 1000 <= maintenant) return false;
    t.bailJusqua = new Date(maintenant + bailS * 1000);
    return true;
  }

  async terminer(marqueId: string, id: string, service: string, resultat: unknown): Promise<boolean> {
    const t = this.#de(marqueId, id);
    if (t === undefined || t.etat !== 'en_cours' || t.verrouPar !== service) return false;
    Object.assign(t, { etat: 'terminee', resultat: resultat ?? undefined, termineeLe: new Date(this.maintenant()), bailJusqua: undefined });
    this.#tentative(id, t.tentatives, 'terminee');
    this.notifications.push(marqueId);
    return true;
  }

  async echouer(marqueId: string, id: string, service: string, cause: string, action: string, reessayer: boolean): Promise<EtatTache | undefined> {
    const t = this.#de(marqueId, id);
    if (t === undefined || t.etat !== 'en_cours' || t.verrouPar !== service) return undefined;
    if (reessayer && !t.pointDeNonRetour && t.tentatives - t.serie < t.tentativesMax) {
      Object.assign(t, { etat: 'prete', cause, action, bailJusqua: undefined, verrouPar: undefined, disponibleLe: new Date(this.maintenant() + Math.min(3600, 15 * 2 ** (t.tentatives - t.serie - 1)) * 1000) });
      this.#tentative(id, t.tentatives, 'reprogrammee', cause);
      return 'prete';
    }
    Object.assign(t, { etat: 'echouee', cause, action, bailJusqua: undefined, termineeLe: new Date(this.maintenant()) });
    this.#tentative(id, t.tentatives, 'echouee', cause);
    return 'echouee';
  }

  async pointDeNonRetour(marqueId: string, id: string, service: string): Promise<boolean> {
    const t = this.#de(marqueId, id);
    if (t === undefined || t.etat !== 'en_cours' || t.verrouPar !== service) return false;
    t.pointDeNonRetour = true;
    return true;
  }

  async recuperer(marqueId: string): Promise<number> {
    const maintenant = this.maintenant();
    let n = 0;
    for (const t of this.taches.filter((x) => x.marqueId === marqueId && x.etat === 'en_cours')) {
      const delai = t.demarreeLe!.getTime() + t.delaiGardeS * 1000 < maintenant;
      if (!delai && !(t.bailJusqua!.getTime() < maintenant)) continue;
      n += 1;
      if (delai) {
        Object.assign(t, { etat: 'echouee', cause: 'DELAI_DEPASSE', action: 'relancer', bailJusqua: undefined, termineeLe: new Date(maintenant) });
        this.#tentative(t.id, t.tentatives, 'delai', 'DELAI_DEPASSE');
      } else if (t.reprise === 'permise' && !t.pointDeNonRetour && t.reprises === 0) {
        Object.assign(t, { etat: 'prete', reprises: t.reprises + 1, verrouPar: undefined, bailJusqua: undefined, disponibleLe: new Date(maintenant) });
        this.#tentative(t.id, t.tentatives, 'perdue', 'RESULTAT_INCONNU');
      } else {
        Object.assign(t, { etat: 'echouee', cause: 'RESULTAT_INCONNU', action: 'verifier', bailJusqua: undefined, termineeLe: new Date(maintenant) });
        this.#tentative(t.id, t.tentatives, 'perdue', 'RESULTAT_INCONNU');
      }
    }
    return n;
  }

  async appliquerResultats(marqueId: string, appliquer: Applicateur): Promise<number> {
    let n = 0;
    for (const t of this.taches.filter((x) => x.marqueId === marqueId && x.etat === 'terminee' && x.resultatAppliqueLe === undefined)) {
      await appliquer({ ...t }, undefined);
      t.resultatAppliqueLe = new Date(this.maintenant());
      n += 1;
    }
    return n;
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<Tache | undefined> {
    const t = this.#de(marqueId, id);
    return t !== undefined && t.utilisateurId === utilisateurId ? { ...t } : undefined;
  }

  async lister(marqueId: string, utilisateurId: string, limite: number): Promise<Tache[]> {
    return this.taches.filter((t) => t.marqueId === marqueId && t.utilisateurId === utilisateurId).sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime()).slice(0, limite).map((t) => ({ ...t }));
  }

  async historique(marqueId: string, utilisateurId: string, id: string): Promise<Tentative[]> {
    return (await this.lire(marqueId, utilisateurId, id)) === undefined ? [] : (this.tentatives.get(id) ?? []).map((l) => ({ ...l }));
  }

  async annuler(marqueId: string, utilisateurId: string, id: string): Promise<boolean> {
    const t = this.#de(marqueId, id);
    if (t === undefined || t.utilisateurId !== utilisateurId || !['prete', 'gelee', 'en_cours'].includes(t.etat) || t.pointDeNonRetour) return false;
    if (t.etat === 'en_cours') this.#tentative(id, t.tentatives, 'annulee');
    Object.assign(t, { etat: 'annulee', bailJusqua: undefined, termineeLe: new Date(this.maintenant()) });
    return true;
  }

  async #transition(marqueId: string, utilisateurId: string, id: string, de: EtatTache, vers: EtatTache): Promise<boolean> {
    const t = this.#de(marqueId, id);
    if (t === undefined || t.utilisateurId !== utilisateurId || t.etat !== de) return false;
    t.etat = vers;
    if (vers === 'prete') t.disponibleLe = new Date(this.maintenant());
    return true;
  }

  geler(m: string, u: string, id: string): Promise<boolean> {
    return this.#transition(m, u, id, 'prete', 'gelee');
  }

  degeler(m: string, u: string, id: string): Promise<boolean> {
    return this.#transition(m, u, id, 'gelee', 'prete');
  }

  async relancer(marqueId: string, utilisateurId: string, id: string): Promise<boolean> {
    const t = this.#de(marqueId, id);
    if (t === undefined || t.utilisateurId !== utilisateurId || t.etat !== 'echouee') return false;
    Object.assign(t, { etat: 'prete', serie: t.tentatives, reprises: 0, disponibleLe: new Date(this.maintenant()), verrouPar: undefined, bailJusqua: undefined, pointDeNonRetour: false, termineeLe: undefined, cause: undefined, action: undefined, resultat: undefined });
    return true;
  }

  async instantane(marqueId: string): Promise<Tache[]> {
    return this.taches.filter((t) => t.marqueId === marqueId && (t.etat === 'prete' || t.etat === 'en_cours')).map((t) => ({ ...t }));
  }

  async durees(marqueId: string): Promise<Record<string, number[]>> {
    const parType: Record<string, number[]> = {};
    for (const t of this.taches.filter((x) => x.marqueId === marqueId)) {
      const lignes = (this.tentatives.get(t.id) ?? []).filter((l) => l.issue === 'terminee' && l.fin !== undefined);
      for (const l of lignes) (parType[t.type] ??= []).push((l.fin!.getTime() - l.debut.getTime()) / 1000);
    }
    for (const k of Object.keys(parType)) parType[k] = parType[k]!.reverse().slice(0, 50);
    return parType;
  }
}
