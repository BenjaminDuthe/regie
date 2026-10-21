// regie — fichier unique des routes publiques (histoire 1.14, FR-72).
// Toute autre route de l'interface exige une session : la garde (middleware Astro) renvoie vers /connexion.
// Le test coeur/test/routes-publiques.test.ts compare cette liste aux pages de coeur/src/pages et aux routes
// de fastify, et échoue sur toute route qui répond sans session sans être déclarée ici.

export type RoutePublique = Readonly<{
  /** Chemin exact, ou préfixe terminé par `/*`. */
  chemin: string;
  raison: string;
}>;

export const ROUTES_PUBLIQUES: readonly RoutePublique[] = Object.freeze([
  { chemin: '/sante', raison: 'état du service, sans donnée d’utilisateur (AR-24)' },
  { chemin: '/connexion', raison: 'début de la connexion : renvoie vers Authentik' },
  { chemin: '/connexion/retour', raison: 'retour d’Authentik, avant toute session' },
  { chemin: '/connexion/message', raison: 'explication d’un refus ou d’une déconnexion, avant toute session' },
  { chemin: '/confidentialite', raison: 'politique de confidentialité, exigée par Meta (FR-51)' },
  { chemin: '/conditions', raison: 'conditions d’utilisation, exigées par Meta (FR-51)' },
  { chemin: '/mcp', raison: 'jeton Bearer OAuth 2.1 à la place de la session (FR-46) ; 401 sans jeton valide' },
  { chemin: '/.well-known/oauth-protected-resource', raison: 'métadonnées de la ressource MCP (RFC 9728) : Claude les lit avant de se connecter' },
  { chemin: '/.well-known/oauth-protected-resource/mcp', raison: 'variante de la précédente propre au chemin /mcp (RFC 9728)' },
  { chemin: '/.well-known/oauth-authorization-server', raison: 'métadonnées du serveur d’autorisation (RFC 8414)' },
  { chemin: '/oauth/register', raison: 'enregistrement dynamique de client (RFC 7591), borné : adresses contrôlées, plafond par marque' },
  { chemin: '/oauth/token', raison: 'échange du code (PKCE S256) ou du jeton de rafraîchissement contre un jeton d’accès : la preuve est dans la requête' },
  { chemin: '/api/v1/:domaine/:verbe', raison: 'API privée : jeton Bearer à la place de la session (FR-45) ; 401 sans jeton valide' },
  { chemin: '/v/*', raison: 'adresses signées lues par les réseaux : signature valide et moins d’une heure (FR-72)' },
]);

/** Fichiers construits de dist/client (favicon, scripts, styles), servis par @fastify/static : aucune donnée d'utilisateur. */
export const ROUTES_STATIQUES: readonly string[] = Object.freeze(['/*']);

/**
 * Routes que fastify sert hors garde et qui contrôlent la session elles-mêmes. Elles ne sont pas publiques :
 * sans session valide elles refusent.
 */
export const ROUTES_AVEC_SESSION_PROPRE: readonly string[] = Object.freeze(['/deconnexion', '/espaces/:id/activer']);

/** Chemin sans barre finale (sauf la racine) : `/conditions/` et `/conditions` sont la même route. */
export function normaliser(chemin: string): string {
  return chemin.length > 1 ? chemin.replace(/\/+$/, '') || '/' : chemin;
}

function correspond(declaration: string, chemin: string): boolean {
  if (declaration.endsWith('/*')) {
    const prefixe = declaration.slice(0, -1);
    return chemin.startsWith(prefixe) && chemin.length > prefixe.length;
  }
  return declaration === chemin;
}

export function estPublique(chemin: string): boolean {
  const propre = normaliser(chemin);
  return ROUTES_PUBLIQUES.some((route) => correspond(route.chemin, propre));
}

/**
 * Chemin de retour après connexion : un chemin relatif de regie, jamais une adresse absolue (redirection
 * ouverte). Tout ce qui ne ressemble pas à `/chemin?requete` donne `/`.
 */
export function retourSur(valeur: string | null | undefined): string {
  if (valeur === null || valeur === undefined || valeur === '' || valeur.length > 1024) return '/';
  // Un seul « / » au début, ni « // » ni « /\ » (interprétés comme « http://… » par les navigateurs), aucun caractère de contrôle.
  if (!valeur.startsWith('/') || valeur.startsWith('//') || valeur.includes('\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(valeur)) return '/';
  let url: URL;
  try {
    url = new URL(valeur, 'file:///');
  } catch {
    return '/';
  }
  if (url.protocol !== 'file:' || url.host !== '') return '/';
  const chemin = normaliser(url.pathname);
  // Revenir sur la connexion elle-même bouclerait.
  if (chemin === '/connexion' || chemin.startsWith('/connexion/')) return '/';
  return `${url.pathname}${url.search}`;
}
