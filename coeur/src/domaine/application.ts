// regie — validation de la déclaration d'une application (histoire 4.1, FR-13, FR-17). Pur : aucun accès réseau ni base.
// La liste d'hôtes est STRICTE : chaque entrée est un nom de domaine complet, normalisé ; l'hôte de l'adresse d'accueil
// y figure toujours. Une entrée refusée est nommée avec sa cause (message dans chaines.json).

import { HOTES_MAX_PAR_APPLICATION, hoteDeUrl, normaliserHote } from '@regie/contrats';
import chaines from '../chaines.json' with { type: 'json' };
import { ErreurMetier } from '../services/erreurs.ts';

export type DeclarationValide = Readonly<{ accueil: string; hotes: readonly string[] }>;

/** Valide l'adresse d'accueil et la liste d'hôtes saisies ; lève une ErreurMetier qui nomme l'hôte fautif. */
export function validerDeclaration(accueilBrut: string, hotesBruts: readonly string[]): DeclarationValide {
  let accueil: string;
  try {
    accueil = new URL(accueilBrut.trim()).toString();
  } catch {
    throw new ErreurMetier('ACCUEIL_REFUSE', 422, { accueil: accueilBrut });
  }
  const hoteAccueil = hoteDeUrl(accueil);
  if (hoteAccueil === undefined) throw new ErreurMetier('ACCUEIL_REFUSE', 422, { accueil: accueilBrut });

  const hotes = new Set<string>();
  for (const brut of hotesBruts) {
    if (brut.trim() === '') continue;
    const r = normaliserHote(brut);
    if (!r.ok) throw new ErreurMetier('HOTE_REFUSE', 422, { hote: brut.trim(), cause: chaines.demos.causes[r.cause] });
    hotes.add(r.hote);
  }
  hotes.add(hoteAccueil);
  if (hotes.size > HOTES_MAX_PAR_APPLICATION) throw new ErreurMetier('HOTES_TROP_NOMBREUX', 422, { max: HOTES_MAX_PAR_APPLICATION });
  return { accueil, hotes: [...hotes].sort() };
}
