// regie — référence de l'API et des outils MCP, générée depuis le registre (histoire 1.11, AD-1).
// docs/api/reference.md n'est jamais écrite à la main : `npm run api:reference -w coeur` la régénère, et un test
// échoue si elle dérive du registre. Chaque changement visible va aussi dans docs/api/CHANGELOG-API.md.

import { z } from 'zod';
import { actionsExposees } from './parite.ts';
import { nomAction, nomOutil, type Action, type ExceptionParite } from './registre.ts';

export function genererReference(actions: readonly Action<any, any>[], exceptions: readonly ExceptionParite[]): string {
  const exposees = new Set(actionsExposees(actions, exceptions).map(nomAction));
  const mcpSeul = new Set(exceptions.filter((e) => e.seulement === 'mcp').map((e) => e.action));
  const sections = actions.map((a) => {
    const schema = JSON.stringify(z.toJSONSchema(a.entree, { io: 'input', target: 'draft-2020-12' }), null, 2);
    const raison = exceptions.find((e) => e.action === nomAction(a))?.raison;
    return [
      `## \`${nomAction(a)}\``,
      '',
      a.description,
      '',
      mcpSeul.has(nomAction(a))
        ? `- Outil MCP seulement : \`${nomOutil(a)}\` (ni API ni interface) : ${raison}`
        : exposees.has(nomAction(a))
        ? `- API : \`POST /api/v1/${a.domaine}/${a.verbe}\` · outil MCP : \`${nomOutil(a)}\``
        : `- Réservée à l'interface : ${raison}`,
      `- Portée requise : \`${a.portee}\``,
      '',
      'Corps de la demande (schéma JSON) :',
      '',
      '```json',
      schema,
      '```',
      '',
    ].join('\n');
  });
  return [
    '# Référence de l’API privée et des outils MCP',
    '',
    '<!-- Générée par `npm run api:reference -w coeur` : ne pas modifier à la main. -->',
    '',
    'Toutes les demandes portent `Authorization: Bearer <jeton>` et un corps JSON. Réponse : `{ "ok": true, "donnees": … }`',
    'ou `{ "ok": false, "erreur": { "code", "message", "contexte" } }`. Statuts : 400, 401, 403, 404, 409, 422.',
    'Chaque action est écrite au journal d’audit de la marque, avec son origine (`api` ou `mcp`).',
    '',
    ...sections,
  ].join('\n');
}
