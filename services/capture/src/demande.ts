// regie — demande de capture reçue sur l'entrée standard du conteneur (histoire 4.2). Ni argument ni variable
// d'environnement : le laissez-passer ne se voit pas dans `ps`. Validation à la main (le service n'a aucune dépendance).

export type DemandeCapture = Readonly<{
  url: string;
  /** Hôtes autorisés de l'application : seconde garde, après le proxy. */
  hotes: readonly string[];
  proxy: Readonly<{ serveur: string; laissezPasser: string }>;
  viewport: Readonly<{ largeur: number; hauteur: number }>;
  delaiMs: number;
  /** Présent pour un essai de connexion (histoire 4.3) ou pour un script qui contient l'étape `connexion`. Jamais écrit, jamais journalisé. */
  compte?: Readonly<{ identifiant: string; motDePasse: string }>;
  /** Présent seulement pour le jeu d'un script (histoire 4.5) : les étapes à rejouer, dans l'ordre. */
  etapes?: readonly EtapeJeu[];
}>;

/** Une étape de script, telle que la capture la reçoit (même forme que `EtapeScript` du paquet contrats, validée à la main). */
export type EtapeJeu =
  | Readonly<{ verbe: 'aller'; url: string }>
  | Readonly<{ verbe: 'cliquer' | 'attendre' | 'survoler'; cible: string }>
  | Readonly<{ verbe: 'saisir'; cible: string; valeur: string }>
  | Readonly<{ verbe: 'connexion' }>
  | Readonly<{ verbe: 'filmer'; mode: 'demarrer' | 'arreter' }>
  | Readonly<{ verbe: 'defiler'; cible?: string; pixels?: number }>
  | Readonly<{ verbe: 'pause'; secondes: number }>
  | Readonly<{ verbe: 'narration'; texte: string }>;

export const ETAPES_JEU_MAX = 100;

/** https, sans identifiants ni port autre que 443 (comme le paquet contrats). */
function urlHttpsSimple(adresse: string): boolean {
  try {
    const u = new URL(adresse);
    return u.protocol === 'https:' && u.username === '' && u.password === '' && (u.port === '' || u.port === '443');
  } catch {
    return false;
  }
}

const chaine = (x: unknown, max: number): x is string => typeof x === 'string' && x.trim().length >= 1 && x.length <= max;
const memesChamps = (o: Record<string, unknown>, attendus: readonly string[]): boolean => Object.keys(o).every((k) => k === 'verbe' || attendus.includes(k));

/** Valide une étape reçue ; lève sans citer sa valeur. */
export function lireEtapeJeu(brute: unknown): EtapeJeu {
  if (typeof brute !== 'object' || brute === null || Array.isArray(brute)) throw new Error('étape invalide');
  const e = brute as Record<string, unknown>;
  switch (e['verbe']) {
    case 'aller':
      if (chaine(e['url'], 2000) && memesChamps(e, ['url']) && urlHttpsSimple(e['url'].trim())) return { verbe: 'aller', url: e['url'].trim() };
      break;
    case 'cliquer':
    case 'attendre':
    case 'survoler':
      if (chaine(e['cible'], 300) && memesChamps(e, ['cible'])) return { verbe: e['verbe'], cible: e['cible'].trim() };
      break;
    case 'saisir':
      if (chaine(e['cible'], 300) && typeof e['valeur'] === 'string' && e['valeur'].length <= 500 && memesChamps(e, ['cible', 'valeur'])) return { verbe: 'saisir', cible: e['cible'].trim(), valeur: e['valeur'] };
      break;
    case 'connexion':
      if (memesChamps(e, [])) return { verbe: 'connexion' };
      break;
    case 'filmer':
      if ((e['mode'] === 'demarrer' || e['mode'] === 'arreter') && memesChamps(e, ['mode'])) return { verbe: 'filmer', mode: e['mode'] };
      break;
    case 'defiler': {
      const cible = e['cible'];
      const pixels = e['pixels'];
      if ((cible === undefined || chaine(cible, 300)) && (pixels === undefined || (typeof pixels === 'number' && Number.isInteger(pixels) && Math.abs(pixels) <= 5000)) && memesChamps(e, ['cible', 'pixels'])) {
        return { verbe: 'defiler', ...(cible !== undefined ? { cible: cible.trim() } : {}), ...(pixels !== undefined ? { pixels } : {}) };
      }
      break;
    }
    case 'pause':
      if (typeof e['secondes'] === 'number' && e['secondes'] >= 0.1 && e['secondes'] <= 30 && memesChamps(e, ['secondes'])) return { verbe: 'pause', secondes: e['secondes'] };
      break;
    case 'narration':
      if (chaine(e['texte'], 500) && memesChamps(e, ['texte'])) return { verbe: 'narration', texte: e['texte'].trim() };
      break;
  }
  throw new Error('étape invalide');
}

/** Ce qu'un tour de jeu a vu, pour le journal horodaté (histoire 4.5). `t` : millisecondes depuis le début du jeu. */
export const GENRES_JOURNAL = ['navigation', 'clic', 'survol', 'saisie', 'attente', 'defilement', 'pause', 'narration', 'connexion', 'film_debut', 'film_fin', 'refus', 'echec', 'fin'] as const;
export type GenreJournal = (typeof GENRES_JOURNAL)[number];
export type EntreeJournal = Readonly<{
  t: number;
  /** Numéro de l'étape, à partir de 1 ; 0 pour une entrée qui n'est pas d'une étape (la fin). */
  etape: number;
  genre: GenreJournal;
  /** Hôte, texte ou sélecteur visé. Jamais une valeur saisie ni un identifiant. */
  cible?: string;
  /** Position du pointeur en millièmes de la largeur et de la hauteur de la page, pour l'aperçu. */
  x?: number;
  y?: number;
}>;

export type CauseJeu = 'HOTE_REFUSE' | 'PAGE_INJOIGNABLE' | 'ETAPE_ECHEC' | 'CONNEXION_ECHEC' | 'DELAI_DEPASSE' | 'CAPTURE_ECHEC';
export type ResultatJeu =
  | Readonly<{ ok: true; dureeMs: number; etapes: number; hote: string; video?: Readonly<{ octets: number }> }>
  | Readonly<{ ok: false; cause: CauseJeu; etape: number; hote?: string; etapeConnexion?: EtapeConnexion; capture?: string }>;

export const ETAPES_CONNEXION = ['ouvrir', 'trouver', 'saisir', 'valider'] as const;
export type EtapeConnexion = (typeof ETAPES_CONNEXION)[number];

export type ResultatCapture =
  | Readonly<{ ok: true; hote: string; titre: string; miniature: string }>
  | Readonly<{ ok: false; cause: 'HOTE_REFUSE' | 'PAGE_INJOIGNABLE' | 'CAPTURE_ECHEC'; hote?: string }>
  | Readonly<{ ok: false; cause: 'CONNEXION_ECHEC'; etape: EtapeConnexion }>;

const entier = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

export function lireDemande(brut: string): DemandeCapture {
  const d = JSON.parse(brut) as Record<string, unknown>;
  const proxy = d['proxy'] as Record<string, unknown> | undefined;
  const vue = d['viewport'] as Record<string, unknown> | undefined;
  if (
    typeof d['url'] !== 'string' ||
    !Array.isArray(d['hotes']) ||
    !d['hotes'].every((h) => typeof h === 'string') ||
    typeof proxy?.['serveur'] !== 'string' ||
    typeof proxy['laissezPasser'] !== 'string' ||
    !entier(vue?.['largeur'], 200, 2000) ||
    !entier(vue['hauteur'], 200, 4000) ||
    !entier(d['delaiMs'], 1000, 600_000)
  ) {
    throw new Error('demande de capture invalide');
  }
  if (!/^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(proxy['serveur'])) throw new Error('le proxy doit être une adresse IPv4 avec port');
  const mode = d['mode'];
  if (mode !== undefined && mode !== 'connexion' && mode !== 'jeu') throw new Error('demande de capture invalide');
  if ((mode === 'jeu') !== (d['etapes'] !== undefined)) throw new Error('demande de capture invalide');
  let etapes: DemandeCapture['etapes'];
  if (mode === 'jeu') {
    if (!Array.isArray(d['etapes']) || d['etapes'].length < 1 || d['etapes'].length > ETAPES_JEU_MAX) throw new Error('script invalide');
    etapes = d['etapes'].map(lireEtapeJeu);
  }
  // Le compte est exigé pour un essai de connexion, et pour un script qui se connecte ; il est refusé ailleurs.
  const veutCompte = mode === 'connexion' || (etapes?.some((e) => e.verbe === 'connexion') ?? false);
  if (!veutCompte && d['compte'] !== undefined) throw new Error('demande de capture invalide');
  let compte: DemandeCapture['compte'];
  if (veutCompte) {
    const c = d['compte'] as Record<string, unknown> | undefined;
    if (typeof c?.['identifiant'] !== 'string' || typeof c['motDePasse'] !== 'string' || c['identifiant'] === '' || c['motDePasse'] === '' || c['identifiant'].length > 200 || c['motDePasse'].length > 500) {
      throw new Error('demande de connexion invalide');
    }
    compte = { identifiant: c['identifiant'], motDePasse: c['motDePasse'] };
  }
  return {
    ...(compte !== undefined ? { compte } : {}),
    ...(etapes !== undefined ? { etapes } : {}),
    url: d['url'],
    hotes: d['hotes'] as string[],
    proxy: { serveur: proxy['serveur'], laissezPasser: proxy['laissezPasser'] },
    viewport: { largeur: vue['largeur'], hauteur: vue['hauteur'] },
    delaiMs: d['delaiMs'],
  };
}
