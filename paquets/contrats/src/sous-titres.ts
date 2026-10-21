// regie — sous-titres d'un montage (histoire 4.7, FR-27) : tirés du texte de la voix de chaque scène, jamais saisis à
// part. Module pur : mêmes scènes, mêmes durées de voix, mêmes sous-titres. Sortie en SRT (fichier livrable) et en cues
// que le rendu grave (ASS, `rendu.ts`).

import { situerScenes, type Timeline } from './timeline.ts';

export type Cue = Readonly<{ sceneId: string; debutMs: number; finMs: number; texte: string }>;

export const CUE_MAX_CARACTERES = 56;
const MARGE_FIN_MS = 150;

/** Coupe un texte en phrases courtes (fin de phrase, puis virgule, puis mot) d'au plus `max` caractères. */
export function decouperPhrases(texte: string, max = CUE_MAX_CARACTERES): string[] {
  const propre = texte.replace(/\s+/g, ' ').trim();
  if (propre === '') return [];
  const morceaux = propre.match(/[^.!?…;:]+[.!?…;:]*/gu)?.map((m) => m.trim()).filter((m) => m !== '') ?? [propre];
  const sortie: string[] = [];
  for (const m of morceaux) {
    let reste = m;
    while (reste.length > max) {
      let coupe = reste.lastIndexOf(',', max);
      if (coupe < max / 3) coupe = reste.lastIndexOf(' ', max);
      if (coupe < 1) coupe = max;
      sortie.push(reste.slice(0, coupe + (reste[coupe] === ',' ? 1 : 0)).trim());
      reste = reste.slice(coupe + 1).trim();
    }
    if (reste !== '') sortie.push(reste);
  }
  return sortie;
}

/**
 * Les sous-titres de tout le montage. Dans une scène, le temps se répartit entre les phrases au prorata de leur
 * longueur ; la voix démarre avec la scène (`debutVoixMs` de décalage) et ne dépasse pas sa fin.
 */
export function sousTitres(t: Timeline, debutVoixMs = 200): Cue[] {
  const cues: Cue[] = [];
  for (const { scene, debutMs, finMs } of situerScenes(t)) {
    const phrases = decouperPhrases(scene.voix);
    if (phrases.length === 0) continue;
    const debut = debutMs + Math.min(debutVoixMs, Math.max(0, scene.dureeMs - 500));
    const utile = Math.max(1, finMs - MARGE_FIN_MS - debut);
    const total = phrases.reduce((s, p) => s + p.length, 0);
    let courant = debut;
    phrases.forEach((texte, i) => {
      const part = i === phrases.length - 1 ? debut + utile - courant : Math.round((utile * texte.length) / total);
      cues.push({ sceneId: scene.id, debutMs: courant, finMs: courant + Math.max(1, part), texte });
      courant += part;
    });
  }
  return cues;
}

const deux = (n: number): string => String(n).padStart(2, '0');
export function tempsSrt(ms: number): string {
  const e = Math.max(0, Math.round(ms));
  return `${deux(Math.floor(e / 3_600_000))}:${deux(Math.floor((e % 3_600_000) / 60_000))}:${deux(Math.floor((e % 60_000) / 1000))},${String(e % 1000).padStart(3, '0')}`;
}

/** Le fichier SRT : numéros, intervalles, texte sur une ligne, ligne vide entre deux cues. */
export function versSrt(cues: readonly Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${tempsSrt(c.debutMs)} --> ${tempsSrt(c.finMs)}\n${c.texte.replace(/[\r\n]+/g, ' ')}\n`).join('\n');
}
