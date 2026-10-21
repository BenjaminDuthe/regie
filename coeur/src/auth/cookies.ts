// regie — cookies de la connexion (histoire 1.14).
// `__Host-` impose Secure, Path=/ et aucun Domain : le cookie ne peut ni venir d'un sous-domaine ni être étendu.

export const COOKIE_SESSION = '__Host-regie_session';
/** Contexte de la connexion en cours (state, nonce, vérificateur PKCE), scellé par le coffre, valable 10 minutes. */
export const COOKIE_FLUX = '__Host-regie_flux';

/** Contexte du raccordement d'un compte réseau en cours (state lié à la session), scellé par le coffre, valable 10 minutes (histoire 7.6). */
export const COOKIE_FLUX_RESEAU = '__Host-regie_flux_reseau';

export const DUREE_FLUX_S = 600;

/** Valeur de l'en-tête Set-Cookie : HttpOnly, Secure, SameSite=Lax, Path=/, sans Domain. */
export function serialiserCookie(nom: string, valeur: string, maxAgeS: number): string {
  return `${nom}=${valeur}; Max-Age=${maxAgeS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export const effacerCookie = (nom: string): string => serialiserCookie(nom, '', 0);

/** Lit un cookie dans l'en-tête `Cookie` (nos valeurs sont en base64url ou en UUID : rien à décoder). */
export function lireCookie(entete: string | null | undefined, nom: string): string | undefined {
  if (entete === null || entete === undefined) return undefined;
  for (const morceau of entete.split(';')) {
    const egal = morceau.indexOf('=');
    if (egal < 0) continue;
    if (morceau.slice(0, egal).trim() === nom) return morceau.slice(egal + 1).trim();
  }
  return undefined;
}
