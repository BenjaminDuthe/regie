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
    '--disable-features=DnsOverHttps,AsyncDns,WebRtcHideLocalIpsWithMdns,NetworkServiceSandbox',
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

/** Options du contexte de navigation : pas de téléchargement, pas de service worker, pas de permission. */
export function optionsContexte(viewport: Readonly<{ largeur: number; hauteur: number }>) {
  return {
    viewport: { width: viewport.largeur, height: viewport.hauteur },
    acceptDownloads: false,
    serviceWorkers: 'block',
    permissions: [],
    bypassCSP: false,
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
  } as const;
}
