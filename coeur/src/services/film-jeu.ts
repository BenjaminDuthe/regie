// regie — du film d'un jeu au premier montage et à son rendu allégé (histoire 4.6, FR-26, FR-28). Appelé à la fin d'un jeu
// réussi : le film reçu est contrôlé (format WebM, taille annoncée), rangé dans le stockage, puis la timeline est tirée du
// journal horodaté (module pur `depuisJournal`), jointe au gabarit par défaut de l'espace (figé), et le rendu allégé est
// mis dans la file. Un film absent ou invalide ne fait pas échouer le jeu : il n'y a simplement pas de montage.

import { randomUUID } from 'node:crypto';
import { depuisJournal, type EntreeJournalMontage } from '@regie/contrats';
import { figerGabarit } from '../domaine/montage.ts';
import type { File } from '../infra/file.ts';
import type { Gabarits } from '../infra/gabarits.ts';
import type { Montages } from '../infra/montages.ts';
import type { Stockage } from '../infra/stockage.ts';
import { estWebm, type FichierRecu } from './flux-fichiers.ts';
import { lancerRendu } from './rendu.ts';

export type OptionsMontageJeu = Readonly<{ montages: Montages; stockage: Stockage; gabarits: Gabarits; file: File }>;

export type MontageDuJeu = Readonly<{ montageId: string; tacheRenduId: string }> | Readonly<{ refus: 'FILM_INVALIDE' | 'MONTAGE_ECHEC' }>;

export async function creerMontageDuJeu(
  o: OptionsMontageJeu,
  qui: { marqueId: string; utilisateurId: string },
  script: { id: string; espaceId: string; nom: string },
  film: FichierRecu | undefined,
  annonce: number,
  journal: readonly EntreeJournalMontage[],
  dureeMs: number,
): Promise<MontageDuJeu> {
  if (film === undefined || film.octets.length !== annonce || !estWebm(film.octets)) return { refus: 'FILM_INVALIDE' };
  try {
    const gabarits = await o.gabarits.lister(qui.marqueId, qui.utilisateurId, script.espaceId);
    const gabarit = gabarits.find((g) => g.parDefaut) ?? gabarits[0];
    // Pas de gabarit pour cet espace (il n'existe pas pour cette personne) : pas de montage, jamais un gabarit inventé.
    if (gabarit === undefined) return { refus: 'MONTAGE_ECHEC' };
    const timeline = depuisJournal(journal, { filmDureeMs: Math.max(1, dureeMs), titre: script.nom });
    const montageId = randomUUID();
    const filmId = randomUUID();
    await o.stockage.ecrire(qui.marqueId, filmId, film.octets);
    const montage = await o.montages.creerDepuisFilm({
      ...qui,
      espaceId: script.espaceId,
      scriptId: script.id,
      montageId,
      film: { id: filmId, genre: 'film', mime: 'video/webm', octets: film.octets.length, sha256: film.sha256, dureeMs },
      timeline,
      gabarit: figerGabarit(gabarit),
    });
    if (montage === undefined) {
      await o.stockage.supprimer(qui.marqueId, filmId);
      return { refus: 'MONTAGE_ECHEC' };
    }
    const lance = await lancerRendu(o, qui, montage.id, 'allege');
    if (lance === undefined) return { refus: 'MONTAGE_ECHEC' };
    return { montageId: montage.id, tacheRenduId: lance.tacheId };
  } catch {
    return { refus: 'MONTAGE_ECHEC' };
  }
}
