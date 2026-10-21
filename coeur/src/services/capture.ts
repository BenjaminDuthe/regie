// regie — tâche de file « capture » (histoire 4.2, AD-10, FR-13). Le cœur ne lance jamais de navigateur : il demande
// à Podman (rootless, utilisateur dédié, socket réservé) un conteneur Chromium JETABLE, sans volume, sans privilège,
// sur un réseau interne qui ne joint que le proxy de sortie. La demande et le laissez-passer (signé, court, limité aux
// hôtes de l'application) passent par l'entrée standard du conteneur, jamais par argv ni par l'environnement.

import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import { signerLaissezPasser } from '@regie/contrats';
import type { Applications } from '../infra/applications.ts';
import { ErreurTache, type Executant } from './travailleur.ts';

export type DemandeLanceur = Readonly<{
  /** Nom du conteneur : `regie-capture-<tâche>`, utile pour le retrouver et le nettoyer. */
  nom: string;
  /** Écrit sur l'entrée standard du conteneur (JSON). Contient le laissez-passer. */
  entree: string;
  delaiMs: number;
  signal: AbortSignal;
  /** Reçoit chaque ligne complète de la sortie du conteneur dès qu'elle arrive (le journal du jeu, histoire 4.5). */
  surLigne?: (ligne: string) => void;
}>;

/** Ce que le cœur sait demander : lancer un conteneur de capture et lire sa ligne de résultat. */
export interface LanceurCapture {
  lancer(demande: DemandeLanceur): Promise<string>;
}

export type ReglagesPodman = Readonly<{
  /** Socket Podman de l'utilisateur dédié, sans accès aux autres conteneurs du LXC. */
  socket: string;
  image: string;
  reseau: string;
}>;

export const RESEAU_CAPTURE = 'capture-interne';
export const SORTIE_MAX_OCTETS = 400_000;

/**
 * Arguments de `podman` : fonction pure, testée. Aucun volume, aucun privilège, aucun périphérique ; racine en
 * lecture seule ; réseau interne sans DNS. Rien de secret : le laissez-passer arrive par l'entrée standard.
 */
export function argumentsPodman(r: ReglagesPodman, nom: string, delaiS: number): string[] {
  return [
    '--url', `unix://${r.socket}`,
    'run',
    '--rm',
    '--interactive',
    '--name', nom,
    '--pull=never',
    '--network', r.reseau,
    '--dns', 'none',
    '--no-hosts',
    '--cap-drop=ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--read-only-tmpfs=false',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m',
    '--shm-size', '256m',
    '--pids-limit', '512',
    '--memory', '1g',
    '--memory-swap', '1g',
    '--cpus', '2',
    '--timeout', String(delaiS),
    '--log-driver', 'none',
    '--user', '1000:1000',
    r.image,
  ];
}

type ProcessusMinimal = Readonly<{
  stdin: { end: (donnees: string) => void; on: (e: 'error', f: () => void) => void };
  stdout: { on: (e: 'data', f: (m: Buffer) => void) => void };
  on: (e: 'close' | 'error', f: (code?: number | null) => void) => void;
  kill: (signal?: NodeJS.Signals) => boolean;
}>;
export type Lancement = (commande: string, args: string[]) => ProcessusMinimal;

const lancementReel: Lancement = (commande, args) =>
  spawn(commande, args, { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: '/usr/bin:/bin:/usr/local/bin' } }) as unknown as ProcessusMinimal;

export class LanceurPodman implements LanceurCapture {
  readonly #reglages: ReglagesPodman;
  readonly #lancement: Lancement;

  constructor(reglages: ReglagesPodman, lancement: Lancement = lancementReel) {
    this.#reglages = reglages;
    this.#lancement = lancement;
  }

  lancer(d: DemandeLanceur): Promise<string> {
    return new Promise((resoudre, rejeter) => {
      const delaiS = Math.ceil(d.delaiMs / 1000);
      const p = this.#lancement('podman', argumentsPodman(this.#reglages, d.nom, delaiS));
      const morceaux: Buffer[] = [];
      let total = 0;
      let fini = false;
      let reste = '';
      const decodeur = new StringDecoder('utf8');
      const lignes = (texte: string): void => {
        if (d.surLigne === undefined) return;
        reste += texte;
        let i: number;
        while ((i = reste.indexOf('\n')) >= 0) {
          const ligne = reste.slice(0, i);
          reste = reste.slice(i + 1);
          try {
            d.surLigne(ligne);
          } catch {
            // Un écouteur fautif ne casse pas la capture.
          }
        }
      };
      const terminer = (f: () => void) => {
        if (fini) return;
        fini = true;
        clearTimeout(minuteur);
        d.signal.removeEventListener('abort', arret);
        f();
      };
      const arret = () => {
        p.kill('SIGKILL');
        terminer(() => rejeter(new Error('ANNULE')));
      };
      const minuteur = setTimeout(() => {
        p.kill('SIGKILL');
        terminer(() => rejeter(new Error('DELAI')));
      }, d.delaiMs + 5000);
      d.signal.addEventListener('abort', arret, { once: true });
      if (d.signal.aborted) return arret();
      p.stdout.on('data', (m) => {
        total += m.length;
        if (total > SORTIE_MAX_OCTETS) {
          p.kill('SIGKILL');
          terminer(() => rejeter(new Error('SORTIE_TROP_LONGUE')));
          return;
        }
        morceaux.push(m);
        lignes(decodeur.write(m));
      });
      p.stdin.on('error', () => undefined);
      p.on('error', () => terminer(() => rejeter(new Error('LANCEMENT'))));
      p.on('close', (code) => terminer(() => {
        if (reste !== '') lignes('\n');
        return code === 0 ? resoudre(Buffer.concat(morceaux).toString('utf8')) : rejeter(new Error(`SORTIE_${code ?? 'inconnue'}`));
      }));
      p.stdin.end(d.entree);
    });
  }
}

const entreeTache = z.strictObject({ applicationId: z.uuid() });
const resultatConteneur = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), hote: z.string().max(253), titre: z.string().max(200), miniature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(300_000) }),
  z.strictObject({ ok: z.literal(false), cause: z.enum(['HOTE_REFUSE', 'PAGE_INJOIGNABLE', 'CAPTURE_ECHEC']), hote: z.string().max(253).optional() }),
]);

export type ResultatMiniCapture = Readonly<{ hote: string; titre: string; miniature: string }>;

export type OptionsExecutantCapture = Readonly<{
  applications: Applications;
  lanceur: LanceurCapture;
  /** Clé partagée avec le proxy de sortie (32 octets au moins). */
  cle: Buffer;
  /** Adresse du proxy de sortie sur le réseau interne : `ip:port`. */
  proxy: string;
  maintenant?: () => number;
}>;

export const VIEWPORT = Object.freeze({ largeur: 360, hauteur: 640 });
export const DELAI_CAPTURE_MS = 60_000;
export const DUREE_LAISSEZ_PASSER_S = 300;

export function hoteDeAccueil(accueil: string): string | undefined {
  try {
    const u = new URL(accueil);
    return u.protocol === 'https:' ? u.hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** Mini capture de la page d'accueil d'une application : l'hôte vu, le titre et une vignette PNG (base64). */
export function creerExecutantCapture(o: OptionsExecutantCapture): Executant {
  return {
    executer: async (tache, aide) => {
      const entree = entreeTache.safeParse(tache.entree);
      if (!entree.success) throw new ErreurTache('ENTREE_INVALIDE', 'verifier', false);
      const application = await o.applications.lire(tache.marqueId, tache.utilisateurId, entree.data.applicationId);
      if (application === undefined) throw new ErreurTache('APPLICATION_INTROUVABLE', 'verifier', false);
      const hote = hoteDeAccueil(application.accueil);
      if (hote === undefined || !application.hotes.includes(hote)) throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
      const laissezPasser = signerLaissezPasser(o.cle, tache.id, application.hotes, DUREE_LAISSEZ_PASSER_S, o.maintenant?.());
      let sortie: string;
      try {
        sortie = await o.lanceur.lancer({
          nom: `regie-capture-${tache.id}`,
          entree: JSON.stringify({
            url: application.accueil,
            hotes: application.hotes,
            proxy: { serveur: `http://${o.proxy}`, laissezPasser },
            viewport: VIEWPORT,
            delaiMs: DELAI_CAPTURE_MS,
          }),
          delaiMs: DELAI_CAPTURE_MS + 15_000,
          signal: aide.signal,
        });
      } catch (erreur) {
        if (aide.signal.aborted) throw erreur;
        throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      }
      let brut: unknown;
      try {
        brut = JSON.parse(sortie.trim().split('\n').at(-1) ?? '');
      } catch {
        throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      }
      const resultat = resultatConteneur.safeParse(brut);
      if (!resultat.success) throw new ErreurTache('CAPTURE_ECHEC', 'relancer', true);
      if (!resultat.data.ok) {
        // Pas de nouvel essai pour un hôte refusé : le résultat serait le même.
        throw new ErreurTache(resultat.data.cause, resultat.data.cause === 'HOTE_REFUSE' ? 'verifier' : 'relancer', resultat.data.cause !== 'HOTE_REFUSE');
      }
      const { hote: vu, titre, miniature } = resultat.data;
      if (!application.hotes.includes(vu)) throw new ErreurTache('HOTE_REFUSE', 'verifier', false);
      return { hote: vu, titre, miniature } satisfies ResultatMiniCapture;
    },
  };
}
