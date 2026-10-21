// regie — routes fastify de la connexion et des entrées publiques à jeton (histoire 1.14).
// GET /connexion, GET /connexion/retour, POST /deconnexion, /mcp (Bearer), GET /v/* (adresse signée).
// Elles sont déclarées dans routes-publiques.ts, sauf /deconnexion qui contrôle la session elle-même.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { retourSur } from '../routes-publiques.ts';
import { verifierAdresse } from './adresses-signees.ts';
import { COOKIE_FLUX, COOKIE_SESSION, lireCookie } from './cookies.ts';
import { ErreurConnexion, deconnecter, demarrerConnexion, terminerConnexion, type Motif } from './connexion.ts';
import type { Services } from './services.ts';

const vers = (reponse: FastifyReply, location: string, cookies: readonly string[] = []) => {
  reponse.header('cache-control', 'no-store');
  if (cookies.length > 0) reponse.header('set-cookie', [...cookies]);
  return reponse.redirect(location, 303);
};

const versMessage = (reponse: FastifyReply, motif: Motif, cookies: readonly string[] = []) =>
  vers(reponse, `/connexion/message?motif=${motif}`, cookies);

const texte = (valeur: unknown): string | undefined => (typeof valeur === 'string' ? valeur : undefined);

/** Origine attendue des formulaires : celle de l'adresse publique. */
function origineAttendue(services: Services): string | undefined {
  return services.urlPublique === undefined ? undefined : new URL(services.urlPublique).origin;
}

export function enregistrerRoutesAuth(app: FastifyInstance, services: Services): void {
  // Le formulaire de déconnexion est en application/x-www-form-urlencoded ; son contenu n'a aucun usage.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 2048 }, (_requete, _corps, fin) => fin(null, {}));

  app.get('/connexion', async (requete, reponse) => {
    const requeteQuery = requete.query as Record<string, unknown>;
    const retour = retourSur(texte(requeteQuery['retour']));
    const recente = requeteQuery['recente'] === '1';
    // Déjà connecté et rien de sensible à confirmer : retour direct, sans repasser par Authentik.
    const valeur = lireCookie(requete.headers.cookie, COOKIE_SESSION);
    if (!recente && valeur !== undefined && (await services.sessions.trouver(valeur)) !== undefined) return vers(reponse, retour);
    try {
      const debut = await demarrerConnexion(services, { retour, recente });
      return vers(reponse, debut.location, debut.cookies);
    } catch (erreur) {
      if (erreur instanceof ErreurConnexion) return versMessage(reponse, erreur.motif);
      throw erreur;
    }
  });

  app.get('/connexion/retour', async (requete, reponse) => {
    const q = requete.query as Record<string, unknown>;
    const resultat = await terminerConnexion(services, {
      code: texte(q['code']),
      state: texte(q['state']),
      erreur: texte(q['error']),
      cookieFlux: lireCookie(requete.headers.cookie, COOKIE_FLUX),
      cookieSession: lireCookie(requete.headers.cookie, COOKIE_SESSION),
    });
    return resultat.ok ? vers(reponse, resultat.location, resultat.cookies) : versMessage(reponse, resultat.motif, resultat.cookies);
  });

  // Anti-CSRF : cookie SameSite=Lax (jamais envoyé sur un POST venu d'ailleurs) ET Origin vérifiée.
  app.post('/deconnexion', async (requete, reponse) => {
    const attendue = origineAttendue(services);
    if (attendue === undefined || requete.headers.origin !== attendue) return reponse.code(403).send({ erreur: 'origine_refusee' });
    const valeur = lireCookie(requete.headers.cookie, COOKIE_SESSION);
    if (valeur === undefined || (await services.sessions.trouver(valeur)) === undefined) return reponse.code(401).send({ erreur: 'session_requise' });
    const fin = await deconnecter(services, valeur);
    return vers(reponse, fin.location, fin.cookies);
  });

  // Changer d'espace actif : un POST sans corps (l'espace est dans l'adresse), anti-CSRF comme la déconnexion.
  app.post('/espaces/:id/activer', async (requete, reponse) => {
    const attendue = origineAttendue(services);
    if (attendue === undefined || requete.headers.origin !== attendue) return reponse.code(403).send({ erreur: 'origine_refusee' });
    const valeur = lireCookie(requete.headers.cookie, COOKIE_SESSION);
    const session = valeur === undefined ? undefined : await services.sessions.trouver(valeur);
    if (valeur === undefined || session === undefined) return reponse.code(401).send({ erreur: 'session_requise' });
    const id = (requete.params as { id: string }).id;
    // Seuls les espaces de la personne sont visibles (RLS) : un autre identifiant ne se distingue pas d'un inexistant.
    const espaces = await services.espaces.lister(session.marqueId, session.sub);
    if (!espaces.some((espace) => espace.id === id)) return reponse.code(404).send({ erreur: 'espace_introuvable' });
    await services.sessions.changerEspace(valeur, id);
    await services.audit.ajouter(session.marqueId, { acteur: session.sub, action: 'espace_change', objet: `espace:${id}`, details: { origine: 'interface' } });
    return vers(reponse, retourSur(texte((requete.query as Record<string, unknown>)['retour'])));
  });

  // Point d'entrée MCP : jeton Bearer (OAuth 2.1) à la place de la session. Le protocole arrive avec 1.11 et 1.12 ;
  // ici, seulement le refus sans jeton valide.
  app.all('/mcp', async (requete, reponse) => {
    const entete = requete.headers.authorization ?? '';
    const jeton = /^Bearer ([\x21-\x7e]{8,512})$/.exec(entete)?.[1];
    if (jeton === undefined || !(await services.verifierJetonMcp(jeton))) {
      return reponse.header('www-authenticate', 'Bearer realm="regie"').header('cache-control', 'no-store').code(401).send({ erreur: 'jeton_requis' });
    }
    return reponse.code(501).send({ erreur: 'mcp_non_disponible' });
  });

  // Adresses signées lues par les réseaux : signature valide et moins d'une heure. Les fichiers eux-mêmes
  // sont servis à partir des histoires de publication ; une adresse valide ne rend donc pour l'instant que 404.
  app.get('/v/*', async (requete, reponse) => {
    const params = requete.params as { '*'?: string };
    const q = requete.query as Record<string, unknown>;
    const resultat = verifierAdresse(services.cleAdresses, `/v/${params['*'] ?? ''}`, texte(q['e']), texte(q['s']), services.maintenant());
    reponse.header('cache-control', 'no-store');
    if (resultat !== 'valide') return reponse.code(403).send({ erreur: 'adresse_refusee' });
    return reponse.code(404).send({ erreur: 'introuvable' });
  });
}
