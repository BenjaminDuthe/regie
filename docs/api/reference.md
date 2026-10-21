# Référence de l’API privée et des outils MCP

<!-- Générée par `npm run api:reference -w coeur` : ne pas modifier à la main. -->

Toutes les demandes portent `Authorization: Bearer <jeton>` et un corps JSON. Réponse : `{ "ok": true, "donnees": … }`
ou `{ "ok": false, "erreur": { "code", "message", "contexte" } }`. Statuts : 400, 401, 403, 404, 409, 422.
Chaque action est écrite au journal d’audit de la marque, avec son origine (`api` ou `mcp`).

## `espace.lister`

Liste tes espaces : l’espace personnel et l’espace de la marque.

- API : `POST /api/v1/espace/lister` · outil MCP : `espace_lister`
- Portée requise : `lecture`

Corps de la demande (schéma JSON) :

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

## `jeton.lister`

Liste tes jetons d’API (jamais leur valeur).

- API : `POST /api/v1/jeton/lister` · outil MCP : `jeton_lister`
- Portée requise : `lecture`

Corps de la demande (schéma JSON) :

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

## `jeton.revoquer`

Révoque un de tes jetons d’API : il cesse de fonctionner tout de suite.

- API : `POST /api/v1/jeton/revoquer` · outil MCP : `jeton_revoquer`
- Portée requise : `ecriture`

Corps de la demande (schéma JSON) :

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

## `jeton.creer`

Crée un jeton d’API ; sa valeur n’est rendue qu’une fois. Réservé à l’interface, après une connexion récente.

- Réservée à l'interface : un jeton ne se crée pas avec un jeton : la création exige ta connexion récente à Authentik (AD-15)
- Portée requise : `ecriture`

Corps de la demande (schéma JSON) :

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "nom": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "portees": {
      "minItems": 1,
      "maxItems": 2,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "lecture",
          "ecriture"
        ]
      }
    },
    "espaceIds": {
      "minItems": 1,
      "maxItems": 10,
      "type": "array",
      "items": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      }
    },
    "dureeJours": {
      "type": "integer",
      "minimum": 1,
      "maximum": 90
    }
  },
  "required": [
    "nom",
    "portees",
    "espaceIds",
    "dureeJours"
  ],
  "additionalProperties": false
}
```
