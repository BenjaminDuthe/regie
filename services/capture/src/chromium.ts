// regie — réglages de Chromium dans le conteneur de capture (histoire 4.2, AD-10). Le navigateur ne joint QUE le proxy
// de sortie : WebRTC ne sort pas en UDP direct, QUIC et DNS-sur-HTTPS sont coupés, aucun nom n'est résolu localement
// (le proxy résout et valide), les téléchargements sont refusés. Le bac à sable de Chromium reste actif : ni
// `--no-sandbox` ni `--disable-setuid-sandbox`, jamais (un test le vérifie).

export type ReglagesProxy = Readonly<{
  /** adresse http du proxy de sortie (une adresse, pas un nom : le réseau du conteneur n'a pas de DNS). */
  serveur: string;
  laissezPasser: string;
}>;

/** Arguments de lancement de Chromium (hors proxy, passé par Playwright avec son authentification). */
export function argumentsChromium(): string[] {
  return [
    '--disable-quic',
    '--disable-features=DnsOverHttps,AsyncDns',
    '--dns-over-https-mode=off',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--webrtc-ip-handling-policy=disable_non_proxied_udp',
    // Aucun nom n'est résolu par le navigateur : toute résolution passe par le proxy.
    '--host-resolver-rules=MAP * ~NOTFOUND',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
  ];
}

/** Lève si les arguments désactivent le bac à sable. */
export function exigerBacASableActif(args: readonly string[]): void {
  const interdit = args.find((a) => /^--(no-sandbox|disable-setuid-sandbox|disable-gpu-sandbox|disable-seccomp-filter-sandbox|disable-namespace-sandbox)\b/.test(a));
  if (interdit !== undefined) throw new Error(`bac à sable de Chromium désactivé par ${interdit}`);
  // Une fonctionnalité de bac à sable ne se désactive pas non plus (--disable-features=NetworkServiceSandbox, etc.).
  const fonction = args.find((a) => /^--disable-features=/i.test(a) && /sandbox/i.test(a));
  if (fonction !== undefined) throw new Error(`bac à sable de Chromium désactivé par ${fonction}`);
  if (args.some((a) => /^--no-sandbox/i.test(a))) throw new Error('bac à sable de Chromium désactivé par --no-sandbox');
}

/** Options de lancement Playwright : bac à sable demandé explicitement (Playwright ajoute sinon --no-sandbox). */
export function optionsLancement(proxy: ReglagesProxy) {
  const args = argumentsChromium();
  exigerBacASableActif(args);
  return {
    headless: true,
    chromiumSandbox: true,
    args,
    proxy: { server: proxy.serveur, username: 'capture', password: proxy.laissezPasser },
  } as const;
}

/** Dossier du film dans le conteneur : le seul endroit où l'on écrit (tmpfs, détruit avec le conteneur). */
export const DOSSIER_FILM = '/tmp/film';
/** Format de tournage : vertical 1080 x 1920 (histoire 4.5). */
export const FORMAT_FILM = Object.freeze({ width: 1080, height: 1920 });

/**
 * Options du contexte de navigation : pas de téléchargement, pas de service worker, pas de permission.
 * `film` : enregistre la vidéo verticale de la session (jeu d'un script, histoire 4.5).
 */
export function optionsContexte(viewport: Readonly<{ largeur: number; hauteur: number }>, film = false) {
  return {
    viewport: { width: viewport.largeur, height: viewport.hauteur },
    acceptDownloads: false,
    serviceWorkers: 'block',
    permissions: [],
    bypassCSP: false,
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    ...(film ? { recordVideo: { dir: DOSSIER_FILM, size: FORMAT_FILM } } : {}),
  } as const;
}
