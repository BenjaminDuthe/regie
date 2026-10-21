// regie — services de la connexion, injectés (histoire 1.14) : en production ils viennent de la base et d'Authentik,
// dans les tests de fausses implémentations en mémoire.

import type { Applications } from '../infra/applications.ts';
import type { Scripts } from '../infra/scripts.ts';
import type { Audit } from '../infra/audit.ts';
import type { ComptesDemo } from '../infra/comptes-demo.ts';
import type { JournauxJeu } from '../services/journaux-jeu.ts';
import type { Coffre } from '../infra/coffre.ts';
import type { Espaces } from '../infra/espaces.ts';
import type { File } from '../infra/file.ts';
import type { Gabarits } from '../infra/gabarits.ts';
import type { JetonsApi } from '../infra/jetons.ts';
import type { Notifications } from '../infra/notifications.ts';
import type { Oauth } from '../infra/oauth.ts';
import type { Marques } from '../infra/marques.ts';
import type { FournisseurOidc } from '../infra/oidc.ts';
import type { MagasinSessions } from '../infra/sessions.ts';

export type Services = Readonly<{
  /** Absent tant qu'Authentik n'est pas configuré : personne ne peut alors se connecter. */
  oidc: FournisseurOidc | undefined;
  sessions: MagasinSessions;
  marques: Marques;
  espaces: Espaces;
  audit: Audit;
  /** Scelle le contexte de la connexion en cours (cookie de flux). */
  coffre: Coffre;
  /** Sous-clé « hmac-adresses » : signature des adresses /v/*. */
  cleAdresses: Buffer;
  /** L'utilisateur Authentik autorisé : son `sub`, ou son e-mail vérifié. */
  admin: Readonly<{ sub: string | undefined; email: string | undefined }>;
  /** Adresse publique de regie ; sert à vérifier l'Origin des formulaires. */
  urlPublique: string | undefined;
  /** Jetons d'API personnels : Bearer de l'API privée et du point d'entrée /mcp (histoire 1.11). */
  jetons: JetonsApi;
  /** Clients, codes et connexions OAuth de Claude (histoire 1.12). */
  oauth: Oauth;
  /** File de traitement durable (histoire 2.1). */
  file: File;
  /** Notifications d'interface : étape en échec, journal rompu (histoire 2.6). */
  notifications: Notifications;
  /** Gabarits des espaces (histoires 2.7 et 2.8). */
  gabarits: Gabarits;
  /** Applications à filmer et leurs hôtes autorisés (histoire 4.1). */
  applications: Applications;
  /** Scripts de démo de chaque application (histoire 4.4). */
  scripts: Scripts;
  /** Compte de démonstration de chaque application, au coffre (histoire 4.3). */
  comptesDemo: ComptesDemo;
  /** Journaux de jeu en direct (histoire 4.5), en mémoire. */
  journauxJeu: JournauxJeu;
  maintenant: () => number;
}>;
