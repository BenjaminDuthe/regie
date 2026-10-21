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
  // Commit en service, posé à la construction de l'image : chaque page renvoie vers son code
  // source (FR-67, AGPL-3.0). Absent en développement : le lien mène alors à `main`.
  REGIE_VERSION: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/, 'doit être une empreinte de commit (7 à 40 caractères hexadécimaux)')
    .optional(),
  // Dossier des secrets montés en fichiers (secrets Podman : /run/secrets). Jamais de secret dans
  // l'environnement lui-même : ici, seulement l'emplacement des fichiers (AD-9, NFR-14).
  DOSSIER_SECRETS: z.string().min(1, 'doit être un chemin non vide').default('/run/secrets'),
  BASE_HOTE: z.string().min(1, 'doit être une adresse non vide').default('127.0.0.1'),
  BASE_PORT: z
    .string()
    .regex(/^\d{1,5}$/, 'doit être un entier entre 1 et 65535')
    .default('5432')
    .transform(Number)
    .refine((port) => port >= 1 && port <= 65535, 'doit être un entier entre 1 et 65535'),
  BASE_NOM: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/, 'doit être un nom PostgreSQL simple').default('regie'),
  BASE_UTILISATEUR: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/, 'doit être un nom de rôle simple').default('regie_coeur'),
  BASE_MIGRATIONS_UTILISATEUR: z
    .string()
    .regex(/^[a-z_][a-z0-9_]{0,62}$/, 'doit être un nom de rôle simple')
    .default('regie_migrations'),
  // Connexion par Authentik (histoire 1.14). Les trois premières vont ensemble ; le secret du client OIDC est
  // un fichier de DOSSIER_SECRETS (regie_oidc_client), jamais une variable. Sans elles, personne ne peut se connecter.
  REGIE_URL_PUBLIQUE: z.url({ message: 'doit être une adresse https (http seulement sur la machine locale)' }).optional(),
  REGIE_OIDC_EMETTEUR: z.url({ message: 'doit être l’émetteur OIDC d’Authentik (https)' }).optional(),
  REGIE_OIDC_CLIENT_ID: z.string().regex(/^[\w.-]{1,128}$/, 'doit être l’identifiant du client OIDC').optional(),
  // L'utilisateur Authentik autorisé : son `sub`, ou son e-mail (vérifié par Authentik). L'un des deux suffit.
  REGIE_ADMIN_SUB: z.string().min(1).max(255).optional(),
  REGIE_ADMIN_EMAIL: z.email('doit être une adresse e-mail').optional(),
}).superRefine((valeurs, contexte) => {
  const adresseSure = (valeur: string) => {
    const url = new URL(valeur);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  };
  for (const variable of ['REGIE_URL_PUBLIQUE', 'REGIE_OIDC_EMETTEUR'] as const) {
    const valeur = valeurs[variable];
    if (valeur !== undefined && !adresseSure(valeur)) {
      contexte.addIssue({ code: 'custom', path: [variable], message: 'doit être une adresse https (http seulement sur la machine locale)' });
    }
  }
  const oidc = ['REGIE_URL_PUBLIQUE', 'REGIE_OIDC_EMETTEUR', 'REGIE_OIDC_CLIENT_ID'] as const;
  const poses = oidc.filter((variable) => valeurs[variable] !== undefined);
  if (poses.length > 0 && poses.length < oidc.length) {
    for (const variable of oidc.filter((v) => valeurs[v] === undefined)) {
      contexte.addIssue({ code: 'custom', path: [variable], message: 'requise dès qu’une autre variable de la connexion Authentik est posée' });
    }
  }
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
    // Vide quand l'image est construite sans --build-arg : même sens qu'absente.
    REGIE_VERSION: source['REGIE_VERSION'] || undefined,
    DOSSIER_SECRETS: source['DOSSIER_SECRETS'],
    BASE_HOTE: source['BASE_HOTE'],
    BASE_PORT: source['BASE_PORT'],
    BASE_NOM: source['BASE_NOM'],
    BASE_UTILISATEUR: source['BASE_UTILISATEUR'],
    BASE_MIGRATIONS_UTILISATEUR: source['BASE_MIGRATIONS_UTILISATEUR'],
    REGIE_URL_PUBLIQUE: source['REGIE_URL_PUBLIQUE'] || undefined,
    REGIE_OIDC_EMETTEUR: source['REGIE_OIDC_EMETTEUR'] || undefined,
    REGIE_OIDC_CLIENT_ID: source['REGIE_OIDC_CLIENT_ID'] || undefined,
    REGIE_ADMIN_SUB: source['REGIE_ADMIN_SUB'] || undefined,
    REGIE_ADMIN_EMAIL: source['REGIE_ADMIN_EMAIL'] || undefined,
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
