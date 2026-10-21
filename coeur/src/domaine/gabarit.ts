// regie — le gabarit d'une marque ou d'un espace (histoires 2.7 et 2.8, FR-55, FR-6) : couleurs, polices, style des
// sous-titres, carte de fin, légende et mots-clics par défaut. Module pur. Le gabarit de départ est neutre : les
// couleurs, polices et logo réels d'Établia ne sont pas dans le dépôt (voir ARBITRAGES.md, histoire 2.7).

import { z } from 'zod';
import { BORNES, type Bornes } from './bornes.ts';
import { contraste, evaluerGardes, type Montage, type Mesures, type Violation } from './gardes.ts';
import { disposer } from './mise-en-page.ts';
import { IDS_POLICES, type IdPolice } from './polices.ts';

export const STYLES_SOUS_TITRES = ['classique', 'impact', 'karaoke'] as const;
export type StyleSousTitres = (typeof STYLES_SOUS_TITRES)[number];

/** Taille (px sur la toile 1080×1920), casse et mot mis en avant de chaque style. */
export const STYLES = Object.freeze({
  classique: { taille: 60, capitales: false, accent: false },
  impact: { taille: 72, capitales: true, accent: false },
  karaoke: { taille: 64, capitales: true, accent: true },
} as const);

const couleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'couleur #rrggbb attendue');

export const definitionGabarit = z
  .object({
    /** 2 à 4 couleurs, par rôle et dans cet ordre : principale, texte, fond, accent. Fond (noir) et accent (= principale) ont un défaut. */
    couleurs: z.array(couleur).min(2).max(4),
    policeTitres: z.enum(IDS_POLICES),
    policeSousTitres: z.enum(IDS_POLICES),
    styleSousTitres: z.enum(STYLES_SOUS_TITRES),
    carteFin: z.object({ titre: z.string().trim().max(60), sousTitre: z.string().trim().max(80) }).strict(),
    legende: z.string().trim().max(BORNES.defauts.legendeMaxCaracteres),
    hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]{1,60}$/u, 'mot-clic #exemple attendu')).max(BORNES.defauts.hashtagsMax),
  })
  .strict();

export type DefinitionGabarit = z.infer<typeof definitionGabarit>;

/** Forme enregistrée : couleurs en majuscules, mots-clics sans doublon. */
export const normaliser = (d: DefinitionGabarit): DefinitionGabarit => ({ ...d, couleurs: d.couleurs.map((c) => c.toUpperCase()), hashtags: [...new Set(d.hashtags)] });
/** Gabarit sous la forme que l'on peut changer à la main : le contenu des trois choix de l'histoire 2.7. */
export type Roles = Readonly<{ principale: string; texte: string; fond: string; accent: string }>;

export function roles(d: Pick<DefinitionGabarit, 'couleurs'>): Roles {
  const [principale, texte, fond, accent] = d.couleurs as [string, string, string?, string?];
  return { principale, texte, fond: fond ?? '#000000', accent: accent ?? principale };
}

/**
 * Gabarit de départ, neutre : vert profond, texte blanc (6,4:1), fond sombre, accent doré ; polices libres.
 * Les couleurs de la marque Établia le remplacent dès qu'elles sont connues (ARBITRAGES.md, histoire 2.7).
 */
export const GABARIT_DE_DEPART: DefinitionGabarit = Object.freeze({
  couleurs: ['#1B6B5A', '#FFFFFF', '#101820', '#F2B705'],
  policeTitres: 'inter' as IdPolice,
  policeSousTitres: 'inter' as IdPolice,
  styleSousTitres: 'classique' as StyleSousTitres,
  carteFin: { titre: 'À bientôt', sousTitre: 'Abonne-toi pour la suite' },
  legende: '',
  hashtags: [],
}) as DefinitionGabarit;

export const NOM_GABARIT_DE_DEPART = 'Gabarit de départ';

// --- Montage d'exemple : trois scènes d'un brouillon type, mises en page puis gardées -----------------------------

export type ScenePreparee = Readonly<{ id: string; debutMs: number; elements: readonly ElementPrepare[] }>;
export type ElementPrepare = Readonly<{
  id: string;
  genre: 'logo' | 'titre' | 'sous_titre' | 'carte_fin';
  texte: string | null;
  disposition: ReturnType<typeof disposer>;
  /** Couleur du texte et du fond de la boîte ; couleur d'accent du mot mis en avant (karaoké). */
  texteCouleur: string | null;
  fondCouleur: string;
  accentCouleur: string | null;
}>;

export const TEXTES_EXEMPLE = Object.freeze({ titre: 'Ma série de la semaine', sousTitres: ['Aujourd’hui, on prépare', 'un déjeuner pour toute la semaine'] as const });

export function preparerExemple(d: DefinitionGabarit, bornes: Bornes = BORNES): ScenePreparee[] {
  const r = roles(d);
  const zone = bornes.zoneSure;
  const style = STYLES[d.styleSousTitres];
  const logo = { x: zone.x + 40, y: zone.y + 40, largeur: 160, hauteur: 160 };
  const titre = (id: string, texte: string): ElementPrepare => ({
    id, genre: 'titre', texte, texteCouleur: r.texte, fondCouleur: r.principale, accentCouleur: null,
    disposition: disposer({ texte, police: d.policeTitres, taille: 80, capitales: false, ancre: 'haut', decalage: 240 }, zone),
  });
  const sousTitre = (id: string, texte: string): ElementPrepare => ({
    id, genre: 'sous_titre', texte, texteCouleur: r.texte, fondCouleur: r.fond, accentCouleur: style.accent ? r.accent : null,
    disposition: disposer({ texte, police: d.policeSousTitres, taille: style.taille, capitales: style.capitales, ancre: 'bas', decalage: 40 }, zone),
  });
  const texteFin = [d.carteFin.titre, d.carteFin.sousTitre].filter((t) => t !== '').join(' — ');
  return [
    {
      id: 'scene-1', debutMs: 0,
      elements: [
        { id: 'scene-1-logo', genre: 'logo', texte: null, texteCouleur: null, fondCouleur: r.principale, accentCouleur: null, disposition: { lignes: [], taille: 0, interligne: 0, marge: 0, boite: logo } },
        titre('scene-1-titre', TEXTES_EXEMPLE.titre),
        sousTitre('scene-1-sous-titre', TEXTES_EXEMPLE.sousTitres[0]),
      ],
    },
    { id: 'scene-2', debutMs: 4000, elements: [sousTitre('scene-2-sous-titre', TEXTES_EXEMPLE.sousTitres[1])] },
    {
      id: 'scene-3', debutMs: 8000,
      elements: [
        {
          id: 'scene-3-carte-fin', genre: 'carte_fin', texte: texteFin, texteCouleur: r.texte, fondCouleur: r.principale, accentCouleur: null,
          disposition: disposer({ texte: texteFin, police: d.policeTitres, taille: 72, capitales: false, ancre: 'centre' }, zone),
        },
      ],
    },
  ];
}

export function montageEtMesures(scenes: readonly ScenePreparee[], bornes: Bornes = BORNES): { montage: Montage; mesures: Mesures } {
  const mesures: Record<string, Mesures[string]> = {};
  for (const s of scenes) {
    for (const e of s.elements) {
      let c: number | null = null;
      if (e.texteCouleur !== null) {
        c = contraste(e.texteCouleur, e.fondCouleur);
        if (e.accentCouleur !== null) c = Math.min(c, contraste(e.accentCouleur, e.fondCouleur));
      }
      mesures[e.id] = { contraste: c, textePx: e.texte === null ? null : (e.disposition.taille * bornes.hauteurReferencePx) / bornes.toile.hauteur, boite: e.disposition.boite };
    }
  }
  return { montage: { segments: scenes.map((s) => ({ id: s.id, debutMs: s.debutMs, elements: s.elements.map((e) => ({ id: e.id, genre: e.genre })) })) }, mesures };
}

/** Gardes appliquées à un gabarit, sur le brouillon d'exemple. Les mêmes que celles d'un vrai montage (un seul module). */
export function evaluerGabarit(d: DefinitionGabarit, bornes: Bornes = BORNES): Violation[] {
  const { montage, mesures } = montageEtMesures(preparerExemple(d, bornes), bornes);
  return evaluerGardes(montage, mesures, bornes);
}
