// regie — montages, fichiers et rendus en mémoire pour les tests (histoire 4.6). Mêmes règles que MontagesPg : un
// montage ne change plus, une nouvelle version est une nouvelle ligne, `perimee` si le parent n'est plus la dernière.
import type { Timeline } from '@regie/contrats';
import type { GabaritFige } from '../src/domaine/montage.ts';
import type { Fichier, FinRendu, GenreRendu, Montage, Montages, NouveauFichier, Rendu, ResultatVersion } from '../src/infra/montages.ts';

export class MontagesMemoire implements Montages {
  readonly montages: Montage[] = [];
  readonly fichiers: Fichier[] = [];
  readonly rendus: Rendu[] = [];
  /** Espaces que la personne voit : `undefined` = tous (la RLS est testée avec PostgreSQL). */
  espacesVisibles: readonly string[] | undefined;
  maintenant = (): number => Date.now();

  readonly #visible = (espaceId: string): boolean => this.espacesVisibles === undefined || this.espacesVisibles.includes(espaceId);

  async creerDepuisFilm(n: { marqueId: string; utilisateurId: string; espaceId: string; scriptId: string | null; montageId: string; film: NouveauFichier; timeline: Timeline; gabarit: GabaritFige }): Promise<Montage | undefined> {
    if (!this.#visible(n.espaceId)) return undefined;
    this.fichiers.push({ id: n.film.id, espaceId: n.espaceId, genre: 'film', mime: n.film.mime, octets: n.film.octets, sha256: n.film.sha256, dureeMs: n.film.dureeMs ?? null, montageId: null, sceneId: null, creeLe: new Date(this.maintenant()), purgeLe: null });
    const m: Montage = { id: n.montageId, espaceId: n.espaceId, scriptId: n.scriptId, serieId: n.montageId, numero: 1, parentId: null, origine: 'jeu', filmFichierId: n.film.id, timeline: structuredClone(n.timeline), gabarit: structuredClone(n.gabarit), creeLe: new Date(this.maintenant()) };
    this.montages.push(m);
    return m;
  }

  async creerVersion(n: { marqueId: string; utilisateurId: string; parentId: string; origine: 'edition' | 'gabarit'; timeline: Timeline; gabarit?: GabaritFige }): Promise<ResultatVersion> {
    const p = this.montages.find((m) => m.id === n.parentId);
    if (p === undefined || !this.#visible(p.espaceId)) return { etat: 'introuvable' };
    const dernier = Math.max(...this.montages.filter((m) => m.serieId === p.serieId).map((m) => m.numero));
    if (dernier !== p.numero) return { etat: 'perimee', derniere: dernier };
    const m: Montage = { id: crypto.randomUUID(), espaceId: p.espaceId, scriptId: p.scriptId, serieId: p.serieId, numero: dernier + 1, parentId: p.id, origine: n.origine, filmFichierId: p.filmFichierId, timeline: structuredClone(n.timeline), gabarit: structuredClone(n.gabarit ?? p.gabarit), creeLe: new Date(this.maintenant()) };
    this.montages.push(m);
    return { etat: 'ok', montage: m };
  }

  async lire(_m: string, _u: string, id: string): Promise<Montage | undefined> {
    const m = this.montages.find((x) => x.id === id);
    return m !== undefined && this.#visible(m.espaceId) ? m : undefined;
  }

  async listerSerie(_m: string, _u: string, serieId: string): Promise<Montage[]> {
    return this.montages.filter((m) => m.serieId === serieId && this.#visible(m.espaceId)).sort((a, b) => b.numero - a.numero);
  }

  async listerDernieres(_m: string, _u: string, filtre: { scriptId?: string; limite?: number } = {}): Promise<Montage[]> {
    return this.montages
      .filter((m) => this.#visible(m.espaceId) && (filtre.scriptId === undefined || m.scriptId === filtre.scriptId) && m.numero === Math.max(...this.montages.filter((x) => x.serieId === m.serieId).map((x) => x.numero)))
      .sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime())
      .slice(0, filtre.limite ?? 50);
  }

  async ajouterFichier(_m: string, _u: string, espaceId: string, f: NouveauFichier): Promise<Fichier> {
    const fichier: Fichier = { id: f.id, espaceId, genre: f.genre, mime: f.mime, octets: f.octets, sha256: f.sha256, dureeMs: f.dureeMs ?? null, montageId: f.montageId ?? null, sceneId: f.sceneId ?? null, creeLe: new Date(this.maintenant()), purgeLe: null };
    this.fichiers.push(fichier);
    return fichier;
  }

  async lireFichier(_m: string, _u: string, id: string): Promise<Fichier | undefined> {
    const f = this.fichiers.find((x) => x.id === id);
    return f !== undefined && this.#visible(f.espaceId) ? f : undefined;
  }

  async listerVoix(_m: string, _u: string, montageId: string): Promise<Fichier[]> {
    const par = new Map<string, Fichier>();
    for (const f of this.fichiers.filter((x) => x.genre === 'voix' && x.montageId === montageId && x.sceneId !== null)) {
      const avant = par.get(f.sceneId!);
      if (avant === undefined || f.creeLe >= avant.creeLe) par.set(f.sceneId!, f);
    }
    return [...par.values()];
  }

  async marquerPurge(_m: string, _u: string, id: string, quand: Date): Promise<boolean> {
    const i = this.fichiers.findIndex((x) => x.id === id && x.purgeLe === null);
    if (i < 0) return false;
    this.fichiers[i] = { ...this.fichiers[i]!, purgeLe: quand };
    return true;
  }

  async creerRendu(n: { marqueId: string; utilisateurId: string; montageId: string; genre: GenreRendu }): Promise<Rendu | undefined> {
    const m = this.montages.find((x) => x.id === n.montageId);
    if (m === undefined || !this.#visible(m.espaceId)) return undefined;
    const r: Rendu = { id: crypto.randomUUID(), espaceId: m.espaceId, montageId: m.id, genre: n.genre, etat: 'en_file', tacheId: null, fichierId: null, violations: [], cause: null, creeLe: new Date(this.maintenant()), termineLe: null };
    this.rendus.push(r);
    return r;
  }

  #maj(id: string, f: (r: Rendu) => Rendu): void {
    const i = this.rendus.findIndex((r) => r.id === id);
    if (i >= 0) this.rendus[i] = f(this.rendus[i]!);
  }

  async lierTache(_m: string, _u: string, renduId: string, tacheId: string): Promise<void> {
    this.#maj(renduId, (r) => ({ ...r, tacheId }));
  }

  async lireRendu(_m: string, _u: string, id: string): Promise<Rendu | undefined> {
    const r = this.rendus.find((x) => x.id === id);
    return r !== undefined && this.#visible(r.espaceId) ? r : undefined;
  }

  async lireRenduDeTache(_m: string, _u: string, tacheId: string): Promise<Rendu | undefined> {
    return [...this.rendus].reverse().find((x) => x.tacheId === tacheId && this.#visible(x.espaceId));
  }

  async listerRendus(_m: string, _u: string, montageId: string): Promise<Rendu[]> {
    return this.rendus.filter((r) => r.montageId === montageId && this.#visible(r.espaceId)).sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime());
  }

  async demarrerRendu(_m: string, _u: string, id: string): Promise<void> {
    this.#maj(id, (r) => (r.etat === 'en_file' || r.etat === 'en_cours' ? { ...r, etat: 'en_cours' } : r));
  }

  async terminerRendu(_m: string, _u: string, id: string, fin: FinRendu): Promise<void> {
    this.#maj(id, (r) => ({ ...r, etat: fin.etat, fichierId: fin.fichierId ?? null, violations: fin.violations ?? [], cause: fin.cause ?? null, termineLe: new Date(this.maintenant()) }));
  }
}
