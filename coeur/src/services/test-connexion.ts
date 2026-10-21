// regie — tâche de file « test_connexion » (histoire 4.3, FR-14, AD-9, AD-10). Elle ouvre l'application dans la capture
// isolée de l'histoire 4.2, s'y connecte avec le compte de démonstration et rend soit une mini capture de l'accueil
// connecté, soit L'ÉTAPE FAUTIVE (ouvrir, trouver le formulaire, saisir, valider) — jamais une valeur du compte.
// Le compte est lu au coffre par la passerelle de secrets (matrice + bail) et part au conteneur par l'entrée standard.

import { z } from 'zod';
import { signerLaissezPasser } from '@regie/contrats';
import type { Applications } from '../infra/applications.ts';
import { TYPE_SECRET_COMPTE_DEMO, lireCompteSerialise, nomSecretCompteDemo } from '../infra/comptes-demo.ts';
import { DELAI_CAPTURE_MS, DUREE_LAISSEZ_PASSER_S, VIEWPORT, hoteDeAccueil, type LanceurCapture, type ResultatMiniCapture } from './capture.ts';
import { SecretRefuse, type PasserelleSecrets } from './passerelle-secrets.ts';
import { ErreurTache, type Executant } from './travailleur.ts';

export const ETAPES_CONNEXION = ['ouvrir', 'trouver', 'saisir', 'valider'] as const;
export type EtapeConnexion = (typeof ETAPES_CONNEXION)[number];

/** Cause de tâche pour une étape de connexion qui échoue : `CONNEXION_ETAPE_OUVRIR`, etc. */
export const causeEtape = (etape: EtapeConnexion): string => `CONNEXION_ETAPE_${etape.toUpperCase()}`;

const entreeTache = z.strictObject({ applicationId: z.uuid() });
const resultatConteneur = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), hote: z.string().max(253), titre: z.string().max(200), miniature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(300_000) }),
  z.strictObject({ ok: z.literal(false), cause: z.enum(['HOTE_REFUSE', 'PAGE_INJOIGNABLE', 'CAPTURE_ECHEC', 'CONNEXION_ECHEC']), hote: z.string().max(253).optional(), etape: z.enum(ETAPES_CONNEXION).optional() }),
]);

export type OptionsExecutantTestConnexion = Readonly<{
  applications: Applications;
  passerelle: PasserelleSecrets;
  lanceur: LanceurCapture;
  cle: Buffer;
  proxy: string;
  maintenant?: () => number;
}>;

export function creerExecutantTestConnexion(o: OptionsExecutantTestConnexion): Executant {
  return {
    executer: async (tache, aide) => {
      const entree = entreeTache.safeParse(tache.entree);
      if (!entree.success) throw new ErreurTache('ENTREE_INVALIDE', 'verifier', false);
      const application = await o.applications.lire(tache.marqueId, tache.utilisateurId, entree.data.applicationId);
      if (application === undefined) throw new ErreurTache('APPLICATION_INTROUVABLE', 'verifier', false);
      const hote = hoteDeAccueil(application.accueil);
      if (hote === undefined || !application.hotes.includes(hote)) throw new ErreurTache('HOTE_REFUSE', 'verifier', false);

      let clair: string | undefined;
      try {
        clair = await o.passerelle.lire(tache, TYPE_SECRET_COMPTE_DEMO, nomSecretCompteDemo(application.id));
      } catch (erreur) {
        if (erreur instanceof SecretRefuse) throw new ErreurTache('SECRET_REFUSE', 'verifier', false);
        throw erreur;
      }
      const compte = clair === undefined ? undefined : lireCompteSerialise(clair);
      if (compte === undefined) throw new ErreurTache('COMPTE_ABSENT', 'verifier', false);

      const laissezPasser = signerLaissezPasser(o.cle, tache.id, application.hotes, DUREE_LAISSEZ_PASSER_S, o.maintenant?.());
      let sortie: string;
      try {
        sortie = await o.lanceur.lancer({
          nom: `regie-connexion-${tache.id}`,
          entree: JSON.stringify({
            mode: 'connexion',
            url: application.accueil,
            hotes: application.hotes,
            proxy: { serveur: `http://${o.proxy}`, laissezPasser },
            viewport: VIEWPORT,
            delaiMs: DELAI_CAPTURE_MS,
            compte: { identifiant: compte.identifiant, motDePasse: compte.motDePasse },
          }),
          delaiMs: DELAI_CAPTURE_MS + 15_000,
          signal: aide.signal,
        });
      } catch (erreur) {
        if (aide.signal.aborted) throw erreur;
        throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      }
      // Ceinture et bretelles : si la sortie du conteneur citait le mot de passe, on ne la garde ni ne la rend.
      if (sortie.includes(compte.motDePasse) && compte.motDePasse.length >= 4) throw new ErreurTache('CAPTURE_ECHEC', 'verifier', false);
      let brut: unknown;
      try {
        brut = JSON.parse(sortie.trim().split('\n').at(-1) ?? '');
      } catch {
        throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      }
      const resultat = resultatConteneur.safeParse(brut);
      if (!resultat.success) throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      if (!resultat.data.ok) {
        const { cause, etape } = resultat.data;
        if (cause === 'CONNEXION_ECHEC') throw new ErreurTache(etape === undefined ? 'CONNEXION_ECHEC' : causeEtape(etape), 'verifier', false);
        throw new ErreurTache(cause, cause === 'CAPTURE_ECHEC' || cause === 'PAGE_INJOIGNABLE' ? 'relancer' : 'verifier', false);
      }
      const { hote: vu, titre, miniature } = resultat.data;
      if (!application.hotes.includes(vu)) throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
      return { hote: vu, titre, miniature } satisfies ResultatMiniCapture;
    },
  };
}
