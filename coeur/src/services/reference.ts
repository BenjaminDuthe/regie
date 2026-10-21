// regie — référence de l'API et des outils MCP, générée depuis le registre (histoire 1.11, AD-1).
// docs/api/reference.md n'est jamais écrite à la main : `npm run api:reference -w coeur` la régénère, et un test
// échoue si elle dérive du registre. Chaque changement visible va aussi dans docs/api/CHANGELOG-API.md.

import { z } from 'zod';
import { actionsExposees } from './parite.ts';
import { PARCOURS, type Parcours } from './parcours.ts';
import { nomAction, nomOutil, type Action, type ExceptionParite } from './registre.ts';

function sectionParcours(parcours: readonly Parcours[]): string[] {
  return [
    '# Parcours de référence',
    '',
    'Chaque parcours part d’une demande en une phrase et donne les outils MCP qui y répondent, dans l’ordre, avec une entrée d’exemple',
    '(identifiants fictifs). Un test vérifie que chaque outil existe et que chaque exemple passe son schéma.',
    '',
    ...parcours.flatMap((p) => [
      `## Parcours : ${p.titre}`,
      '',
      `Demande : « ${p.demande} »`,
      '',
      ...p.etapes.flatMap((e, i) => [`${i + 1}. \`${e.outil}\` : ${e.but}`, '', '```json', JSON.stringify(e.exemple, null, 2), '```', '']),
    ]),
  ];
}

export function genererReference(actions: readonly Action<any, any>[], exceptions: readonly ExceptionParite[], parcours: readonly Parcours[] = PARCOURS): string {
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
    ...sectionParcours(parcours),
  ].join('\n');
}
