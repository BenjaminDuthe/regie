// regie — authentification par jeton Bearer (histoire 1.11) : l'API privée et /mcp.
// Aujourd'hui un jeton d'API personnel ; les jetons OAuth de Claude s'y ajoutent avec l'histoire 1.12.

import type { Principal } from '../infra/jetons.ts';
import type { Services } from './services.ts';

/** Extrait le jeton d'un en-tête `Authorization: Bearer …` (forme stricte : caractères imprimables, 8 à 512). */
export function extraireBearer(entete: string | undefined): string | undefined {
  return /^Bearer ([\x21-\x7e]{8,512})$/.exec(entete ?? '')?.[1];
}

export async function authentifierBearer(services: Services, entete: string | undefined): Promise<Principal | undefined> {
  const jeton = extraireBearer(entete);
  return jeton === undefined ? undefined : services.jetons.authentifier(jeton);
}
