// regie — tâche de file « jeu_script » (histoire 4.5, FR-18, AD-10). Elle rejoue un script de démo dans la capture isolée
// (Chromium jetable, proxy de sortie, liste d'hôtes de l'application), la filme en vertical et tient un journal horodaté
// que le cœur pousse en direct au panneau de la page Scripts. Le résultat durable est le `dernier_jeu` du script :
// réussi, échec à l'étape N (avec une capture d'écran) ou hôte refusé. Une navigation hors liste coupe le jeu.
// Le journal ne contient jamais une valeur saisie ni le compte de démonstration ; la cause d'un échec est une phrase
// de regie, jamais un texte de la page filmée.

import { z } from 'zod';
import { EtapesScript, premierHoteRefuse, signerLaissezPasser, type DernierJeu } from '@regie/contrats';
import chaines from '../chaines.json' with { type: 'json' };
import type { Applications } from '../infra/applications.ts';
import { TYPE_SECRET_COMPTE_DEMO, lireCompteSerialise, nomSecretCompteDemo } from '../infra/comptes-demo.ts';
import type { Scripts } from '../infra/scripts.ts';
import { DUREE_LAISSEZ_PASSER_S, VIEWPORT, hoteDeAccueil, type LanceurCapture } from './capture.ts';
import { EntreeJournalJeu, type JournauxJeu } from './journaux-jeu.ts';
import { SecretRefuse, type PasserelleSecrets } from './passerelle-secrets.ts';
import { causeEtape, ETAPES_CONNEXION } from './test-connexion.ts';
import { ErreurTache, type Executant } from './travailleur.ts';

/** Durée maximale d'un jeu, pauses comprises (le délai de garde de la tâche est de 300 s). */
export const DELAI_JEU_MS = 180_000;

const entreeTache = z.strictObject({ scriptId: z.uuid() });
const CAUSES_ECHEC = ['PAGE_INJOIGNABLE', 'ETAPE_ECHEC', 'DELAI_DEPASSE', 'CAPTURE_ECHEC'] as const;
const resultatConteneur = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    dureeMs: z.number().int().min(0).max(3_600_000),
    etapes: z.number().int().min(0).max(100),
    hote: z.string().max(253),
    video: z.strictObject({ octets: z.number().int().min(0) }).optional(),
  }),
  z.strictObject({
    ok: z.literal(false),
    cause: z.enum(['HOTE_REFUSE', 'CONNEXION_ECHEC', ...CAUSES_ECHEC]),
    etape: z.number().int().min(0).max(100),
    hote: z.string().max(253).optional(),
    etapeConnexion: z.enum(ETAPES_CONNEXION).optional(),
    capture: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(270_000).optional(),
  }),
]);

export type ResultatJeuScript = Readonly<{ dureeMs: number; etapes: number; hote: string; video: Readonly<{ octets: number }> | null }>;

export type OptionsExecutantJeuScript = Readonly<{
  applications: Applications;
  scripts: Scripts;
  passerelle: PasserelleSecrets;
  lanceur: LanceurCapture;
  journaux: JournauxJeu;
  cle: Buffer;
  proxy: string;
  maintenant?: () => number;
}>;

const causeEcrite = (cause: (typeof CAUSES_ECHEC)[number] | 'CONNEXION_ECHEC', etapeConnexion?: string): string => {
  const modele = chaines.scripts.causesJeu[cause];
  return modele.replace('{etape}', etapeConnexion === undefined ? '' : ((chaines.scripts.etapesConnexion as Record<string, string>)[etapeConnexion] ?? etapeConnexion));
};

export function creerExecutantJeuScript(o: OptionsExecutantJeuScript): Executant {
  const maintenant = o.maintenant ?? Date.now;
  return {
    executer: async (tache, aide) => {
      const entree = entreeTache.safeParse(tache.entree);
      if (!entree.success) throw new ErreurTache('ENTREE_INVALIDE', 'verifier', false);
      const script = await o.scripts.lire(tache.marqueId, tache.utilisateurId, entree.data.scriptId);
      if (script === undefined) throw new ErreurTache('SCRIPT_INTROUVABLE', 'verifier', false);
      const application = await o.applications.lire(tache.marqueId, tache.utilisateurId, script.applicationId);
      if (application === undefined) throw new ErreurTache('APPLICATION_INTROUVABLE', 'verifier', false);
      const hoteAccueil = hoteDeAccueil(application.accueil);
      if (hoteAccueil === undefined || !application.hotes.includes(hoteAccueil)) throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
      const etapes = EtapesScript.safeParse(script.etapes);
      if (!etapes.success) throw new ErreurTache('SCRIPT_INVALIDE', 'verifier', false);

      const ecrireJeu = async (jeu: DernierJeu): Promise<void> => {
        await o.scripts.enregistrerJeu(tache.marqueId, tache.utilisateurId, script.id, jeu, script.version);
      };
      const jouLe = (): string => new Date(maintenant()).toISOString();

      // Avant de lancer quoi que ce soit : une étape vers un hôte retiré de la liste depuis l'écriture du script.
      const refusee = premierHoteRefuse(etapes.data, application.hotes);
      if (refusee !== undefined) {
        await ecrireJeu({ etat: 'hote_refuse', hote: refusee.hote, etape: refusee.etape, jouLe: jouLe() });
        throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
      }

      let compte: { identifiant: string; motDePasse: string } | undefined;
      if (etapes.data.some((e) => e.verbe === 'connexion')) {
        let clair: string | undefined;
        try {
          clair = await o.passerelle.lire(tache, TYPE_SECRET_COMPTE_DEMO, nomSecretCompteDemo(application.id));
        } catch (erreur) {
          if (erreur instanceof SecretRefuse) throw new ErreurTache('SECRET_REFUSE', 'verifier', false);
          throw erreur;
        }
        const lu = clair === undefined ? undefined : lireCompteSerialise(clair);
        if (lu === undefined) throw new ErreurTache('COMPTE_ABSENT', 'verifier', false);
        compte = { identifiant: lu.identifiant, motDePasse: lu.motDePasse };
      }
      const secret = compte?.motDePasse;

      const laissezPasser = signerLaissezPasser(o.cle, tache.id, application.hotes, DUREE_LAISSEZ_PASSER_S, o.maintenant?.());
      let sortie: string;
      try {
        sortie = await o.lanceur.lancer({
          nom: `regie-jeu-${tache.id}`,
          entree: JSON.stringify({
            mode: 'jeu',
            url: application.accueil,
            hotes: application.hotes,
            proxy: { serveur: `http://${o.proxy}`, laissezPasser },
            viewport: VIEWPORT,
            delaiMs: DELAI_JEU_MS,
            etapes: etapes.data,
            ...(compte !== undefined ? { compte } : {}),
          }),
          delaiMs: DELAI_JEU_MS + 15_000,
          signal: aide.signal,
          surLigne: (ligne) => {
            // Ceinture et bretelles : une ligne qui citerait le mot de passe n'est ni gardée ni diffusée.
            if (secret !== undefined && secret.length >= 4 && ligne.includes(secret)) return;
            let brut: unknown;
            try {
              brut = JSON.parse(ligne);
            } catch {
              return;
            }
            const journal = (brut as { journal?: unknown } | null)?.journal;
            const lue = EntreeJournalJeu.safeParse(journal);
            if (lue.success) o.journaux.publier(tache.marqueId, tache.id, lue.data);
          },
        });
      } catch (erreur) {
        if (aide.signal.aborted) throw erreur;
        throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      }
      if (secret !== undefined && secret.length >= 4 && sortie.includes(secret)) throw new ErreurTache('CAPTURE_ECHEC', 'verifier', false);

      // Le résultat est la dernière ligne qui n'est pas une ligne de journal.
      const derniere = sortie.trim().split('\n').filter((l) => !l.startsWith('{"journal"')).at(-1) ?? '';
      let brut: unknown;
      try {
        brut = JSON.parse(derniere);
      } catch {
        throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      }
      const resultat = resultatConteneur.safeParse(brut);
      if (!resultat.success) throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      const r = resultat.data;

      if (r.ok) {
        if (!application.hotes.includes(r.hote)) {
          await ecrireJeu({ etat: 'hote_refuse', hote: r.hote, jouLe: jouLe() });
          throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
        }
        await ecrireJeu({ etat: 'reussi', jouLe: jouLe() });
        return { dureeMs: r.dureeMs, etapes: r.etapes, hote: r.hote, video: r.video ?? null } satisfies ResultatJeuScript;
      }
      // Les numéros d'étape du jeu vont de 1 (0 : l'ouverture de l'accueil, qui compte pour la première).
      const etape = Math.min(Math.max(1, r.etape), Math.max(1, etapes.data.length));
      if (r.cause === 'HOTE_REFUSE') {
        await ecrireJeu({ etat: 'hote_refuse', hote: r.hote ?? chaines.scripts.hoteInconnu, ...(r.etape >= 1 ? { etape } : {}), jouLe: jouLe() });
        throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
      }
      if (r.cause === 'CONNEXION_ECHEC') {
        await ecrireJeu({ etat: 'echec', etape, cause: causeEcrite('CONNEXION_ECHEC', r.etapeConnexion), jouLe: jouLe() });
        throw new ErreurTache(r.etapeConnexion === undefined ? 'CONNEXION_ECHEC' : causeEtape(r.etapeConnexion), 'verifier', false);
      }
      await ecrireJeu({ etat: 'echec', etape, cause: causeEcrite(r.cause), ...(r.capture !== undefined ? { capture: r.capture } : {}), jouLe: jouLe() });
      throw new ErreurTache(r.cause, r.cause === 'PAGE_INJOIGNABLE' || r.cause === 'CAPTURE_ECHEC' ? 'relancer' : 'verifier', false);
    },
  };
}
