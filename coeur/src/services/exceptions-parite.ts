// regie — fichier unique de ce qui est réservé à l'interface (histoire 1.11, AD-1, FR-45).
// Règle : tout ce que l'interface sait faire, l'API et le MCP le savent aussi. Une action ne reste hors de l'API
// qu'ici, avec sa raison ; le test de parité échoue sinon.

import type { ExceptionParite } from './registre.ts';

export const EXCEPTIONS_PARITE: readonly ExceptionParite[] = Object.freeze([
  { action: 'jeton.creer', raison: 'un jeton ne se crée pas avec un jeton : la création exige ta connexion récente à Authentik (AD-15)' },
]);
