// regie — montages, fichiers et rendus en mémoire pour les tests (histoire 4.6). Mêmes règles que MontagesPg : un
// montage ne change plus, une nouvelle version est une nouvelle ligne, `perimee` si le parent n'est plus la dernière.
import type { Timeline } from '@regie/contrats';
import type { GabaritFige } from '../src/domaine/montage.ts';
import type { EntreeBibliotheque, Fichier, FinRendu, LegendeEnregistree, GenreRendu, Montage, Montages, NouveauFichier, Rendu, ResultatVersion, SuppressionVideo } from '../src/infra/montages.ts';

export class MontagesMemoire implements Montages {
  readonly montages: Montage[] = [];
  readonly fichiers: Fichier[] = [];
  readonly rendus: Rendu[] = [];
  readonly legendes: LegendeEnregistree[] = [];
  /** Séries archivées (AAAA : date d'archivage) et vidéos supprimées (le journal `suppressions`). */
  readonly archivees = new Map<string, Date>();
  readonly suppressions: { serieId: string; fichiers: number; utilisateurId: string }[] = [];
  /** Séries ayant une publication publiée : la table `publications` n'existe pas encore (épopée 7). */
  readonly publiees = new Set<string>();
  /** Appelé à chaque nouvelle version, comme le fait la requête de `MontagesPg.creerVersion` (publications programmées, histoire 7.4). */
  surVersion: (serieId: string) => void = () => undefined;
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
    this.surVersion(m.serieId);
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

  async bibliotheque(_m: string, _u: string, filtre: { espaceId?: string; limite?: number } = {}): Promise<EntreeBibliotheque[]> {
    const dernieres = this.montages.filter((m) => this.#visible(m.espaceId) && (filtre.espaceId === undefined || m.espaceId === filtre.espaceId) && m.numero === Math.max(...this.montages.filter((x) => x.serieId === m.serieId).map((x) => x.numero)));
    return dernieres
      .sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime())
      .slice(0, filtre.limite ?? 200)
      .map((montage) => ({ montage, rendus: this.rendus.filter((r) => r.montageId === montage.id).sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime()), archiveeLe: this.archivees.get(montage.serieId) ?? null }));
  }

  async archiver(_m: string, _u: string, serieId: string, archivee: boolean): Promise<boolean> {
    const serie = this.montages.find((m) => m.serieId === serieId);
    if (serie === undefined || !this.#visible(serie.espaceId)) return false;
    if (archivee) this.archivees.set(serieId, this.archivees.get(serieId) ?? new Date(this.maintenant()));
    else this.archivees.delete(serieId);
    return true;
  }

  async supprimerVideo(_m: string, utilisateurId: string, serieId: string): Promise<SuppressionVideo | undefined> {
    const versions = this.montages.filter((m) => m.serieId === serieId);
    if (versions.length === 0 || !this.#visible(versions[0]!.espaceId)) return undefined;
    if (this.publiees.has(serieId)) {
      const e = new Error('VIDEO_PUBLIEE');
      e.name = 'ErreurVideoPubliee';
      throw e;
    }
    const ids = new Set(versions.map((m) => m.id));
    const aRetirer = new Set([...versions.map((m) => m.filmFichierId), ...this.rendus.filter((r) => ids.has(r.montageId) && r.fichierId !== null).map((r) => r.fichierId!), ...this.fichiers.filter((f) => f.montageId !== null && ids.has(f.montageId)).map((f) => f.id)]);
    const retires = this.fichiers.filter((f) => aRetirer.has(f.id)).map((f) => ({ id: f.id, espaceId: f.espaceId }));
    this.rendus.splice(0, this.rendus.length, ...this.rendus.filter((r) => !ids.has(r.montageId)));
    this.legendes.splice(0, this.legendes.length, ...this.legendes.filter((l) => l.serieId !== serieId));
    this.fichiers.splice(0, this.fichiers.length, ...this.fichiers.filter((f) => !aRetirer.has(f.id)));
    this.montages.splice(0, this.montages.length, ...this.montages.filter((m) => m.serieId !== serieId));
    this.archivees.delete(serieId);
    this.suppressions.push({ serieId, fichiers: retires.length, utilisateurId });
    return { fichiers: retires };
  }

  async aPublicationPubliee(_m: string, _u: string, serieId: string): Promise<boolean> {
    return this.publiees.has(serieId);
  }

  async lireLegende(_m: string, _u: string, serieId: string, reseau: string): Promise<LegendeEnregistree | undefined> {
    const serie = this.montages.find((m) => m.serieId === serieId);
    if (serie === undefined || !this.#visible(serie.espaceId)) return undefined;
    return this.legendes.find((l) => l.serieId === serieId && l.reseau === reseau);
  }

  async enregistrerLegende(n: { marqueId: string; utilisateurId: string; serieId: string; reseau: string; legende: string; hashtags: readonly string[] }): Promise<LegendeEnregistree | undefined> {
    const serie = this.montages.find((m) => m.serieId === n.serieId);
    if (serie === undefined || !this.#visible(serie.espaceId)) return undefined;
    const l: LegendeEnregistree = { serieId: n.serieId, reseau: n.reseau, legende: n.legende, hashtags: [...n.hashtags], majLe: new Date(this.maintenant()) };
    const i = this.legendes.findIndex((x) => x.serieId === n.serieId && x.reseau === n.reseau);
    if (i < 0) this.legendes.push(l);
    else this.legendes[i] = l;
    return l;
  }
}
