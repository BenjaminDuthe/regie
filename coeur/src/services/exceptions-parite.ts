// regie — fichier unique de ce qui est réservé à l'interface (histoire 1.11, AD-1, FR-45).
// Règle : tout ce que l'interface sait faire, l'API et le MCP le savent aussi. Une action ne reste hors de l'API
// qu'ici, avec sa raison ; le test de parité échoue sinon.

import type { ExceptionParite } from './registre.ts';

export const EXCEPTIONS_PARITE: readonly ExceptionParite[] = Object.freeze([
  { action: 'jeton.creer', raison: 'un jeton ne se crée pas avec un jeton : la création exige ta connexion récente à Authentik (AD-15)' },
  { action: 'compte.deposer', raison: 'un identifiant et un mot de passe ne se saisissent que dans l’interface, après une connexion récente à Authentik : aucun outil ni point d’API ne peut les déposer ni les lire (AD-9)' },
  {
    action: 'script.proposer',
    raison: 'créer un script à partir d’une phrase n’existe que par le MCP : c’est Claude qui écrit les étapes et regie les vérifie (FR-47) ; l’interface et l’API créent un script par script.creer',
    seulement: 'mcp',
  },
]);
