// regie — jeu d'un script de démo dans le conteneur de capture (histoire 4.5, FR-18). Le moteur ne connaît pas Playwright :
// il parle à un `PiloteNavigateur`, que l'adaptateur `pilote-playwright.ts` branche sur le vrai navigateur et que les
// tests remplacent par un faux. Il rejoue les étapes dans l'ordre, tient le journal horodaté (entrées, choix, clics) et
// COUPE le jeu dès qu'une navigation sort de la liste des hôtes autorisés. Le journal ne cite jamais une valeur saisie
// ni le compte de démonstration : seulement le verbe, la cible visée et l'hôte.

import type { EntreeJournal, EtapeConnexion, EtapeJeu, GenreJournal, ResultatJeu } from './demande.ts';

/** Position du pointeur en millièmes de la page (0 à 1000), pour l'aperçu. */
export type Point = Readonly<{ x: number; y: number }>;

export interface PiloteNavigateur {
  aller(url: string, delaiMs: number): Promise<void>;
  cliquer(cible: string, delaiMs: number): Promise<Point | undefined>;
  saisir(cible: string, valeur: string, delaiMs: number): Promise<Point | undefined>;
  survoler(cible: string, delaiMs: number): Promise<Point | undefined>;
  attendre(cible: string, delaiMs: number): Promise<void>;
  defiler(cible: string | undefined, pixels: number | undefined, delaiMs: number): Promise<void>;
  /** Saisit le compte de démonstration dans le formulaire de la page ; rend l'étape fautive, ou `undefined`. */
  seConnecter(compte: Readonly<{ identifiant: string; motDePasse: string }>, delaiMs: number): Promise<EtapeConnexion | undefined>;
  /** Adresse de la page ouverte. */
  urlCourante(): string;
  /** Premier hôte coupé par la garde du navigateur depuis le début du jeu, ou `undefined`. */
  hoteRefuse(): string | undefined;
  /** Capture PNG de la page. */
  capturer(): Promise<Uint8Array>;
  /** Ferme la page et rend la taille du film enregistré, si l'on en a fait un. */
  terminer(): Promise<Readonly<{ octets: number }> | undefined>;
}

export type EnvironnementJeu = Readonly<{
  /** Millisecondes écoulées, horloge monotone. */
  maintenant: () => number;
  /** Attente d'une pause du script (le faux n'attend pas). */
  dormir: (ms: number) => Promise<void>;
}>;

export const ENVIRONNEMENT_REEL: EnvironnementJeu = Object.freeze({
  maintenant: () => performance.now(),
  dormir: (ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms)),
});

/** Délai d'une étape ; le délai global du jeu le borne aussi. */
export const DELAI_ETAPE_MS = 10_000;
/** La capture d'écran d'un échec reste sous cette taille (octets), pour tenir dans la ligne de résultat. */
export const CAPTURE_ECHEC_MAX_OCTETS = 190_000;

export type DemandeJeu = Readonly<{
  url: string;
  hotes: readonly string[];
  etapes: readonly EtapeJeu[];
  delaiMs: number;
  compte?: Readonly<{ identifiant: string; motDePasse: string }>;
}>;

export function hoteDe(adresse: string): string | undefined {
  try {
    const u = new URL(adresse);
    return u.protocol === 'https:' ? u.hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

const estAutorise = (adresse: string, hotes: readonly string[]): boolean => {
  const h = hoteDe(adresse);
  return h !== undefined && hotes.includes(h);
};

/** Rejoue le script. `surJournal` reçoit chaque entrée au moment où elle est écrite (le flux en direct). */
export async function jouerScript(demande: DemandeJeu, pilote: PiloteNavigateur, surJournal: (e: EntreeJournal) => void, env: EnvironnementJeu = ENVIRONNEMENT_REEL): Promise<ResultatJeu> {
  const debut = env.maintenant();
  const ecrire = (etape: number, genre: GenreJournal, plus: { cible?: string; point?: Point | undefined } = {}): void =>
    surJournal({
      t: Math.max(0, Math.round(env.maintenant() - debut)),
      etape,
      genre,
      ...(plus.cible !== undefined ? { cible: plus.cible.slice(0, 300) } : {}),
      ...(plus.point !== undefined ? { x: plus.point.x, y: plus.point.y } : {}),
    });
  const reste = (): number => demande.delaiMs - (env.maintenant() - debut);
  const delaiEtape = (): number => Math.max(1, Math.min(DELAI_ETAPE_MS, reste()));

  const refuser = (etape: number, hote: string | undefined): ResultatJeu => {
    ecrire(etape, 'refus', hote !== undefined ? { cible: hote } : {});
    return { ok: false, cause: 'HOTE_REFUSE', etape, ...(hote !== undefined ? { hote } : {}) };
  };
  const echouer = async (etape: number, cause: 'ETAPE_ECHEC' | 'PAGE_INJOIGNABLE' | 'DELAI_DEPASSE', verbe?: EtapeJeu): Promise<ResultatJeu> => {
    ecrire(etape, 'echec', verbe !== undefined && 'cible' in verbe && verbe.cible !== undefined ? { cible: verbe.cible } : {});
    let capture: string | undefined;
    try {
      const png = await pilote.capturer();
      if (png.byteLength <= CAPTURE_ECHEC_MAX_OCTETS) capture = Buffer.from(png).toString('base64');
    } catch {
      // Pas de capture : l'échec reste dit, sans image.
    }
    return { ok: false, cause, etape, ...(capture !== undefined ? { capture } : {}) };
  };
  /** Après chaque étape : la page ouverte et toute requête coupée doivent rester dans la liste. */
  const horsListe = (): { hote: string | undefined } | undefined => {
    const coupe = pilote.hoteRefuse();
    if (coupe !== undefined) return { hote: coupe };
    const actuelle = pilote.urlCourante();
    if (actuelle !== '' && actuelle !== 'about:blank' && !estAutorise(actuelle, demande.hotes)) return { hote: hoteDe(actuelle) };
    return undefined;
  };

  // La page d'accueil de l'application ouvre toujours le jeu ; le script part de là.
  if (!estAutorise(demande.url, demande.hotes)) return refuser(0, hoteDe(demande.url));
  try {
    await pilote.aller(demande.url, delaiEtape());
  } catch {
    const refus = horsListe();
    if (refus !== undefined) return refuser(0, refus.hote);
    return echouer(0, 'PAGE_INJOIGNABLE');
  }
  const refusAccueil = horsListe();
  if (refusAccueil !== undefined) return refuser(0, refusAccueil.hote);
  ecrire(0, 'navigation', { cible: hoteDe(demande.url) ?? '' });

  for (const [i, etape] of demande.etapes.entries()) {
    const n = i + 1;
    if (reste() <= 0) return echouer(n, 'DELAI_DEPASSE');
    try {
      switch (etape.verbe) {
        case 'aller': {
          // La destination est refusée AVANT d'ouvrir la page : un hôte hors liste ne reçoit aucune requête.
          if (!estAutorise(etape.url, demande.hotes)) return refuser(n, hoteDe(etape.url));
          await pilote.aller(etape.url, delaiEtape());
          ecrire(n, 'navigation', { cible: hoteDe(etape.url) ?? '' });
          break;
        }
        case 'cliquer':
          ecrire(n, 'clic', { cible: etape.cible, point: await pilote.cliquer(etape.cible, delaiEtape()) });
          break;
        case 'survoler':
          ecrire(n, 'survol', { cible: etape.cible, point: await pilote.survoler(etape.cible, delaiEtape()) });
          break;
        case 'saisir':
          // La valeur saisie n'est jamais écrite au journal.
          ecrire(n, 'saisie', { cible: etape.cible, point: await pilote.saisir(etape.cible, etape.valeur, delaiEtape()) });
          break;
        case 'attendre':
          await pilote.attendre(etape.cible, delaiEtape());
          ecrire(n, 'attente', { cible: etape.cible });
          break;
        case 'defiler':
          await pilote.defiler(etape.cible, etape.pixels, delaiEtape());
          ecrire(n, 'defilement', etape.cible !== undefined ? { cible: etape.cible } : {});
          break;
        case 'pause':
          await env.dormir(Math.min(etape.secondes * 1000, Math.max(0, reste())));
          ecrire(n, 'pause');
          break;
        case 'narration':
          ecrire(n, 'narration', { cible: etape.texte });
          break;
        case 'filmer':
          ecrire(n, etape.mode === 'demarrer' ? 'film_debut' : 'film_fin');
          break;
        case 'connexion': {
          if (demande.compte === undefined) return echouer(n, 'ETAPE_ECHEC', etape);
          const faute = await pilote.seConnecter(demande.compte, delaiEtape());
          const refus = horsListe();
          if (refus !== undefined) return refuser(n, refus.hote);
          // Aucune capture d'une connexion en échec : le formulaire contient le mot de passe.
          if (faute !== undefined) {
            ecrire(n, 'echec');
            return { ok: false, cause: 'CONNEXION_ECHEC', etape: n, etapeConnexion: faute };
          }
          ecrire(n, 'connexion');
          break;
        }
      }
    } catch {
      // Un hôte coupé ou une page hors liste prime sur la cause apparente (délai, élément introuvable).
      const refus = horsListe();
      if (refus !== undefined) return refuser(n, refus.hote);
      return echouer(n, reste() <= 0 ? 'DELAI_DEPASSE' : etape.verbe === 'aller' ? 'PAGE_INJOIGNABLE' : 'ETAPE_ECHEC', etape);
    }
    const refus = horsListe();
    if (refus !== undefined) return refuser(n, refus.hote);
  }

  const hote = hoteDe(pilote.urlCourante()) ?? hoteDe(demande.url) ?? '';
  const film = await pilote.terminer();
  const dureeMs = Math.max(0, Math.round(env.maintenant() - debut));
  ecrire(0, 'fin');
  return { ok: true, dureeMs, etapes: demande.etapes.length, hote, ...(film !== undefined ? { video: film } : {}) };
}
