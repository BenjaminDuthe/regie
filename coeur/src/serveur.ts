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
import { ApplicationsPg } from './infra/applications.ts';
import { ScriptsPg } from './infra/scripts.ts';
import { ComptesDemoPg } from './infra/comptes-demo.ts';
import { creerExecutantJeuScript } from './services/jeu-script.ts';
import { JournauxJeu } from './services/journaux-jeu.ts';
import { GabaritsPg } from './infra/gabarits.ts';
import { JetonsApiPg } from './infra/jetons.ts';
import { NotificationsPg } from './infra/notifications.ts';
import { OauthPg } from './infra/oauth.ts';
import { FilePg, ecouterResultats } from './infra/file.ts';
import { MarquesPg } from './infra/marques.ts';
import { ClientOidc } from './infra/oidc.ts';
import { MagasinSessionsPg } from './infra/sessions.ts';
import { enregistrerRoutesAuth } from './auth/routes.ts';
import { enregistrerRoutesApi } from './api/routes.ts';
import { enregistrerRoutesOauth } from './oauth/routes.ts';
import { creerExecutantExploration } from './services/exploration.ts';
import { enregistrerRoutesMcp } from './mcp/routes.ts';
import { enregistrerRoutesFlux, type OptionsFlux } from './flux/routes.ts';
import type { Services } from './auth/services.ts';
import { EXECUTANTS } from './services/executants.ts';
import { creerExecutantCapture, LanceurPodman, RESEAU_CAPTURE } from './services/capture.ts';
import { creerExecutantTestConnexion } from './services/test-connexion.ts';
import { PasserelleSecretsCoffre, lecteurCoffre } from './services/passerelle-secrets.ts';
import { Travailleur } from './services/travailleur.ts';
import { EcheancesPg } from './infra/echeances.ts';
import { Planificateur } from './services/planificateur.ts';
import { gestionnairesDuSocle } from './services/gestionnaires.ts';

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
    notifications: new NotificationsPg(contexte.pool),
    gabarits: new GabaritsPg(contexte.pool),
    applications: new ApplicationsPg(contexte.pool),
    scripts: new ScriptsPg(contexte.pool),
    comptesDemo: new ComptesDemoPg(contexte.pool, contexte.coffre),
    journauxJeu: new JournauxJeu(),
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
      instantane: async () => [],
      durees: async () => ({}),
    },
    notifications: { creer: refus, lister: async () => [], acquitter: async () => false },
    gabarits: { lister: async () => [], lire: async () => undefined, creer: refus, remplacer: refus },
    applications: { lister: async () => [], lire: async () => undefined, creer: refus, remplacer: refus },
    scripts: { lister: async () => [], lire: async () => undefined, creer: refus, remplacer: refus, enregistrerJeu: refus },
    journauxJeu: new JournauxJeu(),
    comptesDemo: { remplacer: refus, etat: async () => ({ depose: false, modifieLe: undefined }) },
    maintenant: Date.now,
  };
}

/**
 * `journal` : destination des journaux (tests) ; `services` : remplace ceux de production (tests) ;
 * `surRoute` : appelée pour chaque route fastify déclarée (test des routes publiques) ;
 * `proxysDeConfiance` : remplace REGIE_PROXYS_DE_CONFIANCE (tests) ; `flux` : rythme du suivi en direct (tests).
 */
export async function construireServeur(
  options: { journal?: DestinationStream; contexte?: Contexte; services?: Services; surRoute?: (route: { method: string | string[]; url: string }) => void; proxysDeConfiance?: readonly string[]; flux?: OptionsFlux } = {},
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
  enregistrerRoutesFlux(app as unknown as FastifyInstance, services, options.flux);
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
  // reprise et prise des tâches). Le planificateur d'échéances vient en dernier (histoire 2.2).
  const nomService = `coeur-${process.pid}`;
  const travailleur = new Travailleur({
    file: services.file,
    marques: () => services.marques.lister(),
    executants: {
      ...EXECUTANTS,
      ...(env.REGIE_CAPTURE_SOCKET !== undefined && contexte.cleCapture !== undefined
        ? (() => {
            const lanceur = new LanceurPodman({ socket: env.REGIE_CAPTURE_SOCKET, image: env.REGIE_CAPTURE_IMAGE, reseau: RESEAU_CAPTURE });
            const passerelle = new PasserelleSecretsCoffre({ file: services.file, service: nomService, lecteur: lecteurCoffre(contexte.pool, contexte.coffre) });
            return {
              jeu_script: creerExecutantJeuScript({ applications: services.applications, scripts: services.scripts, passerelle, lanceur, journaux: services.journauxJeu, cle: contexte.cleCapture, proxy: env.REGIE_CAPTURE_PROXY }),
              exploration: creerExecutantExploration({ applications: services.applications, lanceur, cle: contexte.cleCapture, proxy: env.REGIE_CAPTURE_PROXY }),
              capture: creerExecutantCapture({ applications: services.applications, lanceur, cle: contexte.cleCapture, proxy: env.REGIE_CAPTURE_PROXY }),
              test_connexion: creerExecutantTestConnexion({
                applications: services.applications,
                passerelle,
                lanceur,
                cle: contexte.cleCapture,
                proxy: env.REGIE_CAPTURE_PROXY,
              }),
            };
          })()
        : {}),
    },
    service: nomService,
    journal: app.log,
  });
  const planificateur = new Planificateur({
    echeances: new EcheancesPg(contexte.pool),
    marques: () => services.marques.lister(),
    gestionnaires: gestionnairesDuSocle({ pool: contexte.pool, audit: services.audit, journal: app.log, alerte: { notifications: services.notifications, adminSub: services.admin.sub } }),
    journal: app.log,
  });
  let arreterEcoute: () => void = () => undefined;
  // Arrêt propre : en PID 1 du conteneur, node n'a pas de gestionnaire de SIGTERM par défaut.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      planificateur.arreter();
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
  // Le planificateur prend place en dernier (AR-3) : tout ce qu'il déclenche trouve la file prête.
  await planificateur.demarrer();
}
