// regie — tâche de file « exploration » (histoire 4.8, FR-14, AR-21, AR-25). Pour qu'une demande en une phrase donne un
// script juste, Claude (par le MCP) regarde l'application : les éléments visibles d'une page et une mini capture, dans la
// capture isolée (Chromium jetable, proxy de sortie, liste d'hôtes). Aucun compte n'est donné au conteneur : on explore
// ce qu'un visiteur voit. Tout ce que la page dit est une donnée d'un tiers : forme vérifiée et bornée ici, puis rendue
// dans des champs `non_fiable` par l'action `script.exploration`.

import { z } from 'zod';
import { signerLaissezPasser } from '@regie/contrats';
import type { Applications } from '../infra/applications.ts';
import { DELAI_CAPTURE_MS, DUREE_LAISSEZ_PASSER_S, VIEWPORT, hoteDeAccueil, type LanceurCapture } from './capture.ts';
import { ErreurTache, type Executant } from './travailleur.ts';

export const ELEMENTS_EXPLORATION_MAX = 40;

export const ElementExploreSchema = z.strictObject({
  role: z.enum(['lien', 'bouton', 'champ']),
  texte: z.string().min(1).max(80),
  hote: z.string().regex(/^[a-z0-9.-]{1,253}$/).optional(),
});
export type ElementExplore = z.infer<typeof ElementExploreSchema>;

const entreeTache = z.strictObject({ applicationId: z.uuid(), url: z.string().max(2000) });
const resultatConteneur = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    hote: z.string().max(253),
    titre: z.string().max(200),
    miniature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(300_000),
    elements: z.array(ElementExploreSchema).max(ELEMENTS_EXPLORATION_MAX),
  }),
  z.strictObject({ ok: z.literal(false), cause: z.enum(['HOTE_REFUSE', 'PAGE_INJOIGNABLE', 'CAPTURE_ECHEC']), hote: z.string().max(253).optional() }),
]);

export const ResultatExplorationSchema = z.strictObject({
  hote: z.string().max(253),
  titre: z.string().max(200),
  miniature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(300_000),
  elements: z.array(ElementExploreSchema).max(ELEMENTS_EXPLORATION_MAX),
});

/** Ce que la tâche garde : la page vue, ses éléments et sa vignette. Ces textes viennent de la page : `non_fiable` à la sortie. */
export type ResultatExploration = Readonly<{ hote: string; titre: string; miniature: string; elements: readonly ElementExplore[] }>;

export type OptionsExecutantExploration = Readonly<{
  applications: Applications;
  lanceur: LanceurCapture;
  cle: Buffer;
  proxy: string;
  maintenant?: () => number;
}>;

export function creerExecutantExploration(o: OptionsExecutantExploration): Executant {
  return {
    executer: async (tache, aide) => {
      const entree = entreeTache.safeParse(tache.entree);
      if (!entree.success) throw new ErreurTache('ENTREE_INVALIDE', 'verifier', false);
      const application = await o.applications.lire(tache.marqueId, tache.utilisateurId, entree.data.applicationId);
      if (application === undefined) throw new ErreurTache('APPLICATION_INTROUVABLE', 'verifier', false);
      // Les hôtes ont pu changer depuis la demande : la page visée doit encore être dans la liste.
      const hote = hoteDeAccueil(entree.data.url);
      if (hote === undefined || !application.hotes.includes(hote)) throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
      const laissezPasser = signerLaissezPasser(o.cle, tache.id, application.hotes, DUREE_LAISSEZ_PASSER_S, o.maintenant?.());
      let sortie: string;
      try {
        sortie = await o.lanceur.lancer({
          nom: `regie-exploration-${tache.id}`,
          entree: JSON.stringify({ mode: 'exploration', url: entree.data.url, hotes: application.hotes, proxy: { serveur: `http://${o.proxy}`, laissezPasser }, viewport: VIEWPORT, delaiMs: DELAI_CAPTURE_MS }),
          delaiMs: DELAI_CAPTURE_MS + 15_000,
          signal: aide.signal,
        });
      } catch (erreur) {
        if (aide.signal.aborted) throw erreur;
        throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      }
      let brut: unknown;
      try {
        brut = JSON.parse(sortie.trim().split('\n').at(-1) ?? '');
      } catch {
        throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      }
      const resultat = resultatConteneur.safeParse(brut);
      if (!resultat.success) throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      if (!resultat.data.ok) throw new ErreurTache(resultat.data.cause, resultat.data.cause === 'HOTE_REFUSE' ? 'verifier' : 'relancer', resultat.data.cause !== 'HOTE_REFUSE');
      const { hote: vu, titre, miniature, elements } = resultat.data;
      if (!application.hotes.includes(vu)) throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
      return { hote: vu, titre, miniature, elements } satisfies ResultatExploration;
    },
  };
}
