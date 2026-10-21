// regie — la « timeline » d'un montage (histoire 4.6, FR-26, FR-28) : du JSON pur qui dit, scène par scène, quel
// morceau du film tourné on montre, combien de temps, avec quels textes, quelle voix, quelles animations, et comment le
// cadre suit chaque clic. Module pur, sans FFmpeg ni navigateur ni horloge : le même JSON donne toujours les mêmes
// images clés, les mêmes sous-titres et les mêmes arguments de rendu (`ffmpeg.ts`). Il est partagé par le cœur
// (éditeur, API, MCP, gardes) et par le rendu. Une timeline est immuable : on en enregistre une nouvelle version, on ne
// modifie jamais l'ancienne.

import { z } from 'zod';

/** Format de sortie : vertical 1080 x 1920 à 30 images par seconde. */
export const FORMAT_VIDEO = Object.freeze({ largeur: 1080, hauteur: 1920, fps: 30 });

/** Le catalogue du moteur : rien d'autre ne s'écrit dans une timeline (histoire 3.11). */
export const ANIMATIONS = ['aucune', 'fondu', 'glisse_haut', 'glisse_bas', 'zoom'] as const;
export type Animation = (typeof ANIMATIONS)[number];
export const TRANSITIONS = ['coupe', 'fondu'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const SCENES_MAX = 40;
export const DUREE_SCENE_MIN_MS = 500;
export const DUREE_SCENE_MAX_MS = 120_000;
/** Une scène peut être ralentie jusqu'à la moitié de sa vitesse tournée, accélérée jusqu'à quatre fois. */
export const VITESSE_MIN = 0.25;
export const VITESSE_MAX = 2;
export const POINTS_MAX_PAR_SCENE = 60;

const texte = (max: number) => z.string().trim().max(max);
const animationCatalogue = z.enum(ANIMATIONS);

/** Une sortie ne glisse pas : le moteur de texte (ASS) n'anime pas une position à la sortie. */
export const ANIMATIONS_SORTIE = ['aucune', 'fondu', 'zoom'] as const;

export const ReglageAnimation = z.strictObject({
  entree: animationCatalogue,
  sortie: z.enum(ANIMATIONS_SORTIE),
  dureeMs: z.number().int().min(100).max(2000),
  delaiMs: z.number().int().min(0).max(5000),
});
export type ReglageAnimation = z.infer<typeof ReglageAnimation>;

export const ReglageZoom = z.strictObject({
  actif: z.boolean(),
  /** 1,1 (à peine) à 3 (trois fois). */
  niveau: z.number().min(1.1).max(3),
  /** Décale l'instant du zoom par rapport au clic : négatif = plus tôt. */
  decalageMs: z.number().int().min(-2000).max(2000),
});
export type ReglageZoom = z.infer<typeof ReglageZoom>;

/** Un clic (ou une saisie) du film : instant depuis le début du segment tourné, position en millièmes de la page. */
export const PointClic = z.strictObject({ t: z.number().int().min(0).max(600_000), x: z.number().int().min(0).max(1000), y: z.number().int().min(0).max(1000) });
export type PointClic = z.infer<typeof PointClic>;

export const IdScene = z.string().regex(/^[a-z0-9-]{1,32}$/);

export const SceneMontage = z
  .strictObject({
    id: IdScene,
    /** Le segment du film tourné que la scène montre, en millisecondes depuis le début du film. */
    sourceDebutMs: z.number().int().min(0).max(3_600_000),
    sourceFinMs: z.number().int().min(1).max(3_600_000),
    /** Durée à l'écran : différente de celle du segment, la scène est ralentie ou accélérée. */
    dureeMs: z.number().int().min(DUREE_SCENE_MIN_MS).max(DUREE_SCENE_MAX_MS),
    accroche: texte(80),
    texteEcran: texte(120),
    /** Le texte lu par la voix (histoire 4.7) ; il donne aussi les sous-titres. */
    voix: texte(500),
    animation: ReglageAnimation,
    transition: z.enum(TRANSITIONS),
    zoom: ReglageZoom,
    points: z.array(PointClic).max(POINTS_MAX_PAR_SCENE),
  })
  .superRefine((s, ctx) => {
    if (s.sourceFinMs <= s.sourceDebutMs) ctx.addIssue({ code: 'custom', path: ['sourceFinMs'], message: 'SEGMENT_VIDE' });
    else {
      const vitesse = (s.sourceFinMs - s.sourceDebutMs) / s.dureeMs;
      if (vitesse < VITESSE_MIN || vitesse > VITESSE_MAX) ctx.addIssue({ code: 'custom', path: ['dureeMs'], message: 'VITESSE_HORS_LIMITES' });
    }
  });
export type SceneMontage = z.infer<typeof SceneMontage>;

export const CarteFin = z.strictObject({
  titre: texte(60),
  sousTitre: texte(80),
  dureeMs: z.number().int().min(1000).max(10_000),
  animation: ReglageAnimation,
});
export type CarteFin = z.infer<typeof CarteFin>;

/** Les trois couvertures proposées (histoire 3.5) : toutes au style du gabarit, sans autre image que le texte. */
export const VARIANTES_COUVERTURE = ['titre', 'ecran', 'bandeau'] as const;
export type VarianteCouverture = (typeof VARIANTES_COUVERTURE)[number];
export const VARIANTE_COUVERTURE_PAR_DEFAUT: VarianteCouverture = 'titre';

export const Timeline = z
  .strictObject({
    version: z.literal(1),
    /** La couverture choisie ; absente = la première variante. */
    couverture: z.strictObject({ variante: z.enum(VARIANTES_COUVERTURE) }).optional(),
    /** Durée du film tourné : aucune scène ne montre au-delà. */
    sourceDureeMs: z.number().int().min(1).max(3_600_000),
    scenes: z.array(SceneMontage).min(1).max(SCENES_MAX),
    carteFin: CarteFin.nullable(),
  })
  .superRefine((t, ctx) => {
    const vus = new Set<string>();
    t.scenes.forEach((s, i) => {
      if (vus.has(s.id)) ctx.addIssue({ code: 'custom', path: ['scenes', i, 'id'], message: 'ID_EN_DOUBLE' });
      vus.add(s.id);
      if (s.sourceFinMs > t.sourceDureeMs) ctx.addIssue({ code: 'custom', path: ['scenes', i, 'sourceFinMs'], message: 'APRES_LE_FILM' });
    });
  });
export type Timeline = z.infer<typeof Timeline>;

export const ANIMATION_PAR_DEFAUT: ReglageAnimation = Object.freeze({ entree: 'fondu', sortie: 'aucune', dureeMs: 400, delaiMs: 0 });
export const ZOOM_PAR_DEFAUT: ReglageZoom = Object.freeze({ actif: true, niveau: 1.6, decalageMs: 0 });

// --- Construction d'après le journal horodaté de la capture (histoire 4.5) --------------------------------------------

/** Ce que la timeline lit du journal de jeu : ses entrées de film, de narration, de clic et de saisie. */
export type EntreeJournalMontage = Readonly<{ t: number; genre: string; cible?: string | undefined; x?: number | undefined; y?: number | undefined }>;

export type OptionsConstruction = Readonly<{
  /** Durée du film tourné, en millisecondes. */
  filmDureeMs: number;
  /** Écart entre le début du film et le début du jeu (le film commence à l'ouverture de la page). */
  decalageFilmMs?: number;
  /** Titre de l'accroche de la première scène (le nom du script). */
  titre?: string;
  carteFin?: Readonly<{ titre: string; sousTitre: string }> | null;
}>;

const SEGMENT_MIN_MS = 800;
const FUSION_NARRATION_MS = 120;
const GENRES_POINT = new Set(['clic', 'saisie']);

/**
 * Découpe le film en scènes : on garde les fenêtres entre `film_debut` et `film_fin` (tout le jeu si le script ne
 * filme pas explicitement), et chaque `narration` ouvre une scène dont elle donne le texte de voix. Les clics et les
 * saisies deviennent les points que le cadre suivra. Un segment de moins de 0,8 s est fondu dans le précédent.
 */
export function depuisJournal(journal: readonly EntreeJournalMontage[], o: OptionsConstruction): Timeline {
  const decalage = o.decalageFilmMs ?? 0;
  const film = Math.max(1, Math.round(o.filmDureeMs));
  const enFilm = (t: number): number => Math.min(film, Math.max(0, Math.round(t + decalage)));
  const entrees = [...journal].filter((e) => Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
  const fin = entrees.at(-1)?.t ?? 0;

  // Fenêtres filmées.
  const fenetres: { debut: number; fin: number }[] = [];
  let ouverte: number | undefined;
  for (const e of entrees) {
    if (e.genre === 'film_debut' && ouverte === undefined) ouverte = e.t;
    else if (e.genre === 'film_fin' && ouverte !== undefined) {
      fenetres.push({ debut: ouverte, fin: e.t });
      ouverte = undefined;
    }
  }
  if (ouverte !== undefined) fenetres.push({ debut: ouverte, fin });
  if (fenetres.length === 0) fenetres.push({ debut: 0, fin: Math.max(fin, film - decalage) });

  type Brouillon = { debut: number; fin: number; voix: string; points: { t: number; x: number; y: number }[] };
  const brouillons: Brouillon[] = [];
  for (const f of fenetres) {
    const dedans = entrees.filter((e) => e.t >= f.debut && e.t <= f.fin);
    let courante: Brouillon = { debut: f.debut, fin: f.fin, voix: '', points: [] };
    brouillons.push(courante);
    for (const e of dedans) {
      if (e.genre === 'narration' && typeof e.cible === 'string' && e.cible.trim() !== '') {
        // Une narration posée dès l'ouverture donne son texte à la scène en cours ; sinon elle en ouvre une.
        if (courante.voix === '' && e.t - courante.debut <= FUSION_NARRATION_MS) courante.voix = e.cible.trim();
        else if (courante.voix === '' && courante.points.length === 0 && courante.debut === e.t) courante.voix = e.cible.trim();
        else {
          courante.fin = e.t;
          courante = { debut: e.t, fin: f.fin, voix: e.cible.trim(), points: [] };
          brouillons.push(courante);
        }
      } else if (GENRES_POINT.has(e.genre) && typeof e.x === 'number' && typeof e.y === 'number') {
        courante.points.push({ t: e.t, x: Math.round(e.x), y: Math.round(e.y) });
      }
    }
  }

  // Fusion des segments trop courts avec le précédent (le texte de voix se garde).
  const gardes: Brouillon[] = [];
  for (const b of brouillons) {
    const precedent = gardes.at(-1);
    if (b.fin - b.debut < SEGMENT_MIN_MS && precedent !== undefined && precedent.fin === b.debut) {
      precedent.fin = b.fin;
      precedent.points.push(...b.points);
      if (b.voix !== '') precedent.voix = precedent.voix === '' ? b.voix : `${precedent.voix} ${b.voix}`.slice(0, 500);
    } else gardes.push({ ...b, points: [...b.points] });
  }

  const scenes: SceneMontage[] = [];
  for (const b of gardes) {
    const debut = enFilm(b.debut);
    const finSource = enFilm(b.fin);
    if (finSource - debut < 1 || scenes.length >= SCENES_MAX) continue;
    const dureeMs = Math.min(DUREE_SCENE_MAX_MS, Math.max(DUREE_SCENE_MIN_MS, finSource - debut));
    scenes.push({
      id: `sc-${scenes.length + 1}`,
      sourceDebutMs: debut,
      sourceFinMs: finSource,
      dureeMs,
      accroche: scenes.length === 0 ? (o.titre ?? '').slice(0, 80) : '',
      texteEcran: '',
      voix: b.voix.slice(0, 500),
      animation: { ...ANIMATION_PAR_DEFAUT },
      transition: 'coupe',
      zoom: { ...ZOOM_PAR_DEFAUT },
      points: b.points.slice(0, POINTS_MAX_PAR_SCENE).map((p) => ({ t: Math.max(0, Math.min(finSource - debut, enFilm(p.t) - debut)), x: Math.min(1000, Math.max(0, p.x)), y: Math.min(1000, Math.max(0, p.y)) })),
    });
  }
  // Un film sans rien d'exploitable (journal vide) : une seule scène sur tout le film.
  if (scenes.length === 0) {
    scenes.push({
      id: 'sc-1',
      sourceDebutMs: 0,
      sourceFinMs: film,
      dureeMs: Math.min(DUREE_SCENE_MAX_MS, Math.max(DUREE_SCENE_MIN_MS, film)),
      accroche: (o.titre ?? '').slice(0, 80),
      texteEcran: '',
      voix: '',
      animation: { ...ANIMATION_PAR_DEFAUT },
      transition: 'coupe',
      zoom: { ...ZOOM_PAR_DEFAUT },
      points: [],
    });
  }
  const carte = o.carteFin === undefined || o.carteFin === null ? null : { titre: o.carteFin.titre.slice(0, 60), sousTitre: o.carteFin.sousTitre.slice(0, 80), dureeMs: 3000, animation: { ...ANIMATION_PAR_DEFAUT } };
  return Timeline.parse({ version: 1, sourceDureeMs: film, scenes, carteFin: carte });
}

// --- Lecture de la timeline : durées, vitesse, plan de scène ---------------------------------------------------------

export const vitesseScene = (s: Pick<SceneMontage, 'sourceDebutMs' | 'sourceFinMs' | 'dureeMs'>): number => (s.sourceFinMs - s.sourceDebutMs) / s.dureeMs;

export type SceneSituee = Readonly<{ scene: SceneMontage; indice: number; debutMs: number; finMs: number }>;

/** Où chaque scène tombe dans la vidéo montée : l'une après l'autre, sans recouvrement. */
export function situerScenes(t: Timeline): SceneSituee[] {
  let debut = 0;
  return t.scenes.map((scene, indice) => {
    const situee = { scene, indice, debutMs: debut, finMs: debut + scene.dureeMs };
    debut += scene.dureeMs;
    return situee;
  });
}

export const dureeTotaleMs = (t: Timeline): number => t.scenes.reduce((somme, s) => somme + s.dureeMs, 0) + (t.carteFin?.dureeMs ?? 0);

/**
 * Prolonge les scènes dont la voix dure plus que la scène (la vidéo ralentit, dans les limites de vitesse) : `dureesVoixMs`
 * donne la durée de la voix de chaque scène (par identifiant). Une scène dont la voix ne tient pas même ralentie est rendue
 * telle quelle : la garde `VOIX_TROP_LONGUE` la signale.
 */
export const MARGE_VOIX_MS = 250;
export function ajusterAuxVoix(t: Timeline, dureesVoixMs: Readonly<Record<string, number>>): Timeline {
  return {
    ...t,
    scenes: t.scenes.map((s) => {
      const voix = dureesVoixMs[s.id];
      if (voix === undefined) return s;
      const besoin = Math.ceil(voix + MARGE_VOIX_MS);
      const plafond = Math.min(DUREE_SCENE_MAX_MS, Math.floor((s.sourceFinMs - s.sourceDebutMs) / VITESSE_MIN));
      return besoin > s.dureeMs ? { ...s, dureeMs: Math.min(besoin, plafond) } : s;
    }),
  };
}

// --- Le cadre qui suit chaque clic (FR-26) ---------------------------------------------------------------------------

export type ImageCle = Readonly<{ t: number; z: number; cx: number; cy: number }>;
export type Cadre = Readonly<{ z: number; cx: number; cy: number }>;

const MONTEE_MS = 500;
const TENUE_MS = 1200;
const DESCENTE_MS = 600;

const borner = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Images clés du cadre d'une scène, en millisecondes de la vidéo montée depuis le début de la scène. Le cadre part du
 * plan large, monte sur le clic (0,5 s avant), tient 1,2 s, redescend en 0,6 s ; deux clics proches restent zoomés et
 * glissent de l'un à l'autre. Sans zoom actif ou sans clic : un seul plan large.
 */
export function imagesCle(s: SceneMontage): ImageCle[] {
  const large: ImageCle = { t: 0, z: 1, cx: 0.5, cy: 0.5 };
  const fin = s.dureeMs;
  if (!s.zoom.actif || s.points.length === 0) return [large, { ...large, t: fin }];
  const vitesse = vitesseScene(s);
  const clics = [...s.points]
    .map((p) => ({ t: Math.round(p.t / vitesse) + s.zoom.decalageMs, cx: p.x / 1000, cy: p.y / 1000 }))
    .filter((p) => p.t >= -MONTEE_MS && p.t <= fin)
    .sort((a, b) => a.t - b.t);
  if (clics.length === 0) return [large, { ...large, t: fin }];
  const brutes: ImageCle[] = [large];
  const N = s.zoom.niveau;
  clics.forEach((c, i) => {
    const t = borner(c.t, 0, fin);
    const precedent = clics[i - 1];
    const resteZoome = precedent !== undefined && c.t - (precedent.t + TENUE_MS) < MONTEE_MS + DESCENTE_MS;
    if (resteZoome) {
      brutes.push({ t, z: N, cx: c.cx, cy: c.cy });
    } else {
      // Du plan large (au centre de ce clic, pour que le glissement parte de lui) vers le zoom.
      brutes.push({ t: borner(c.t - MONTEE_MS, 0, fin), z: 1, cx: c.cx, cy: c.cy });
      brutes.push({ t, z: N, cx: c.cx, cy: c.cy });
    }
    const suivant = clics[i + 1];
    const reste = suivant !== undefined && suivant.t - (c.t + TENUE_MS) < MONTEE_MS + DESCENTE_MS;
    brutes.push({ t: borner(c.t + TENUE_MS, 0, fin), z: N, cx: c.cx, cy: c.cy });
    if (!reste) brutes.push({ t: borner(c.t + TENUE_MS + DESCENTE_MS, 0, fin), z: 1, cx: c.cx, cy: c.cy });
  });
  brutes.push({ t: fin, z: brutes.at(-1)!.z, cx: brutes.at(-1)!.cx, cy: brutes.at(-1)!.cy });
  // Temps strictement croissants : à égalité, la dernière image clé l'emporte, décalée d'une milliseconde.
  const sortie: ImageCle[] = [];
  for (const k of brutes.sort((a, b) => a.t - b.t)) {
    const dernier = sortie.at(-1);
    if (dernier !== undefined && k.t <= dernier.t) {
      if (k.t === dernier.t && dernier.t >= fin) {
        sortie[sortie.length - 1] = k;
        continue;
      }
      sortie.push({ ...k, t: dernier.t + 1 });
    } else sortie.push(k);
  }
  return sortie.filter((k, i, tous) => i === 0 || k.t > tous[i - 1]!.t);
}

export const adoucir = (u: number): number => u * u * (3 - 2 * u);

/** Centre le plus proche permis pour que la fenêtre de zoom `z` reste dans l'image. */
export const centreBorne = (c: number, z: number): number => borner(c, 0.5 / z, 1 - 0.5 / z);

/** Le cadre à l'instant `tMs` de la scène (vidéo montée) : interpolation lissée entre deux images clés. */
export function cadreA(s: SceneMontage, tMs: number): Cadre {
  const cles = imagesCle(s);
  const t = borner(tMs, 0, cles.at(-1)!.t);
  let k0 = cles[0]!;
  let k1 = cles[0]!;
  for (let i = 0; i < cles.length - 1; i++) {
    if (t >= cles[i]!.t && t < cles[i + 1]!.t) {
      k0 = cles[i]!;
      k1 = cles[i + 1]!;
      break;
    }
    k0 = k1 = cles[i + 1]!;
  }
  const u = k1.t === k0.t ? 1 : adoucir((t - k0.t) / (k1.t - k0.t));
  const z = k0.z + (k1.z - k0.z) * u;
  const cx = k0.cx + (k1.cx - k0.cx) * u;
  const cy = k0.cy + (k1.cy - k0.cy) * u;
  return { z, cx: centreBorne(cx, z), cy: centreBorne(cy, z) };
}

// --- Édition : opérations pures sur la liste de scènes (histoires 3.10 et 3.11) --------------------------------------

export function nouvelIdScene(scenes: readonly Pick<SceneMontage, 'id'>[]): string {
  const pris = new Set(scenes.map((s) => s.id));
  for (let n = scenes.length + 1; ; n++) {
    const id = `sc-${n}`;
    if (!pris.has(id)) return id;
  }
}

export function dupliquerScene(t: Timeline, id: string): Timeline | undefined {
  const i = t.scenes.findIndex((s) => s.id === id);
  if (i < 0 || t.scenes.length >= SCENES_MAX) return undefined;
  const copie: SceneMontage = { ...t.scenes[i]!, id: nouvelIdScene(t.scenes), points: t.scenes[i]!.points.map((p) => ({ ...p })) };
  return { ...t, scenes: [...t.scenes.slice(0, i + 1), copie, ...t.scenes.slice(i + 1)] };
}

export function retirerScene(t: Timeline, id: string): Timeline | undefined {
  if (!t.scenes.some((s) => s.id === id) || t.scenes.length <= 1) return undefined;
  return { ...t, scenes: t.scenes.filter((s) => s.id !== id) };
}

export function deplacerScene(t: Timeline, id: string, sens: 'monter' | 'descendre'): Timeline | undefined {
  const i = t.scenes.findIndex((s) => s.id === id);
  if (i < 0) return undefined;
  const j = sens === 'monter' ? i - 1 : i + 1;
  if (j < 0 || j >= t.scenes.length) return t;
  const scenes = [...t.scenes];
  [scenes[i], scenes[j]] = [scenes[j]!, scenes[i]!];
  return { ...t, scenes };
}
