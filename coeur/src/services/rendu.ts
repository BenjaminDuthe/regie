// regie — tâche de file « rendu » (histoire 4.6, FR-26, FR-28, AD-10). Elle passe un montage (timeline JSON immuable + film
// brut) dans FFmpeg, dans un conteneur jetable sans réseau ni volume : le film et les voix arrivent par l'entrée standard,
// le MP4 revient par la sortie standard. Le cœur contrôle tout (format, taille, empreinte) puis applique les gardes du
// gabarit figé du montage : une violation donne un rendu « bloqué » (visible, jamais « prêt »).

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ajusterAuxVoix, construirePlanRendu, dureeTotaleMs, type PlanRendu } from '@regie/contrats';
import { evaluerMontage, parametresTexte } from '../domaine/montage.ts';
import type { File } from '../infra/file.ts';
import type { GenreRendu, Montages, Rendu } from '../infra/montages.ts';
import type { Stockage } from '../infra/stockage.ts';
import { PREFIXE_FILM, type DemandeLanceur, type LanceurCapture } from './capture.ts';
import { RENDU_MAX_OCTETS, Reassembleur, estMp4, lignesFichier } from './flux-fichiers.ts';
import { ErreurTache, type Executant } from './travailleur.ts';

export const DELAI_RENDU_MS = 840_000;

/** Ce que le conteneur de rendu reçoit. */
export type DemandeRendu = Readonly<{
  nom: string;
  plan: PlanRendu;
  sansTexte: boolean;
  film: Uint8Array;
  voix: readonly Readonly<{ nom: string; octets: Uint8Array }>[];
  delaiMs: number;
  signal: AbortSignal;
}>;

/** Ce que le cœur sait demander : rendre un plan et rapporter les octets du MP4 (contrôlés par l'appelant). */
export interface LanceurRendu {
  rendre(demande: DemandeRendu): Promise<Buffer>;
}

const resultatConteneur = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), octets: z.number().int().min(0) }),
  z.strictObject({ ok: z.literal(false), cause: z.string().max(60) }),
]);

/** Lance le conteneur de rendu avec le lanceur Podman (réseau `none`, plus de ressources, GPU en option). */
export class LanceurRenduConteneur implements LanceurRendu {
  readonly #lanceur: LanceurCapture;

  constructor(lanceur: LanceurCapture) {
    this.#lanceur = lanceur;
  }

  async rendre(d: DemandeRendu): Promise<Buffer> {
    const lignes = [
      JSON.stringify({ graphe: d.plan.graphe, ass: d.plan.ass, args: d.plan.args, fichiersVoix: d.plan.fichiersVoix, sansTexte: d.sansTexte }),
      ...lignesFichier('film.webm', d.film),
      ...d.voix.flatMap((v) => lignesFichier(v.nom, v.octets)),
    ];
    const reassembleur = new Reassembleur(RENDU_MAX_OCTETS);
    const demande: DemandeLanceur = {
      nom: d.nom,
      entree: `${lignes.join('\n')}\n`,
      delaiMs: d.delaiMs,
      signal: d.signal,
      surLigne: (ligne) => void reassembleur.ajouter(ligne),
    };
    const sortie = await this.#lanceur.lancer(demande);
    const derniere = sortie.trim().split('\n').filter((l) => !l.startsWith(PREFIXE_FILM)).at(-1) ?? '';
    let brut: unknown;
    try {
      brut = JSON.parse(derniere);
    } catch {
      throw new Error('RESULTAT_ILLISIBLE');
    }
    const lu = resultatConteneur.safeParse(brut);
    if (!lu.success) throw new Error('RESULTAT_ILLISIBLE');
    if (!lu.data.ok) throw new Error(lu.data.cause);
    if (reassembleur.erreur !== undefined) throw new Error(reassembleur.erreur);
    const fichier = reassembleur.fichier;
    if (fichier === undefined || fichier.octets.length !== lu.data.octets) throw new Error('FLUX_INCOMPLET');
    return fichier.octets;
  }
}

const entreeTache = z.strictObject({ renduId: z.uuid() });

export type OptionsExecutantRendu = Readonly<{
  montages: Montages;
  stockage: Stockage;
  lanceur: LanceurRendu;
  encodeur?: 'libx264' | 'h264_vaapi';
  /** Faux quand le filtre `ass` manque (essais locaux). */
  avecTexte?: boolean;
  delaiMs?: number;
}>;

/** Crée la ligne `rendus`, enfile la tâche et la lie. `undefined` si le montage n'existe pas pour cette personne. */
export async function lancerRendu(s: { montages: Montages; file: File }, qui: { marqueId: string; utilisateurId: string }, montageId: string, genre: GenreRendu): Promise<{ rendu: Rendu; tacheId: string } | undefined> {
  const rendu = await s.montages.creerRendu({ ...qui, montageId, genre });
  if (rendu === undefined) return undefined;
  const tache = await s.file.enfiler(qui.marqueId, qui.utilisateurId, 'rendu', { renduId: rendu.id });
  await s.montages.lierTache(qui.marqueId, qui.utilisateurId, rendu.id, tache.id);
  return { rendu: { ...rendu, tacheId: tache.id }, tacheId: tache.id };
}

export function creerExecutantRendu(o: OptionsExecutantRendu): Executant {
  return {
    executer: async (tache, aide) => {
      const entree = entreeTache.safeParse(tache.entree);
      if (!entree.success) throw new ErreurTache('ENTREE_INVALIDE', 'verifier', false);
      const qui = { marqueId: tache.marqueId, utilisateurId: tache.utilisateurId };
      const rendu = await o.montages.lireRendu(qui.marqueId, qui.utilisateurId, entree.data.renduId);
      if (rendu === undefined) throw new ErreurTache('RENDU_INTROUVABLE', 'verifier', false);
      const montage = await o.montages.lire(qui.marqueId, qui.utilisateurId, rendu.montageId);
      if (montage === undefined) throw new ErreurTache('MONTAGE_INTROUVABLE', 'verifier', false);
      const echouer = async (cause: string, action: 'verifier' | 'relancer', reessayable: boolean): Promise<never> => {
        await o.montages.terminerRendu(qui.marqueId, qui.utilisateurId, rendu.id, { etat: 'echec', cause });
        throw new ErreurTache(cause, action, reessayable);
      };

      const filmFichier = await o.montages.lireFichier(qui.marqueId, qui.utilisateurId, montage.filmFichierId);
      const film = filmFichier === undefined || filmFichier.purgeLe !== null ? undefined : await o.stockage.lire(qui.marqueId, filmFichier.id);
      if (film === undefined) return echouer('SEANCE_PURGEE', 'verifier', false);

      await o.montages.demarrerRendu(qui.marqueId, qui.utilisateurId, rendu.id);

      // Les voix déjà synthétisées (histoire 4.7) allongent les scènes trop courtes.
      const fichiersVoix = await o.montages.listerVoix(qui.marqueId, qui.utilisateurId, montage.id);
      const voix: { nom: string; octets: Uint8Array; sceneId: string }[] = [];
      const durees: Record<string, number> = {};
      for (const f of fichiersVoix) {
        if (f.sceneId === null || f.dureeMs === null || f.purgeLe !== null) continue;
        const octets = await o.stockage.lire(qui.marqueId, f.id);
        if (octets === undefined) continue;
        voix.push({ nom: `voix-${f.sceneId}.wav`, octets, sceneId: f.sceneId });
        durees[f.sceneId] = f.dureeMs;
      }
      const timeline = ajusterAuxVoix(montage.timeline, durees);
      const ids = voix.filter((v) => timeline.scenes.some((s) => s.id === v.sceneId)).map((v) => v.sceneId);
      const definition = montage.gabarit.definition;
      const avecTexte = o.avecTexte ?? true;
      const plan = construirePlanRendu(timeline, parametresTexte(definition), { genre: rendu.genre, ...(o.encodeur !== undefined ? { encodeur: o.encodeur } : {}), avecTexte, voix: ids });

      let mp4: Buffer;
      try {
        mp4 = await o.lanceur.rendre({
          nom: `regie-rendu-${tache.id}`,
          plan,
          sansTexte: !avecTexte,
          film,
          voix: voix.filter((v) => plan.fichiersVoix.includes(v.nom)).map(({ nom, octets }) => ({ nom, octets })),
          delaiMs: o.delaiMs ?? DELAI_RENDU_MS,
          signal: aide.signal,
        });
      } catch (erreur) {
        if (aide.signal.aborted) throw erreur;
        return echouer('RENDU_ECHEC', 'relancer', true);
      }
      if (!estMp4(mp4)) return echouer('RENDU_ILLISIBLE', 'relancer', true);

      const fichierId = randomUUID();
      await o.stockage.ecrire(qui.marqueId, fichierId, mp4);
      await o.montages.ajouterFichier(qui.marqueId, qui.utilisateurId, montage.espaceId, {
        id: fichierId,
        genre: rendu.genre === 'allege' ? 'rendu_allege' : 'rendu',
        mime: 'video/mp4',
        octets: mp4.length,
        sha256: createHash('sha256').update(mp4).digest('hex'),
        dureeMs: dureeTotaleMs(timeline),
        montageId: montage.id,
      });
      // Les gardes (contraste, taille du texte, zone sûre) valent pour chaque texte de chaque scène : une violation
      // garde la vidéo visible mais « bloquée » (FR-28).
      const violations = evaluerMontage(timeline, definition);
      await o.montages.terminerRendu(qui.marqueId, qui.utilisateurId, rendu.id, violations.length > 0 ? { etat: 'bloque', fichierId, violations } : { etat: 'pret', fichierId });
      return { renduId: rendu.id, etat: violations.length > 0 ? 'bloque' : 'pret', octets: mp4.length };
    },
  };
}
