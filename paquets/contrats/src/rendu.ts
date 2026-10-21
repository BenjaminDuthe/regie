// regie — plan de rendu d'une timeline (histoires 4.6, 4.7, 3.11) : de la timeline JSON pure, on tire un graphe de filtres
// FFmpeg, un fichier de sous-titres ASS et la liste des arguments. Module pur et déterministe : mêmes entrées, mêmes
// octets. Le rendu lui-même (FFmpeg) tourne dans une image à part ; ce module n'exécute rien.
//
// Sécurité : les arguments ne contiennent que des nombres et des noms de fichier fixes (`film.webm`, `graphe.txt`,
// `sous-titres.ass`, `voix-<id>.wav`, `sortie.mp4`) ; tout texte venu d'une personne ou de Claude va dans le fichier
// ASS, où `{`, `}` et `\` sont neutralisés — un texte ne peut pas injecter de balise ni de filtre.

import { sousTitres } from './sous-titres.ts';
import { FORMAT_VIDEO, adoucir, imagesCle, situerScenes, dureeTotaleMs, type Animation, type ImageCle, type ReglageAnimation, type Timeline } from './timeline.ts';

export const FICHIERS_RENDU = Object.freeze({ film: 'film.webm', graphe: 'graphe.txt', ass: 'sous-titres.ass', sortie: 'sortie.mp4', dossierPolices: 'polices' });
export const fichierVoix = (sceneId: string): string => `voix-${sceneId}.wav`;

export type ParametresTexte = Readonly<{
  couleurTexte: string;
  couleurFond: string;
  couleurPrincipale: string;
  couleurAccent: string;
  /** Noms de famille de police tels que libass les trouve dans `polices/`. */
  policeTitres: string;
  policeSousTitres: string;
  tailleTitre: number;
  tailleSousTitres: number;
  capitalesSousTitres: boolean;
  /** Zone sûre en pixels de la toile 1080 x 1920. */
  zone: Readonly<{ x: number; y: number; largeur: number; hauteur: number }>;
}>;

export type OptionsRendu = Readonly<{
  genre: 'complet' | 'allege';
  encodeur?: 'libx264' | 'h264_vaapi';
  /** Grave les textes (ASS). Faux quand le filtre `ass` manque (essais). */
  avecTexte?: boolean;
  /** Identifiants des scènes dont un fichier de voix est fourni. */
  voix?: readonly string[];
}>;

export type PlanRendu = Readonly<{ graphe: string; ass: string; args: readonly string[]; dureeMs: number; fichiersVoix: readonly string[] }>;

const COULEUR = /^#[0-9a-fA-F]{6}$/;
function couleur(c: string): string {
  if (!COULEUR.test(c)) throw new Error('couleur invalide');
  return c.slice(1).toUpperCase();
}
const ass_couleur = (c: string): string => {
  const h = couleur(c);
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`;
};
const secondes = (ms: number): string => (ms / 1000).toFixed(3);
const nombre = (x: number): string => {
  if (!Number.isFinite(x)) throw new Error('nombre non fini');
  return String(Math.round(x * 100000) / 100000);
};

/** Texte sûr pour une ligne de dialogue ASS : ni balise, ni saut de ligne, ni caractère de contrôle. */
export function texteAss(texte: string): string {
  // eslint-disable-next-line no-control-regex
  return texte.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\\/g, '/').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\s+/g, ' ').trim();
}
const policeAss = (nom: string): string => nom.replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 40);

function tempsAss(ms: number): string {
  const e = Math.max(0, Math.round(ms / 10));
  const cs = e % 100;
  const s = Math.floor(e / 100) % 60;
  const m = Math.floor(e / 6000) % 60;
  const h = Math.floor(e / 360000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

type Ancrage = Readonly<{ x: number; y: number; alignement: 2 | 5 | 8 }>;

/** Balises d'animation d'un texte : entrée, sortie, position d'ancrage. Seul le catalogue du moteur s'écrit. */
export function balisesAnimation(a: ReglageAnimation, dureeEvenementMs: number, ancre: Ancrage): string {
  const d = Math.min(a.dureeMs, Math.max(100, Math.floor(dureeEvenementMs / 2)));
  const entree = (e: Animation): string => {
    switch (e) {
      case 'glisse_bas':
        return `\\move(${ancre.x},${ancre.y - 90},${ancre.x},${ancre.y},0,${d})`;
      case 'glisse_haut':
        return `\\move(${ancre.x},${ancre.y + 90},${ancre.x},${ancre.y},0,${d})`;
      case 'zoom':
        return `\\fscx40\\fscy40\\t(0,${d},\\fscx100\\fscy100)`;
      default:
        return '';
    }
  };
  const entreeFondue = a.entree !== 'aucune';
  const sortie = a.sortie !== 'aucune';
  const sortieZoom = a.sortie === 'zoom' ? `\\t(${Math.max(0, dureeEvenementMs - d)},${dureeEvenementMs},\\fscx60\\fscy60)` : '';
  const fad = entreeFondue || sortie ? `\\fad(${entreeFondue ? d : 0},${sortie ? d : 0})` : '';
  // La position fixe n'est posée que si l'entrée ne la pose pas elle-même.
  const pos = a.entree === 'glisse_bas' || a.entree === 'glisse_haut' ? '' : `\\pos(${ancre.x},${ancre.y})`;
  return `{${pos}${entree(a.entree)}${sortieZoom}${fad}}`;
}

/** Le fichier de sous-titres ASS : accroche, texte à l'écran, sous-titres de la voix, carte de fin. */
export function construireAss(t: Timeline, p: ParametresTexte, avecSousTitres = true): string {
  const { largeur, hauteur } = FORMAT_VIDEO;
  const zone = p.zone;
  const margeG = Math.max(0, Math.round(zone.x));
  const margeD = Math.max(0, Math.round(largeur - zone.x - zone.largeur));
  const hautY = Math.round(zone.y + 24);
  const basY = Math.round(zone.y + zone.hauteur - 24);
  const styles = [
    `Style: Accroche,${policeAss(p.policeTitres)},${p.tailleTitre},${ass_couleur(p.couleurTexte)},${ass_couleur(p.couleurTexte)},${ass_couleur(p.couleurPrincipale)},${ass_couleur(p.couleurPrincipale)},1,0,0,0,100,100,0,0,3,14,0,8,${margeG},${margeD},${hautY},1`,
    `Style: Ecran,${policeAss(p.policeTitres)},${Math.round(p.tailleTitre * 0.8)},${ass_couleur(p.couleurTexte)},${ass_couleur(p.couleurTexte)},${ass_couleur(p.couleurPrincipale)},${ass_couleur(p.couleurPrincipale)},1,0,0,0,100,100,0,0,3,14,0,5,${margeG},${margeD},0,1`,
    `Style: SousTitre,${policeAss(p.policeSousTitres)},${p.tailleSousTitres},${ass_couleur(p.couleurTexte)},${ass_couleur(p.couleurTexte)},${ass_couleur(p.couleurFond)},${ass_couleur(p.couleurFond)},1,0,0,0,100,100,0,0,3,12,0,2,${margeG},${margeD},${hauteur - basY},1`,
    `Style: Carte,${policeAss(p.policeTitres)},${Math.round(p.tailleTitre * 0.9)},${ass_couleur(p.couleurTexte)},${ass_couleur(p.couleurTexte)},${ass_couleur(p.couleurPrincipale)},${ass_couleur(p.couleurPrincipale)},1,0,0,0,100,100,0,0,1,0,0,5,${margeG},${margeD},0,1`,
  ];
  const evenements: string[] = [];
  const evenement = (style: string, debut: number, fin: number, balises: string, texte: string): void => {
    const propre = texteAss(texte);
    if (propre === '' || fin <= debut) return;
    evenements.push(`Dialogue: 0,${tempsAss(debut)},${tempsAss(fin)},${style},,0,0,0,,${balises}${propre}`);
  };
  const milieu = Math.round(largeur / 2);
  for (const { scene, debutMs, finMs } of situerScenes(t)) {
    const debut = debutMs + scene.animation.delaiMs;
    const duree = finMs - debut;
    evenement('Accroche', debut, finMs, balisesAnimation(scene.animation, duree, { x: milieu, y: hautY, alignement: 8 }), scene.accroche);
    evenement('Ecran', debut, finMs, balisesAnimation(scene.animation, duree, { x: milieu, y: Math.round(hauteur / 2), alignement: 5 }), scene.texteEcran);
  }
  if (avecSousTitres) {
    const sorte = (s: string): string => (p.capitalesSousTitres ? s.toLocaleUpperCase('fr-FR') : s);
    for (const c of sousTitres(t)) evenement('SousTitre', c.debutMs, c.finMs, `{\\pos(${milieu},${basY})\\fad(80,80)}`, sorte(c.texte));
  }
  if (t.carteFin !== null) {
    const debut = dureeTotaleMs(t) - t.carteFin.dureeMs;
    const duree = t.carteFin.dureeMs;
    const b = balisesAnimation(t.carteFin.animation, duree, { x: milieu, y: Math.round(hauteur / 2), alignement: 5 });
    evenement('Carte', debut + t.carteFin.animation.delaiMs, debut + duree, b, [t.carteFin.titre, t.carteFin.sousTitre].filter((x) => x !== '').join('\\N').replace(/\\N/g, ' — '));
  }
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${largeur}`,
    `PlayResY: ${hauteur}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
    ...evenements,
    '',
  ].join('\n');
}

// --- Expressions FFmpeg : le cadre de la caméra -----------------------------------------------------------------------

/** Expression par morceaux de la valeur `champ` des images clés, lissée comme `cadreA` (même `adoucir`). `T` : nom du temps (secondes). */
export function expressionImagesCle(cles: readonly ImageCle[], champ: 'z' | 'cx' | 'cy', T: string): string {
  const morceaux: string[] = [];
  for (let i = 0; i < cles.length - 1; i++) {
    const a = cles[i]!;
    const b = cles[i + 1]!;
    const t0 = a.t / 1000;
    const t1 = b.t / 1000;
    const u = `((${T}-${nombre(t0)})/${nombre(t1 - t0)})`;
    morceaux.push(`gte(${T},${nombre(t0)})*lt(${T},${nombre(t1)})*(${nombre(a[champ])}+${nombre(b[champ] - a[champ])}*(${u}*${u}*(3-2*${u})))`);
  }
  const dernier = cles.at(-1)!;
  morceaux.push(`gte(${T},${nombre(dernier.t / 1000)})*${nombre(dernier[champ])}`);
  return morceaux.join('+');
}

/** Vérifie en TypeScript l'équivalent de l'expression (pour les tests) : même interpolation que `expressionImagesCle`. */
export function evaluerImagesCle(cles: readonly ImageCle[], champ: 'z' | 'cx' | 'cy', tMs: number): number {
  for (let i = 0; i < cles.length - 1; i++) {
    const a = cles[i]!;
    const b = cles[i + 1]!;
    if (tMs >= a.t && tMs < b.t) return a[champ] + (b[champ] - a[champ]) * adoucir((tMs - a.t) / (b.t - a.t));
  }
  return cles.at(-1)![champ];
}

export const FPS = FORMAT_VIDEO.fps;
const FONDU_S = 0.25;

/** Construit le plan complet : graphe, ASS, arguments FFmpeg. */
export function construirePlanRendu(t: Timeline, p: ParametresTexte, o: OptionsRendu): PlanRendu {
  const { largeur, hauteur } = FORMAT_VIDEO;
  const encodeur = o.encodeur ?? 'libx264';
  const avecTexte = o.avecTexte ?? true;
  const situees = situerScenes(t);
  const voix = (o.voix ?? []).filter((id) => t.scenes.some((s) => s.id === id));
  const lignes: string[] = [];

  situees.forEach(({ scene, indice }) => {
    const cles = imagesCle(scene);
    const K = scene.dureeMs / (scene.sourceFinMs - scene.sourceDebutMs);
    const T = 'in_time';
    const z = expressionImagesCle(cles, 'z', T);
    const cx = expressionImagesCle(cles, 'cx', T);
    const cy = expressionImagesCle(cles, 'cy', T);
    const zoomExpr = `max(1,${z})`;
    const fond = [
      `[0:v]trim=start=${secondes(scene.sourceDebutMs)}:end=${secondes(scene.sourceFinMs)}`,
      'setpts=PTS-STARTPTS',
      `setpts=${nombre(K)}*PTS`,
      `fps=${FPS}`,
      `zoompan=z='${zoomExpr}':x='clip((${cx})*iw-iw/zoom/2,0,iw-iw/zoom)':y='clip((${cy})*ih-ih/zoom/2,0,ih-ih/zoom)':d=1:s=${largeur}x${hauteur}:fps=${FPS}`,
    ];
    const suivante = t.scenes[indice + 1];
    if (scene.transition === 'fondu') fond.push(`fade=t=in:st=0:d=${FONDU_S}`);
    if (suivante?.transition === 'fondu') fond.push(`fade=t=out:st=${secondes(Math.max(0, scene.dureeMs - FONDU_S * 1000))}:d=${FONDU_S}`);
    fond.push('setsar=1', 'format=yuv420p');
    lignes.push(`${fond.join(',')}[v${indice}]`);
  });
  const etiquettes = situees.map((_, i) => `[v${i}]`);
  if (t.carteFin !== null) {
    lignes.push(`color=c=0x${couleur(p.couleurPrincipale)}:s=${largeur}x${hauteur}:r=${FPS}:d=${secondes(t.carteFin.dureeMs)},setsar=1,format=yuv420p[vfin]`);
    etiquettes.push('[vfin]');
  }
  lignes.push(`${etiquettes.join('')}concat=n=${etiquettes.length}:v=1:a=0[vc]`);
  const queue: string[] = [];
  if (avecTexte) queue.push(`ass=${FICHIERS_RENDU.ass}:fontsdir=${FICHIERS_RENDU.dossierPolices}`);
  if (o.genre === 'allege') queue.push(`scale=${largeur / 2}:${hauteur / 2}:flags=bicubic`);
  if (encodeur === 'h264_vaapi') queue.push('format=nv12', 'hwupload');
  lignes.push(`[vc]${queue.length > 0 ? queue.join(',') : 'null'}[vout]`);

  // Voix : chaque fichier démarre avec sa scène.
  const entreesVoix = voix.map((id) => fichierVoix(id));
  voix.forEach((id, i) => {
    const debut = situees.find((s) => s.scene.id === id)!.debutMs + 200;
    lignes.push(`[${i + 1}:a]aresample=48000,adelay=${debut}|${debut}[a${i}]`);
  });
  if (voix.length === 1) lignes.push('[a0]anull[aout]');
  else if (voix.length > 1) lignes.push(`${voix.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voix.length}:normalize=0:duration=longest[aout]`);

  const dureeMs = dureeTotaleMs(t);
  const video: string[] =
    encodeur === 'h264_vaapi'
      ? ['-c:v', 'h264_vaapi', '-qp', o.genre === 'allege' ? '28' : '20', ...(o.genre === 'allege' ? ['-maxrate', '1400k'] : [])]
      : o.genre === 'allege'
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1400k', '-bufsize', '2800k', '-pix_fmt', 'yuv420p']
        : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p'];
  const args: string[] = [
    '-hide_banner', '-nostdin', '-y', '-loglevel', 'error',
    ...(encodeur === 'h264_vaapi' ? ['-init_hw_device', 'vaapi=va:/dev/dri/renderD128', '-filter_hw_device', 'va'] : []),
    '-i', FICHIERS_RENDU.film,
    ...entreesVoix.flatMap((f) => ['-i', f]),
    '-/filter_complex', FICHIERS_RENDU.graphe,
    '-map', '[vout]',
    ...(voix.length > 0 ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '96k'] : ['-an']),
    '-r', String(FPS),
    ...video,
    '-map_metadata', '-1',
    '-fflags', '+bitexact', '-flags:v', '+bitexact',
    '-movflags', '+faststart',
    '-t', secondes(dureeMs),
    FICHIERS_RENDU.sortie,
  ];
  return { graphe: lignes.join(';\n'), ass: construireAss(t, p), args, dureeMs, fichiersVoix: entreesVoix };
}
