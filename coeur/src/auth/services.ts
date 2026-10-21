// regie — services de la connexion, injectés (histoire 1.14) : en production ils viennent de la base et d'Authentik,
// dans les tests de fausses implémentations en mémoire.

import type { Audit } from '../infra/audit.ts';
import type { Coffre } from '../infra/coffre.ts';
import type { Espaces } from '../infra/espaces.ts';
import type { JetonsApi } from '../infra/jetons.ts';
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
  maintenant: () => number;
}>;
