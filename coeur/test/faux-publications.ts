// regie — publications en mémoire pour les tests (histoires 7.3 à 7.5). Mêmes règles que PublicationsPg : une seule
// publication non annulée par compte et par vidéo, passages d'état en compare-and-set, historique des tentatives. Le faux
// tient aussi `montages.publiees` à jour (une vidéo en ligne ne se supprime pas), comme le fait la requête SQL.

import { estEnLigne, peutAnnuler } from '../src/domaine/publication.ts';
import { epochDe, TYPE_ECHEANCE_PUBLICATION, objetEcheancePublication } from '../src/domaine/publication.ts';
import type { EtatPublication } from '../src/domaine/publication.ts';
import type { Cible, FinPublication, FiltrePublications, NouvellePublication, Publication, Publications, QuiTente, ResultatCreation, TentativePublication } from '../src/infra/publications.ts';
import type { EspacesMemoire } from './faux-auth.ts';
import type { MontagesMemoire } from './faux-montages.ts';

type Modifiable<T> = { -readonly [K in keyof T]: T[K] };
type Tentative = Modifiable<TentativePublication> & { publicationId: string };

/** L'échéance inscrite avec une publication programmée : le faux en tient la liste, comme la table `echeances`. */
export type EcheanceMemoire = { type: string; objet: string; instant: Date; etat: 'programmee' | 'declenchee' | 'echouee' | 'annulee' };

export class PublicationsMemoire implements Publications {
  readonly lignes: Modifiable<Publication>[] = [];
  readonly echeances: EcheanceMemoire[] = [];
  readonly historique: Tentative[] = [];
  maintenant: () => number = Date.now;
  readonly #espaces: EspacesMemoire;
  readonly #montages: MontagesMemoire;

  constructor(espaces: EspacesMemoire, montages: MontagesMemoire) {
    this.#espaces = espaces;
    this.#montages = montages;
  }

  #visibles(marqueId: string, utilisateurId: string): string[] {
    return this.#espaces.tous.filter((e) => e.marqueId === marqueId && e.proprietaireId === utilisateurId).map((e) => e.id);
  }

  #trouver(marqueId: string, utilisateurId: string, id: string): Modifiable<Publication> | undefined {
    const visibles = this.#visibles(marqueId, utilisateurId);
    return this.lignes.find((l) => l.id === id && visibles.includes(l.espaceId));
  }

  /** Recalcule, pour la vidéo, ce que la requête SQL `aPublicationPubliee` lit. */
  #synchroniser(serieId: string): void {
    if (this.lignes.some((l) => l.serieId === serieId && estEnLigne(l.etat))) this.#montages.publiees.add(serieId);
    else this.#montages.publiees.delete(serieId);
  }

  #touche(p: Modifiable<Publication>): Publication {
    p.modifieLe = new Date(this.maintenant());
    this.#synchroniser(p.serieId);
    return { ...p };
  }

  async creer(n: NouvellePublication): Promise<ResultatCreation> {
    if (!this.#visibles(n.marqueId, n.utilisateurId).includes(n.espaceId)) return { etat: 'introuvable' };
    const montage = this.#montages.montages.find((m) => m.id === n.montageId && m.espaceId === n.espaceId);
    if (montage === undefined) return { etat: 'introuvable' };
    const existante = this.lignes.find((l) => l.compteId === n.compteId && l.serieId === n.serieId && l.etat !== 'annulee');
    if (existante !== undefined) return { etat: 'existe', id: existante.id };
    const t = new Date(this.maintenant());
    const p: Modifiable<Publication> = {
      id: crypto.randomUUID(), espaceId: n.espaceId, utilisateurId: n.utilisateurId, compteId: n.compteId, reseau: n.reseau, serieId: n.serieId,
      montageId: n.montageId, renduId: n.renduId, legende: n.legende, hashtags: [...n.hashtags], etat: n.etat, cleIdempotence: crypto.randomUUID(),
      tacheId: null, programmeePour: n.programmeePour ?? null, idExterne: null, lien: null, cause: null, action: null, tentatives: 0, creeLe: t, modifieLe: t, publieeLe: null,
    };
    this.lignes.push(p);
    if (p.etat === 'programmee' && p.programmeePour !== null) this.#inscrire(p, p.programmeePour);
    this.#synchroniser(p.serieId);
    return { etat: 'ok', publication: { ...p } };
  }

  #inscrire(p: Publication, quand: Date): void {
    this.echeances.push({ type: TYPE_ECHEANCE_PUBLICATION, objet: objetEcheancePublication(p.id, p.utilisateurId, quand), instant: quand, etat: 'programmee' });
  }

  #retirer(p: Publication): void {
    if (p.programmeePour === null) return;
    const objet = objetEcheancePublication(p.id, p.utilisateurId, p.programmeePour);
    for (const e of this.echeances) if (e.objet === objet && e.etat === 'programmee') e.etat = 'annulee';
  }

  async lire(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    return p === undefined ? undefined : { ...p };
  }

  async lister(marqueId: string, utilisateurId: string, filtre: FiltrePublications = {}): Promise<Publication[]> {
    const visibles = this.#visibles(marqueId, utilisateurId);
    return this.lignes
      .filter((l) => visibles.includes(l.espaceId) && (filtre.espaceId === undefined || l.espaceId === filtre.espaceId) && (filtre.serieId === undefined || l.serieId === filtre.serieId) && (filtre.reseau === undefined || l.reseau === filtre.reseau) && (filtre.etat === undefined || l.etat === filtre.etat))
      .sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime())
      .slice(0, filtre.limite ?? 200)
      .map((l) => ({ ...l }));
  }

  async tentatives(marqueId: string, utilisateurId: string, id: string): Promise<TentativePublication[]> {
    if (this.#trouver(marqueId, utilisateurId, id) === undefined) return [];
    return this.historique.filter((t) => t.publicationId === id).sort((a, b) => a.numero - b.numero).map(({ publicationId: _p, ...t }) => ({ ...t }));
  }

  async lierTache(marqueId: string, utilisateurId: string, id: string, tacheId: string): Promise<void> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p !== undefined && (p.etat === 'en_file' || p.etat === 'programmee' || p.etat === 'en_attente_confirmation')) {
      p.tacheId = tacheId;
      this.#touche(p);
    }
  }

  #ouvrir(p: Modifiable<Publication>, tacheId: string, qui: QuiTente, issue: Tentative['issue'], cause: string | null): void {
    const t = new Date(this.maintenant());
    this.historique.push({ publicationId: p.id, numero: p.tentatives, origine: qui.origine, utilisateurId: p.utilisateurId, pat: qui.pat, tacheId, debut: t, fin: issue === 'en_cours' ? null : t, issue, cause });
  }

  async demarrerEnvoi(marqueId: string, utilisateurId: string, id: string, tacheId: string, qui: QuiTente): Promise<number | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || p.etat !== 'en_file' || p.tacheId !== tacheId) return undefined;
    p.etat = 'envoi_en_cours';
    p.tentatives += 1;
    p.cause = null;
    p.action = null;
    this.#touche(p);
    this.#ouvrir(p, tacheId, qui, 'en_cours', null);
    return p.tentatives;
  }

  async echouerAvantEnvoi(marqueId: string, utilisateurId: string, id: string, tacheId: string, qui: QuiTente, cause: string, action: string): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || p.etat !== 'en_file' || p.tacheId !== tacheId) return undefined;
    p.etat = 'en_echec';
    p.tentatives += 1;
    p.cause = cause;
    p.action = action;
    this.#ouvrir(p, tacheId, qui, 'en_echec', cause);
    return this.#touche(p);
  }

  async conclure(marqueId: string, utilisateurId: string, id: string, fin: FinPublication): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || p.etat !== 'envoi_en_cours') return undefined;
    if (fin.etat === 'publiee') {
      p.etat = 'publiee';
      p.idExterne = fin.idExterne;
      p.lien = fin.lien;
      p.publieeLe = new Date(this.maintenant());
      p.cause = null;
      p.action = null;
    } else {
      p.etat = fin.etat;
      p.cause = fin.cause;
      p.action = fin.action;
    }
    const t = this.historique.find((x) => x.publicationId === id && x.numero === p.tentatives);
    if (t !== undefined) {
      t.fin = new Date(this.maintenant());
      t.issue = fin.etat;
      t.cause = fin.etat === 'publiee' ? null : fin.cause;
    }
    return this.#touche(p);
  }

  async rejouer(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || p.etat !== 'en_echec') return undefined;
    p.etat = 'en_file';
    p.cleIdempotence = crypto.randomUUID();
    p.tacheId = null;
    p.cause = null;
    p.action = null;
    return this.#touche(p);
  }

  async annuler(marqueId: string, utilisateurId: string, id: string): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || !peutAnnuler(p.etat)) return undefined;
    p.etat = 'annulee';
    p.cause = null;
    p.action = null;
    this.#retirer(p);
    return this.#touche(p);
  }

  async deplacer(marqueId: string, utilisateurId: string, id: string, quand: Date): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || (p.etat !== 'programmee' && p.etat !== 'en_attente_confirmation')) return undefined;
    this.#retirer(p);
    p.programmeePour = quand;
    this.#inscrire(p, quand);
    return this.#touche(p);
  }

  async confirmer(marqueId: string, utilisateurId: string, id: string, cible: Cible): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || p.etat !== 'en_attente_confirmation') return undefined;
    p.etat = 'programmee';
    p.montageId = cible.montageId;
    p.renduId = cible.renduId;
    p.legende = cible.legende;
    p.hashtags = [...cible.hashtags];
    p.cause = null;
    p.action = null;
    return this.#touche(p);
  }

  async lancerEcheance(marqueId: string, utilisateurId: string, id: string, epoch: number): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || p.programmeePour === null || epochDe(p.programmeePour) !== epoch) return undefined;
    if (p.etat === 'programmee') {
      p.etat = 'en_file';
      p.cause = null;
      p.action = null;
      return this.#touche(p);
    }
    return p.etat === 'en_file' && p.tacheId === null && p.tentatives === 0 ? { ...p } : undefined;
  }

  async echouerProgrammee(marqueId: string, utilisateurId: string, id: string, epoch: number, depuis: readonly EtatPublication[], cause: string, action: string): Promise<Publication | undefined> {
    const p = this.#trouver(marqueId, utilisateurId, id);
    if (p === undefined || p.programmeePour === null || epochDe(p.programmeePour) !== epoch || !depuis.includes(p.etat)) return undefined;
    p.etat = 'en_echec';
    p.tentatives += 1;
    p.cause = cause;
    p.action = action;
    const t = new Date(this.maintenant());
    this.historique.push({ publicationId: p.id, numero: p.tentatives, origine: 'echeance', utilisateurId: p.utilisateurId, pat: null, tacheId: null, debut: t, fin: t, issue: 'en_echec', cause });
    return this.#touche(p);
  }

  /** Ce que fait `MontagesPg.creerVersion` dans sa transaction : les publications programmées de la vidéo attendent l'accord. */
  montageModifie(serieId: string): void {
    for (const p of this.lignes) {
      if (p.serieId !== serieId || p.etat !== 'programmee') continue;
      p.etat = 'en_attente_confirmation';
      p.cause = 'MONTAGE_MODIFIE';
      p.action = 'confirmer';
      this.#touche(p);
    }
  }

  async fichierEnEnvoi(marqueId: string, utilisateurId: string, fichierId: string): Promise<boolean> {
    const visibles = this.#visibles(marqueId, utilisateurId);
    return this.lignes.some((p) => p.etat === 'envoi_en_cours' && visibles.includes(p.espaceId) && this.#montages.rendus.some((r) => r.id === p.renduId && r.fichierId === fichierId));
  }

  async rattraper(marqueId: string, utilisateurId: string, tacheId: string, issue: Readonly<{ terminee: true; idExterne: string; lien: string } | { terminee: false; cause: string }>): Promise<Publication | undefined> {
    const visibles = this.#visibles(marqueId, utilisateurId);
    const p = this.lignes.find((l) => l.tacheId === tacheId && visibles.includes(l.espaceId));
    if (p === undefined) return undefined;
    if (issue.terminee) {
      if (p.etat !== 'envoi_en_cours') return undefined;
      p.etat = 'publiee';
      p.idExterne = issue.idExterne;
      p.lien = issue.lien;
      p.publieeLe = new Date(this.maintenant());
      p.cause = null;
      p.action = null;
    } else {
      if (p.etat !== 'en_file' && p.etat !== 'envoi_en_cours') return undefined;
      const sure = p.etat === 'en_file';
      p.etat = sure ? 'en_echec' : 'incertaine';
      p.cause = sure ? issue.cause : 'RESULTAT_INCONNU';
      p.action = sure ? 'relancer' : 'verifier';
    }
    if (p.tentatives > 0) {
      const t = this.historique.find((x) => x.publicationId === p.id && x.numero === p.tentatives && x.issue === 'en_cours');
      if (t !== undefined) {
        t.fin = t.fin ?? new Date(this.maintenant());
        t.issue = p.etat as Tentative['issue'];
        t.cause = p.etat === 'publiee' ? null : p.cause;
      }
    }
    return this.#touche(p);
  }
}
