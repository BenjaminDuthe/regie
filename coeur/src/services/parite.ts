// regie — parité interface / API / MCP (histoire 1.11, AD-1) : une seule liste d'actions exposées.

import { nomAction, type Action, type ExceptionParite } from './registre.ts';

/**
 * Les actions offertes à une porte, `api` par défaut : toutes, sauf les exceptions déclarées. Une action réservée au
 * MCP (`seulement: 'mcp'`) n'est offerte qu'à la porte `mcp` ; une action réservée à l'interface n'est offerte à aucune.
 */
export function actionsExposees(actions: readonly Action<any, any>[], exceptions: readonly ExceptionParite[], porte: 'api' | 'mcp' = 'api'): Action<any, any>[] {
  const reservees = new Set(exceptions.filter((e) => !(porte === 'mcp' && e.seulement === 'mcp')).map((e) => e.action));
  return actions.filter((a) => !reservees.has(nomAction(a)));
}

/**
 * Rend les écarts de parité, vide si tout tient : une exception sans raison ou vers une action inconnue, et
 * toute action qui n'est exposée par aucune porte (ou qui l'est alors qu'elle est une exception).
 */
export function verifierParite(actions: readonly Action<any, any>[], exceptions: readonly ExceptionParite[], exposees: readonly string[]): string[] {
  const ecarts: string[] = [];
  const noms = new Set(actions.map(nomAction));
  const reservees = new Set<string>();
  for (const e of exceptions) {
    if (!noms.has(e.action)) ecarts.push(`exception pour une action inconnue : ${e.action}`);
    if (e.raison.trim().length < 10) ecarts.push(`exception sans raison : ${e.action}`);
    reservees.add(e.action);
  }
  for (const nom of noms) {
    if (!reservees.has(nom) && !exposees.includes(nom)) ecarts.push(`action non exposée et sans exception : ${nom}`);
    if (reservees.has(nom) && exposees.includes(nom)) ecarts.push(`action exposée alors qu'elle est réservée à l'interface : ${nom}`);
  }
  return ecarts;
}
