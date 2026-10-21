// regie — authentification par jeton Bearer (histoires 1.11 et 1.12) : l'API privée et /mcp.
// L'API n'accepte que les jetons d'API personnels ; /mcp accepte aussi les jetons d'accès que regie a émis à Claude
// après le consentement OAuth.

import type { Principal } from '../infra/jetons.ts';
import type { Services } from './services.ts';

/** Extrait le jeton d'un en-tête `Authorization: Bearer …` (forme stricte : caractères imprimables, 8 à 512). */
export function extraireBearer(entete: string | undefined): string | undefined {
  return /^Bearer ([\x21-\x7e]{8,512})$/.exec(entete ?? '')?.[1];
}

export async function authentifierBearer(services: Services, entete: string | undefined, options: { oauth?: boolean } = {}): Promise<Principal | undefined> {
  const jeton = extraireBearer(entete);
  if (jeton === undefined) return undefined;
  if (options.oauth === true && jeton.startsWith('regie_oat_')) return services.oauth.authentifierAcces(jeton);
  return services.jetons.authentifier(jeton);
}
