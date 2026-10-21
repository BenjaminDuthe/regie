// regie — les actions du gabarit (histoires 2.7 et 2.8, FR-55, FR-6). Une seule écriture pour l'interface, l'API
// (`/api/v1/gabarit/<verbe>`) et le MCP (`gabarit_<verbe>`). Les gardes (contraste, taille du texte, zone sûre) sont
// appliquées à chaque enregistrement ; aucune entrée ne permet de les forcer ou de les ignorer (AR-18).

import { z } from 'zod';
import chaines from '../chaines.json' with { type: 'json' };
import { apercuSvg } from '../domaine/apercu.ts';
import { IDS_POLICES } from '../domaine/polices.ts';
import { STYLES_SOUS_TITRES, definitionGabarit, evaluerGabarit, normaliser, type DefinitionGabarit } from '../domaine/gabarit.ts';
import { codeTemporel, type Violation } from '../domaine/gardes.ts';
import type { Gabarit } from '../infra/gabarits.ts';
import { ErreurMetier } from './erreurs.ts';
import { definirAction, type ContexteAction } from './registre.ts';

const identifiant = z.uuid();
const couleurHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'couleur #rrggbb attendue');

const gabaritVisible = (g: Gabarit) => ({ id: g.id, espaceId: g.espaceId, nom: g.nom, parDefaut: g.parDefaut, version: g.version, modifieLe: g.modifieLe.toISOString(), definition: g.definition });

/** Phrase de violation : la scène, le code temporel, l'élément, la mesure et le seuil. */
export function decrireViolation(v: Violation): string {
  const c = chaines.gabarit;
  const unite = c.unites[v.unite];
  const sep = v.unite === 'ratio' ? '' : ' ';
  return `${c.codes[v.code]} — ` + c.violation
    .replace('{segment}', v.segment)
    .replace('{temps}', codeTemporel(v.tempsMs))
    .replace('{element}', v.element)
    .replaceAll('{mesure}', String(v.mesure).replace('.', ','))
    .replaceAll('{seuil}', String(v.seuil).replace('.', ','))
    .replaceAll(' {unite}', `${sep}${unite}`);
}

/** Refuse un gabarit qui enfreint une garde (422 `GARDE_NON_RESPECTEE`), en nommant scène, élément, mesure et seuil. */
export function exigerGardes(d: DefinitionGabarit): void {
  const violations = evaluerGabarit(d);
  if (violations.length > 0) throw new ErreurMetier('GARDE_NON_RESPECTEE', 422, { violations, detail: violations.map(decrireViolation).join(' ; ') });
}

async function gabaritAccessible(ctx: ContexteAction, id: string): Promise<Gabarit> {
  const g = await ctx.services.gabarits.lire(ctx.marqueId, ctx.utilisateurId, id);
  // Un jeton ne voit que les espaces qu'on lui a donnés : pour lui, un autre gabarit n'existe pas.
  if (g === undefined || (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(g.espaceId))) throw new ErreurMetier('GABARIT_INTROUVABLE', 404, { id });
  return g;
}

export const gabaritLister = definirAction({
  domaine: 'gabarit',
  verbe: 'lister',
  description: 'Liste les gabarits de tes espaces (couleurs, polices, style des sous-titres, carte de fin). Un espace neuf reçoit le gabarit de départ.',
  portee: 'lecture',
  entree: z.object({ espaceId: identifiant.optional() }).strict(),
  executer: async (ctx, entree) => {
    if (entree.espaceId !== undefined && ctx.espaceIds !== undefined && !ctx.espaceIds.includes(entree.espaceId)) throw new ErreurMetier('ESPACE_INTROUVABLE', 404, { id: entree.espaceId });
    const tous = await ctx.services.gabarits.lister(ctx.marqueId, ctx.utilisateurId, entree.espaceId);
    return { gabarits: tous.filter((g) => ctx.espaceIds === undefined || ctx.espaceIds.includes(g.espaceId)).map(gabaritVisible) };
  },
  objet: () => 'gabarit',
});

/** Les trois choix de l'histoire 2.7 : couleur principale, police, style des sous-titres. */
export const gabaritPersonnaliser = definirAction({
  domaine: 'gabarit',
  verbe: 'personnaliser',
  description: 'Change en trois choix un de tes gabarits : la couleur principale, la police (titres et sous-titres) et le style des sous-titres. Refusé si le contraste, la taille du texte ou la zone sûre ne sont plus respectés.',
  portee: 'ecriture',
  entree: z.object({ id: identifiant, couleurPrincipale: couleurHex, police: z.enum(IDS_POLICES), styleSousTitres: z.enum(STYLES_SOUS_TITRES) }).strict(),
  executer: async (ctx, entree) => {
    const g = await gabaritAccessible(ctx, entree.id);
    const definition = normaliser({ ...g.definition, couleurs: [entree.couleurPrincipale, ...g.definition.couleurs.slice(1)], policeTitres: entree.police, policeSousTitres: entree.police, styleSousTitres: entree.styleSousTitres });
    exigerGardes(definition);
    const apres = await ctx.services.gabarits.remplacer(ctx.marqueId, ctx.utilisateurId, entree.id, { definition });
    if (apres === undefined) throw new ErreurMetier('GABARIT_INTROUVABLE', 404, { id: entree.id });
    return { gabarit: gabaritVisible(apres) };
  },
  objet: (entree) => `gabarit:${entree.id}`,
});

export const gabaritCreer = definirAction({
  domaine: 'gabarit',
  verbe: 'creer',
  description: 'Crée un gabarit dans un de tes espaces (sans limite de nombre). Refusé si le contraste, la taille du texte ou la zone sûre ne sont pas respectés.',
  portee: 'ecriture',
  entree: z.object({ espaceId: identifiant, nom: z.string().trim().min(1).max(80), definition: definitionGabarit }).strict(),
  executer: async (ctx, entree) => {
    if (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(entree.espaceId)) throw new ErreurMetier('ESPACE_INTROUVABLE', 404, { id: entree.espaceId });
    const definition = normaliser(entree.definition);
    exigerGardes(definition);
    const g = await ctx.services.gabarits.creer({ marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, espaceId: entree.espaceId, nom: entree.nom, definition });
    if (g === undefined) throw new ErreurMetier('ESPACE_INTROUVABLE', 404, { id: entree.espaceId });
    return { gabarit: gabaritVisible(g) };
  },
  objet: (_entree, sortie) => `gabarit:${sortie.gabarit.id}`,
});

export const gabaritDefinir = definirAction({
  domaine: 'gabarit',
  verbe: 'definir',
  description: 'Remplace la définition d’un de tes gabarits (couleurs, polices, style, carte de fin, légende, mots-clics). Refusé si une garde n’est pas respectée.',
  portee: 'ecriture',
  entree: z.object({ id: identifiant, nom: z.string().trim().min(1).max(80).optional(), definition: definitionGabarit }).strict(),
  executer: async (ctx, entree) => {
    await gabaritAccessible(ctx, entree.id);
    const definition = normaliser(entree.definition);
    exigerGardes(definition);
    const apres = await ctx.services.gabarits.remplacer(ctx.marqueId, ctx.utilisateurId, entree.id, entree.nom === undefined ? { definition } : { nom: entree.nom, definition });
    if (apres === undefined) throw new ErreurMetier('GABARIT_INTROUVABLE', 404, { id: entree.id });
    return { gabarit: gabaritVisible(apres) };
  },
  objet: (entree) => `gabarit:${entree.id}`,
});

export const gabaritApercu = definirAction({
  domaine: 'gabarit',
  verbe: 'apercu',
  description: 'Dessine l’aperçu d’une définition de gabarit sur un brouillon d’exemple (image SVG) et liste les gardes qu’elle enfreindrait, sans rien enregistrer.',
  portee: 'lecture',
  entree: z.object({ definition: definitionGabarit }).strict(),
  executer: async (_ctx, entree) => {
    const definition = normaliser(entree.definition);
    const violations = evaluerGabarit(definition);
    return { svg: apercuSvg(definition), violations: violations.map((v) => ({ ...v, phrase: decrireViolation(v) })) };
  },
  objet: () => 'gabarit',
});

export const ACTIONS_GABARIT = [gabaritLister, gabaritPersonnaliser, gabaritCreer, gabaritDefinir, gabaritApercu] as const;
