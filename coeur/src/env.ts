// regie — seul lecteur de l'environnement (AR-5).
// Toute autre lecture de l'environnement fait échouer la CI (outils/ci/verifier-env.mjs).
// En cas d'erreur, le message nomme la variable fautive sans jamais écrire sa valeur.

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  HOTE: z.string().min(1, 'doit être une adresse non vide').default('127.0.0.1'),
  PORT: z
    .string()
    .regex(/^\d{1,5}$/, 'doit être un entier entre 1 et 65535')
    .default('4321')
    .transform(Number)
    .refine((port) => port >= 1 && port <= 65535, 'doit être un entier entre 1 et 65535'),
});

export type Environnement = Readonly<z.infer<typeof schema>>;

export class ErreurEnvironnement extends Error {
  readonly variables: readonly string[];

  constructor(problemes: readonly { variable: string; message: string }[]) {
    super(
      'Environnement invalide :\n' +
        problemes.map((probleme) => `  ${probleme.variable} : ${probleme.message}`).join('\n'),
    );
    this.name = 'ErreurEnvironnement';
    this.variables = problemes.map((probleme) => probleme.variable);
  }
}

/** Valide une source d'environnement ; lève ErreurEnvironnement sans recopier aucune valeur. */
export function lireEnvironnement(source: Readonly<Record<string, string | undefined>>): Environnement {
  const resultat = schema.safeParse({
    NODE_ENV: source['NODE_ENV'],
    HOTE: source['HOTE'],
    PORT: source['PORT'],
  });
  if (!resultat.success) {
    throw new ErreurEnvironnement(
      resultat.error.issues.map((probleme) => ({
        variable: String(probleme.path[0] ?? '?'),
        // Message du schéma seulement : zod ne recopie pas la valeur reçue dans ces messages.
        message: probleme.code === 'invalid_value' ? 'valeur non autorisée' : probleme.message,
      })),
    );
  }
  return Object.freeze(resultat.data);
}

function charger(): Environnement {
  try {
    return lireEnvironnement(process.env);
  } catch (erreur) {
    if (erreur instanceof ErreurEnvironnement) {
      process.stderr.write(`regie refuse de démarrer. ${erreur.message}\n`);
      process.exit(1);
    }
    throw erreur;
  }
}

export const env: Environnement = charger();
