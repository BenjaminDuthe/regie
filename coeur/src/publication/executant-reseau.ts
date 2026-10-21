// regie — l'exécutant de la tâche `reseau` : l'envoi d'une publication (histoire 7.3, FR-42, AR-9). C'est le seul endroit
// qui appelle un réseau pour publier, et il ne le fait JAMAIS deux fois pour la même publication :
//   1. la tâche `reseau` n'a pas de reprise (file.ts : reprise interdite, une tentative) ;
//   2. le passage `en_file -> envoi_en_cours` est un compare-and-set lié à CETTE tâche : une exécution rejouée, une
//      seconde tâche ou une publication annulée entre-temps ne le franchit pas, et rien n'est envoyé ;
//   3. après le point de non-retour, toute coupure donne `incertaine` (jamais un nouvel envoi) ;
//   4. le réseau reçoit la même clé d'idempotence à chaque tentative de cette publication.
// Un échec N'EST PAS une erreur de tâche : la tâche se termine, la publication porte l'issue, et une seule notification
// (publication_echec / publication_incertaine / publication_publiee) prévient la personne. Aucun jeton n'est journalisé.

import { z } from 'zod';
import { signerAdresse } from '../auth/adresses-signees.ts';
import type { Services } from '../auth/services.ts';
import { echecSur } from '../domaine/publication.ts';
import { RESEAUX_DECLARES } from '../domaine/reseaux.ts';
import type { Publication, QuiTente } from '../infra/publications.ts';
import type { Executant } from '../services/travailleur.ts';
import { controlerAvantEnvoi } from './controles.ts';
import { estErreurReseau } from './connecteur.ts';

/** Durée de l'adresse remise au réseau : assez pour qu'il récupère la vidéo, bien moins d'une heure. */
export const DUREE_ADRESSE_PUBLICATION_S = 1800;

const entreeTache = z.strictObject({ publicationId: z.uuid(), origine: z.enum(['interface', 'api', 'mcp', 'echeance']), pat: z.string().max(200).nullable(), sub: z.string().min(1).max(200) });

/** Ce que la tâche rend : l'issue constatée, jamais de jeton. */
export type ResultatReseau =
  | Readonly<{ etat: 'publiee'; idExterne: string; lien: string }>
  | Readonly<{ etat: 'en_echec' | 'incertaine'; cause: string }>
  | Readonly<{ etat: 'ignoree'; cause: string }>;

export const legendeComplete = (p: Pick<Publication, 'legende' | 'hashtags'>): string =>
  p.hashtags.length === 0 ? p.legende : `${p.legende}${p.legende === '' ? '' : '\n\n'}${p.hashtags.map((h) => `#${h}`).join(' ')}`;

/** Notifie la personne de l'issue ; la clé (publication + tentative) évite tout doublon, même si l'on repasse. */
export async function notifierIssue(services: Services, marqueId: string, p: Publication): Promise<void> {
  if (p.etat !== 'publiee' && p.etat !== 'en_echec' && p.etat !== 'incertaine') return;
  const genre = p.etat === 'publiee' ? 'publication_publiee' : p.etat === 'en_echec' ? 'publication_echec' : 'publication_incertaine';
  await services.notifications.creer(marqueId, {
    utilisateurId: p.utilisateurId,
    genre,
    etape: p.reseau,
    ...(p.cause === null ? {} : { cause: p.cause }),
    ...(p.action === null ? {} : { action: p.action }),
    ...(p.tacheId === null ? {} : { tacheId: p.tacheId }),
    cle: `${genre}:${p.id}:${p.tentatives}`,
  });
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function executantReseau(services: Services, options: Readonly<{ attenteLiaisonMs?: number }> = {}): Executant {
  return {
    executer: async (tache, aide): Promise<ResultatReseau> => {
      const entree = entreeTache.parse(tache.entree);
      const marque = tache.marqueId;
      const utilisateur = tache.utilisateurId;
      const qui: QuiTente = { origine: entree.origine, pat: entree.pat };

      // La tâche peut être prise avant que `lierTache` ait écrit son identifiant : on attend un court instant.
      let p = await services.publications.lire(marque, utilisateur, entree.publicationId);
      for (let i = 0; p !== undefined && p.tacheId === null && i < 20; i += 1) {
        await attendre(options.attenteLiaisonMs ?? 100);
        p = await services.publications.lire(marque, utilisateur, entree.publicationId);
      }
      if (p === undefined) return { etat: 'ignoree', cause: 'PUBLICATION_INTROUVABLE' };
      if (p.tacheId !== tache.id) return { etat: 'ignoree', cause: 'PUBLICATION_ETAT_INCOMPATIBLE' };
      if (p.etat === 'publiee' && p.idExterne !== null && p.lien !== null) return { etat: 'publiee', idExterne: p.idExterne, lien: p.lien };
      if (p.etat === 'envoi_en_cours' || p.etat === 'incertaine') return { etat: 'ignoree', cause: 'PUBLICATION_ETAT_INCERTAIN' };
      if (p.etat !== 'en_file') return { etat: 'ignoree', cause: 'PUBLICATION_ETAT_INCOMPATIBLE' };

      const refuser = async (cause: string): Promise<ResultatReseau> => {
        const echec = await services.publications.echouerAvantEnvoi(marque, utilisateur, p!.id, tache.id, qui, cause, 'rejouer');
        if (echec !== undefined) await notifierIssue(services, marque, echec);
        return { etat: 'en_echec', cause };
      };

      const controle = await controlerAvantEnvoi(services, marque, utilisateur, p);
      if (!controle.ok) return refuser(controle.code);
      if (services.urlPublique === undefined) return refuser('PUBLICATION_ADRESSE_ABSENTE');
      const chemin = `/v/publication/${marque}/${utilisateur}/${controle.fichier.id}`;
      const urlVideo = new URL(signerAdresse(services.cleAdresses, chemin, { maintenant: services.maintenant(), dureeS: DUREE_ADRESSE_PUBLICATION_S }), services.urlPublique).toString();

      await aide.pointDeNonRetour();
      // Chaque tentative est au journal d'audit AVANT l'envoi : jamais d'envoi sans trace. Ni jeton Meta ni valeur de PAT.
      await services.audit.ajouter(marque, {
        acteur: entree.sub,
        action: 'publication_tentative',
        objet: `publication:${p.id}`,
        details: { origine: entree.origine, ...(entree.pat === null ? {} : { pat: entree.pat }) },
      });
      const numero = await services.publications.demarrerEnvoi(marque, utilisateur, p.id, tache.id, qui);
      if (numero === undefined) return { etat: 'ignoree', cause: 'PUBLICATION_ETAT_INCOMPATIBLE' };

      let resultat: ResultatReseau;
      try {
        const r = await controle.connecteur.publier({
          jeton: controle.jeton,
          compteExterne: controle.compte.compteExterne,
          urlVideo,
          legende: legendeComplete(p),
          cleIdempotence: p.cleIdempotence,
          signal: aide.signal,
        });
        resultat = { etat: 'publiee', idExterne: r.idExterne, lien: r.lien };
      } catch (e) {
        // Une erreur inconnue vaut une coupure : on ne sait pas ce que le réseau a fait, donc `incertaine`.
        const code = estErreurReseau(e) ? e.code : 'RESEAU_INJOIGNABLE';
        const sure = estErreurReseau(e) && echecSur(e.code, e.definitive);
        resultat = sure ? { etat: 'en_echec', cause: code } : { etat: 'incertaine', cause: code };
      }

      // Écrire l'issue : trois essais ; si la base résiste, la tâche rend quand même l'issue et le réconciliateur finit le travail.
      for (let essai = 0; essai < 3; essai += 1) {
        try {
          const fin =
            resultat.etat === 'publiee'
              ? ({ etat: 'publiee', idExterne: resultat.idExterne, lien: resultat.lien } as const)
              : ({ etat: resultat.etat === 'en_echec' ? 'en_echec' : 'incertaine', cause: resultat.cause, action: resultat.etat === 'en_echec' ? 'rejouer' : 'verifier' } as const);
          const conclue = await services.publications.conclure(marque, utilisateur, p.id, fin);
          if (conclue !== undefined) await notifierIssue(services, marque, conclue);
          break;
        } catch {
          await attendre(options.attenteLiaisonMs ?? 100);
        }
      }
      return resultat;
    },
  };
}

/** Nom du réseau pour les textes : jamais l'identifiant technique brut. */
export const nomReseau = (reseau: Publication['reseau']): string => RESEAUX_DECLARES[reseau]?.nom ?? reseau;
