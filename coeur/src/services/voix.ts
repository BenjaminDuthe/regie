// regie — voix de synthèse locale (histoire 4.7, FR-27, NFR-26, NFR-30). Le texte de voix de chaque scène est dit par une
// voix libre, locale, sans IA en nuage : le cœur demande à un `MoteurVoix` (interface) ; en production, un conteneur
// jetable de l'image de rendu (Piper, sans réseau, modèle monté en lecture seule sur /modeles). Les tests ont un faux
// moteur. Le modèle n'est utilisé que si `modeles.lock` en donne l'empreinte SHA-256 : sans empreinte, refus (fail-closed).

import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import type { File } from '../infra/file.ts';
import type { Montages } from '../infra/montages.ts';
import type { Stockage } from '../infra/stockage.ts';
import { PREFIXE_FILM, type DemandeLanceur, type LanceurCapture } from './capture.ts';
import { Reassembleur, VOIX_MAX_OCTETS, estWav } from './flux-fichiers.ts';
import { lancerRendu } from './rendu.ts';
import { ErreurTache, type Executant } from './travailleur.ts';

export const DELAI_VOIX_MS = 120_000;
/** Une scène parle au plus deux minutes : au-delà, le fichier est refusé. */
export const VOIX_DUREE_MAX_MS = 120_000;

export interface MoteurVoix {
  /** Les octets d'un WAV qui dit `texte`. Lève une erreur si la synthèse échoue ; l'appelant contrôle le résultat. */
  dire(demande: Readonly<{ nom: string; texte: string; delaiMs: number; signal: AbortSignal }>): Promise<Buffer>;
}

// --- modeles.lock : l'unique liste des modèles (AD-11). ---

const ModeleVerrouille = z.strictObject({
  nom: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
  type: z.enum(['voix']),
  fichier: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.onnx$/),
  version: z.string().min(1).max(40),
  licence: z.string().min(1).max(40),
  source: z.url(),
  /** `null` tant que le modèle n'est pas téléchargé et mesuré : il est alors REFUSÉ. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
});
export type ModeleVerrouille = z.infer<typeof ModeleVerrouille>;
const FichierLock = z.strictObject({ $commentaire: z.string().optional(), modeles: z.array(ModeleVerrouille).max(50) });

export class ErreurModeles extends Error {}

/** Lit `modeles.lock`. Une empreinte manquante ou un doublon refuse tout le fichier : on ne démarre pas avec un modèle non vérifié. */
export function lireModelesLock(texte: string): readonly ModeleVerrouille[] {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new ErreurModeles('modeles.lock illisible');
  }
  const lu = FichierLock.safeParse(brut);
  if (!lu.success) throw new ErreurModeles('modeles.lock invalide');
  const noms = new Set<string>();
  for (const m of lu.data.modeles) {
    if (m.sha256 === null) throw new ErreurModeles(`modeles.lock : empreinte SHA-256 manquante pour « ${m.nom} »`);
    if (noms.has(m.nom)) throw new ErreurModeles(`modeles.lock : « ${m.nom} » déclaré deux fois`);
    noms.add(m.nom);
  }
  return lu.data.modeles;
}

export function modeleDeVoix(lock: readonly ModeleVerrouille[], nom: string): { fichier: string; sha256: string } {
  const m = lock.find((x) => x.nom === nom && x.type === 'voix');
  if (m === undefined || m.sha256 === null) throw new ErreurModeles(`voix « ${nom} » absente de modeles.lock`);
  return { fichier: m.fichier, sha256: m.sha256 };
}

// --- Moteur réel : un conteneur jetable par scène (le réassembleur ne porte qu'un fichier). ---

const resultatConteneur = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), octets: z.number().int().min(0) }),
  z.strictObject({ ok: z.literal(false), cause: z.string().max(60) }),
]);

export class MoteurVoixConteneur implements MoteurVoix {
  readonly #lanceur: LanceurCapture;
  readonly #modele: Readonly<{ fichier: string; sha256: string }>;

  constructor(lanceur: LanceurCapture, modele: Readonly<{ fichier: string; sha256: string }>) {
    this.#lanceur = lanceur;
    this.#modele = modele;
  }

  async dire(d: Readonly<{ nom: string; texte: string; delaiMs: number; signal: AbortSignal }>): Promise<Buffer> {
    const reassembleur = new Reassembleur(VOIX_MAX_OCTETS);
    const demande: DemandeLanceur = {
      nom: d.nom,
      entree: `${JSON.stringify({ modele: this.#modele, texte: d.texte })}\n`,
      delaiMs: d.delaiMs,
      signal: d.signal,
      surLigne: (ligne) => void reassembleur.ajouter(ligne),
    };
    const sortie = await this.#lanceur.lancer(demande);
    const derniere = sortie.trim().split('\n').filter((l) => !l.startsWith(PREFIXE_FILM)).at(-1) ?? '';
    let brut: unknown;
    try {
      brut = JSON.parse(derniere);
    } catch {
      throw new Error('RESULTAT_ILLISIBLE');
    }
    const lu = resultatConteneur.safeParse(brut);
    if (!lu.success) throw new Error('RESULTAT_ILLISIBLE');
    if (!lu.data.ok) throw new Error(lu.data.cause);
    if (reassembleur.erreur !== undefined) throw new Error(reassembleur.erreur);
    const fichier = reassembleur.fichier;
    if (fichier === undefined || fichier.octets.length !== lu.data.octets) throw new Error('FLUX_INCOMPLET');
    return fichier.octets;
  }
}

// --- Contrôle du WAV reçu. ---

/**
 * Durée en millisecondes d'un WAV PCM (en-tête RIFF : `fmt ` puis `data`), ou `undefined` si l'en-tête est incohérent.
 * La taille de `data` est bornée par ce qui reste réellement dans le fichier.
 */
export function dureeWav(octets: Uint8Array): number | undefined {
  const b = Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength);
  if (!estWav(b)) return undefined;
  let octetsParSeconde: number | undefined;
  let pos = 12;
  while (pos + 8 <= b.length) {
    const id = b.toString('latin1', pos, pos + 4);
    const taille = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      if (taille < 16 || pos + 8 + 16 > b.length) return undefined;
      octetsParSeconde = b.readUInt32LE(pos + 8 + 8);
    } else if (id === 'data') {
      if (octetsParSeconde === undefined || octetsParSeconde === 0) return undefined;
      const reel = Math.min(taille, b.length - (pos + 8));
      const ms = Math.round((reel * 1000) / octetsParSeconde);
      return ms > 0 ? ms : undefined;
    }
    pos += 8 + taille + (taille % 2);
  }
  return undefined;
}

// --- Tâche « voix ». ---

const entreeTache = z.strictObject({ montageId: z.uuid() });

export type OptionsExecutantVoix = Readonly<{ montages: Montages; stockage: Stockage; moteur: MoteurVoix; file: File; delaiMs?: number }>;

/** Enfile la tâche `voix` d'un montage. `undefined` si le montage n'existe pas pour cette personne. */
export async function lancerVoix(s: { montages: Montages; file: File }, qui: { marqueId: string; utilisateurId: string }, montageId: string): Promise<{ tacheId: string } | undefined> {
  const montage = await s.montages.lire(qui.marqueId, qui.utilisateurId, montageId);
  if (montage === undefined) return undefined;
  const tache = await s.file.enfiler(qui.marqueId, qui.utilisateurId, 'voix', { montageId });
  return { tacheId: tache.id };
}

/** Dit le texte de voix de chaque scène, range les WAV contrôlés, puis met le rendu allégé en file. */
export function creerExecutantVoix(o: OptionsExecutantVoix): Executant {
  return {
    executer: async (tache, aide) => {
      const entree = entreeTache.safeParse(tache.entree);
      if (!entree.success) throw new ErreurTache('ENTREE_INVALIDE', 'verifier', false);
      const qui = { marqueId: tache.marqueId, utilisateurId: tache.utilisateurId };
      const montage = await o.montages.lire(qui.marqueId, qui.utilisateurId, entree.data.montageId);
      if (montage === undefined) throw new ErreurTache('MONTAGE_INTROUVABLE', 'verifier', false);
      const deja = new Set((await o.montages.listerVoix(qui.marqueId, qui.utilisateurId, montage.id)).map((f) => f.sceneId));
      let dites = 0;
      for (const scene of montage.timeline.scenes) {
        const texte = scene.voix.trim();
        // Reprise après incident : une scène déjà dite n'est pas redite.
        if (texte === '' || deja.has(scene.id)) continue;
        let wav: Buffer;
        try {
          wav = await o.moteur.dire({ nom: `regie-voix-${tache.id}-${dites}`, texte, delaiMs: o.delaiMs ?? DELAI_VOIX_MS, signal: aide.signal });
        } catch (erreur) {
          if (aide.signal.aborted) throw erreur;
          throw new ErreurTache('VOIX_ECHEC', 'relancer', true);
        }
        const dureeMs = wav.length <= VOIX_MAX_OCTETS ? dureeWav(wav) : undefined;
        if (dureeMs === undefined || dureeMs > VOIX_DUREE_MAX_MS) throw new ErreurTache('VOIX_INVALIDE', 'verifier', false);
        const fichierId = randomUUID();
        await o.stockage.ecrire(qui.marqueId, fichierId, wav);
        await o.montages.ajouterFichier(qui.marqueId, qui.utilisateurId, montage.espaceId, {
          id: fichierId,
          genre: 'voix',
          mime: 'audio/wav',
          octets: wav.length,
          sha256: createHash('sha256').update(wav).digest('hex'),
          dureeMs,
          montageId: montage.id,
          sceneId: scene.id,
        });
        dites += 1;
      }
      // Un seul rendu par reprise : si un rendu existe déjà (tâche rejouée), on ne le double pas.
      const rendus = await o.montages.listerRendus(qui.marqueId, qui.utilisateurId, montage.id);
      if (rendus.length === 0) {
        const lance = await lancerRendu(o, qui, montage.id, 'allege');
        if (lance === undefined) throw new ErreurTache('MONTAGE_INTROUVABLE', 'verifier', false);
      }
      return { montageId: montage.id, scenesDites: dites };
    },
  };
}
