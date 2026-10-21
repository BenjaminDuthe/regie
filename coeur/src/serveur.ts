// regie — serveur du cœur.
// fastify sert les fichiers construits d'Astro (dist/client) par @fastify/static,
// puis confie le reste au handler d'Astro en mode middleware, par @fastify/middie.

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import middie from '@fastify/middie';
import fastifyStatic from '@fastify/static';
import { pino, type DestinationStream } from 'pino';
import { env } from './env.ts';
import { Coffre } from './infra/coffre.ts';
import { ErreurDemarrage, demarrerBase, type Contexte } from './infra/demarrage.ts';
import { masqueurProcessus } from './infra/masquage.ts';
import { calculerSante } from './infra/sante.ts';
import { AuditPg } from './infra/audit.ts';
import { EspacesPg } from './infra/espaces.ts';
import { JetonsApiPg } from './infra/jetons.ts';
import { OauthPg } from './infra/oauth.ts';
import { FilePg, ecouterResultats } from './infra/file.ts';
import { MarquesPg } from './infra/marques.ts';
import { ClientOidc } from './infra/oidc.ts';
import { MagasinSessionsPg } from './infra/sessions.ts';
import { enregistrerRoutesAuth } from './auth/routes.ts';
import { enregistrerRoutesApi } from './api/routes.ts';
import { enregistrerRoutesOauth } from './oauth/routes.ts';
import { enregistrerRoutesMcp } from './mcp/routes.ts';
import type { Services } from './auth/services.ts';
import { EXECUTANTS } from './services/executants.ts';
import { Travailleur } from './services/travailleur.ts';

type HandlerAstro = (
  requete: import('node:http').IncomingMessage,
  reponse: import('node:http').ServerResponse,
  suite?: (erreur?: unknown) => void,
  locals?: object,
) => void;

const RACINE_CLIENT = fileURLToPath(new URL('../dist/client/', import.meta.url));
const ENTREE_SERVEUR = new URL('../dist/server/entry.mjs', import.meta.url).href;

/** Services de production : base, coffre et Authentik (si configuré). */
export function construireServices(contexte: Contexte): Services {
  const configure = env.REGIE_OIDC_EMETTEUR !== undefined && env.REGIE_OIDC_CLIENT_ID !== undefined && env.REGIE_URL_PUBLIQUE !== undefined && contexte.secretOidc !== undefined;
  return {
    oidc: configure
      ? new ClientOidc({ emetteur: env.REGIE_OIDC_EMETTEUR!, clientId: env.REGIE_OIDC_CLIENT_ID!, clientSecret: contexte.secretOidc!, urlPublique: env.REGIE_URL_PUBLIQUE! })
      : undefined,
    sessions: new MagasinSessionsPg(contexte.pool),
    marques: new MarquesPg(contexte.pool),
    espaces: new EspacesPg(contexte.pool),
    audit: new AuditPg(contexte.pool),
    coffre: contexte.coffre,
    cleAdresses: contexte.cleAdresses,
    admin: { sub: env.REGIE_ADMIN_SUB, email: env.REGIE_ADMIN_EMAIL },
    urlPublique: env.REGIE_URL_PUBLIQUE,
    jetons: new JetonsApiPg(contexte.pool),
    oauth: new OauthPg(contexte.pool),
    file: new FilePg(contexte.pool),
    maintenant: Date.now,
  };
}

/** Sans base (tests du serveur nu) : aucune session n'existe, personne ne peut se connecter. */
function servicesSansBase(): Services {
  const refus = async () => {
    throw new Error('base indisponible');
  };
  return {
    oidc: undefined,
    sessions: { creer: refus, trouver: async () => undefined, revoquer: async () => false, changerEspace: async () => false },
    marques: { trouverUnique: async () => ({ etat: 'aucune' }), creer: refus, lister: async () => [] },
    espaces: { assurer: refus, lister: async () => [] },
    audit: { ajouter: refus, lire: refus },
    coffre: new Coffre(randomBytes(32)),
    cleAdresses: randomBytes(32),
    admin: { sub: undefined, email: undefined },
    urlPublique: undefined,
    jetons: { creer: refus, lister: async () => [], revoquer: async () => false, authentifier: async () => undefined },
    oauth: {
      enregistrerClient: refus,
      trouverClient: async () => undefined,
      emettreCode: refus,
      consommerCode: async () => undefined,
      ouvrirConnexion: refus,
      rafraichir: async () => ({ etat: 'invalide' }),
      authentifierAcces: async () => undefined,
      lister: async () => [],
      revoquer: async () => false,
    },
    file: {
      enfiler: refus,
      prendre: async () => undefined,
      renouveler: async () => false,
      terminer: async () => false,
      echouer: async () => undefined,
      pointDeNonRetour: async () => false,
      recuperer: async () => 0,
      appliquerResultats: async () => 0,
      lire: async () => undefined,
      lister: async () => [],
      historique: async () => [],
      annuler: async () => false,
      geler: async () => false,
      degeler: async () => false,
      relancer: async () => false,
    },
    maintenant: Date.now,
  };
}

/**
 * `journal` : destination des journaux (tests) ; `services` : remplace ceux de production (tests) ;
 * `surRoute` : appelée pour chaque route fastify déclarée (test des routes publiques) ;
 * `proxysDeConfiance` : remplace REGIE_PROXYS_DE_CONFIANCE (tests).
 */
export async function construireServeur(
  options: { journal?: DestinationStream; contexte?: Contexte; services?: Services; surRoute?: (route: { method: string | string[]; url: string }) => void; proxysDeConfiance?: readonly string[] } = {},
) {
  // Le handler d'Astro n'existe qu'après `astro build` : on le charge à l'exécution.
  const { handler } = (await import(ENTREE_SERVEUR)) as { handler: HandlerAstro };

  const niveau = options.journal !== undefined ? 'info' : env.NODE_ENV === 'test' ? 'silent' : 'info';
  const reglages = {
    level: niveau,
    // Les secrets connus (clé maîtresse, mots de passe) et les clés sensibles sont masqués à chaque ligne (AR-11).
    ...masqueurProcessus.optionsPino,
    // Méthode et URL seulement : ni adresse IP, ni port, ni nom d'hôte du client (donnée personnelle).
    serializers: { req: (requete: { method: string; url: string }) => ({ method: requete.method, url: requete.url }) },
  };
  const journal = options.journal !== undefined ? pino(reglages, options.journal) : pino(reglages);
  const services = options.services ?? (options.contexte !== undefined ? construireServices(options.contexte) : servicesSansBase());
  // Sans proxy de confiance listé, `requete.ip` est l'adresse de la connexion : X-Forwarded-For est ignoré.
  const proxys = options.proxysDeConfiance ?? env.REGIE_PROXYS_DE_CONFIANCE ?? [];
  const app = Fastify({ loggerInstance: journal, trustProxy: proxys.length > 0 ? [...proxys] : false });
  if (options.surRoute !== undefined) {
    const surRoute = options.surRoute;
    app.addHook('onRoute', (route) => surRoute({ method: route.method, url: route.url }));
  }
  // /sante : sans authentification, donc rien d'un utilisateur ni de détaillé (AR-24).
  app.get('/sante', async (_requete, reponse) => {
    const sante = await calculerSante(options.contexte, '/');
    return reponse.header('cache-control', 'no-store').code(sante.etat === 'ok' ? 200 : 503).send(sante);
  });
  // Le type de l'instance dépend du journal choisi ; les routes n'en ont pas besoin.
  enregistrerRoutesAuth(app as unknown as FastifyInstance, services);
  enregistrerRoutesApi(app as unknown as FastifyInstance, services);
  enregistrerRoutesOauth(app as unknown as FastifyInstance, services);
  enregistrerRoutesMcp(app as unknown as FastifyInstance, services);
  await app.register(fastifyStatic, { root: RACINE_CLIENT });
  await app.register(middie);
  // Les services passent au middleware d'Astro (la garde de session) par `locals`.
  app.use((requete: import('node:http').IncomingMessage, reponse: import('node:http').ServerResponse, suite: (erreur?: unknown) => void) =>
    handler(requete, reponse, suite, { regie: services }),
  );
  return app;
}

if (import.meta.main) {
  // Ordre du socle : environnement (env.ts) → clé et coffre → base → migrations → façades → Astro.
  let contexte: Contexte;
  try {
    contexte = await demarrerBase(env);
  } catch (erreur) {
    if (erreur instanceof ErreurDemarrage) {
      process.stderr.write(`regie refuse de démarrer (${erreur.etape}). ${masqueurProcessus.masquerTexte(erreur.message)}\n`);
      process.exit(1);
    }
    throw erreur;
  }
  const services = construireServices(contexte);
  const app = await construireServeur({ contexte, services });
  // Ordre de démarrage (AR-15) : le serveur écoute, puis la file (application des résultats laissés par un arrêt, puis
  // reprise et prise des tâches). Le planificateur d'échéances viendra en dernier (histoire 2.2).
  const travailleur = new Travailleur({
    file: services.file,
    marques: () => services.marques.lister(),
    executants: EXECUTANTS,
    service: `coeur-${process.pid}`,
    journal: app.log,
  });
  let arreterEcoute: () => void = () => undefined;
  // Arrêt propre : en PID 1 du conteneur, node n'a pas de gestionnaire de SIGTERM par défaut.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      travailleur.arreter();
      arreterEcoute();
      Promise.all([app.close(), contexte.fermer()]).then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }
  await app.listen({ host: env.HOTE, port: env.PORT });
  arreterEcoute = ecouterResultats(contexte.pool, () => travailleur.surNotification(), (message) => app.log.warn({ erreur: message }, 'écoute de la file interrompue'));
  await travailleur.demarrer();
}
