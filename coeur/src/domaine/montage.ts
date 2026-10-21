// regie — du gabarit et de la timeline aux gardes et au rendu (histoires 4.6, 3.10, 2.13). Module pur : il rend les
// paramètres de texte du rendu, le « gabarit figé » joint à chaque montage, et les violations des gardes d'une timeline.
// Les gardes sont celles du gabarit (un seul module, `evaluerGardes`) ; elles s'appliquent à chaque texte de chaque scène.

import { sousTitres, situerScenes, dureeTotaleMs, type ParametresTexte, type Timeline } from '@regie/contrats';
import { z } from 'zod';
import { BORNES, type Bornes } from './bornes.ts';
import { definitionGabarit, roles, STYLES, type DefinitionGabarit } from './gabarit.ts';
import { contraste, evaluerGardes, type Mesures, type Montage as MontageGardes, type Violation } from './gardes.ts';
import { disposer } from './mise-en-page.ts';
import { POLICES } from './polices.ts';

/** Le gabarit tel qu'il était à la création d'un montage : les rendus passés ne changent plus (histoire 2.13). */
export const GabaritFige = z.strictObject({
  id: z.uuid(),
  nom: z.string().max(120),
  version: z.number().int().min(1),
  definition: definitionGabarit,
});
export type GabaritFige = z.infer<typeof GabaritFige>;

export const figerGabarit = (g: { id: string; nom: string; version: number; definition: DefinitionGabarit }): GabaritFige => ({ id: g.id, nom: g.nom, version: g.version, definition: g.definition });

export const TAILLE_TITRE = 80;

export function parametresTexte(d: DefinitionGabarit, bornes: Bornes = BORNES): ParametresTexte {
  const r = roles(d);
  const style = STYLES[d.styleSousTitres];
  return {
    couleurTexte: r.texte,
    couleurFond: r.fond,
    couleurPrincipale: r.principale,
    couleurAccent: r.accent,
    policeTitres: POLICES[d.policeTitres].nom,
    policeSousTitres: POLICES[d.policeSousTitres].nom,
    tailleTitre: TAILLE_TITRE,
    tailleSousTitres: style.taille,
    capitalesSousTitres: style.capitales,
    zone: bornes.zoneSure,
  };
}

/** Les éléments de texte d'une timeline mis en page, au format que lisent les gardes. */
export function montageEtMesuresTimeline(t: Timeline, d: DefinitionGabarit, bornes: Bornes = BORNES): { montage: MontageGardes; mesures: Mesures } {
  const r = roles(d);
  const style = STYLES[d.styleSousTitres];
  const zone = bornes.zoneSure;
  const mesures: Record<string, Mesures[string]> = {};
  const segments: { id: string; debutMs: number; elements: { id: string; genre: 'titre' | 'sous_titre' | 'carte_fin' }[] }[] = [];

  const mesurer = (id: string, texte: string, genre: 'titre' | 'sous_titre' | 'carte_fin', police: keyof typeof POLICES, taille: number, capitales: boolean, ancre: 'haut' | 'centre' | 'bas', fond: string, accent: boolean): void => {
    const disposition = disposer({ texte, police, taille, capitales, ancre, ...(ancre === 'haut' ? { decalage: 24 } : ancre === 'bas' ? { decalage: 24 } : {}) }, zone);
    let c = contraste(r.texte, fond);
    if (accent) c = Math.min(c, contraste(r.accent, fond));
    mesures[id] = { contraste: c, textePx: (disposition.taille * bornes.hauteurReferencePx) / bornes.toile.hauteur, boite: disposition.boite };
  };

  const cues = sousTitres(t);
  for (const { scene, debutMs } of situerScenes(t)) {
    const elements: { id: string; genre: 'titre' | 'sous_titre' | 'carte_fin' }[] = [];
    if (scene.accroche !== '') {
      const id = `${scene.id}-accroche`;
      elements.push({ id, genre: 'titre' });
      mesurer(id, scene.accroche, 'titre', d.policeTitres, TAILLE_TITRE, false, 'haut', r.principale, false);
    }
    if (scene.texteEcran !== '') {
      const id = `${scene.id}-ecran`;
      elements.push({ id, genre: 'titre' });
      mesurer(id, scene.texteEcran, 'titre', d.policeTitres, Math.round(TAILLE_TITRE * 0.8), false, 'centre', r.principale, false);
    }
    cues.filter((c) => c.sceneId === scene.id).forEach((c, k) => {
      const id = `${scene.id}-sous-titre-${k + 1}`;
      elements.push({ id, genre: 'sous_titre' });
      mesurer(id, c.texte, 'sous_titre', d.policeSousTitres, style.taille, style.capitales, 'bas', r.fond, style.accent);
    });
    segments.push({ id: scene.id, debutMs, elements });
  }
  if (t.carteFin !== null) {
    const texte = [t.carteFin.titre, t.carteFin.sousTitre].filter((x) => x !== '').join(' — ');
    const elements: { id: string; genre: 'carte_fin' }[] = [];
    if (texte !== '') {
      elements.push({ id: 'carte-fin', genre: 'carte_fin' });
      mesurer('carte-fin', texte, 'carte_fin', d.policeTitres, Math.round(TAILLE_TITRE * 0.9), false, 'centre', r.principale, false);
    }
    segments.push({ id: 'carte-fin', debutMs: dureeTotaleMs(t) - t.carteFin.dureeMs, elements });
  }
  return { montage: { segments }, mesures };
}

/** Violations des gardes pour une timeline et un gabarit : vide si la vidéo peut passer « prête ». */
export function evaluerMontage(t: Timeline, d: DefinitionGabarit, bornes: Bornes = BORNES): Violation[] {
  const { montage, mesures } = montageEtMesuresTimeline(t, d, bornes);
  return evaluerGardes(montage, mesures, bornes);
}
