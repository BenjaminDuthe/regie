// regie — middleware d'Astro : la garde de session (histoire 1.14). La logique est dans garde.ts.

import { defineMiddleware } from 'astro:middleware';
import { decider } from './garde.ts';

export const onRequest = defineMiddleware(async (contexte, suite) => {
  // Anti-CSRF des formulaires de l'interface : tout envoi (POST…) doit venir de l'adresse publique de regie.
  const methode = contexte.request.method;
  if (methode !== 'GET' && methode !== 'HEAD' && methode !== 'OPTIONS') {
    const urlPublique = contexte.locals.regie?.urlPublique;
    const attendue = urlPublique === undefined ? undefined : new URL(urlPublique).origin;
    if (attendue === undefined || contexte.request.headers.get('origin') !== attendue) return new Response(null, { status: 403 });
  }
  const decision = await decider(
    { chemin: contexte.url.pathname, recherche: contexte.url.search, cookie: contexte.request.headers.get('cookie') },
    contexte.locals.regie?.sessions,
  );
  if (decision.redirection !== undefined) return contexte.redirect(decision.redirection, 302);
  contexte.locals.session = decision.session;
  const session = decision.session;
  const espaces = session === undefined ? [] : ((await contexte.locals.regie?.espaces.lister(session.marqueId, session.sub)) ?? []);
  contexte.locals.espaces = espaces;
  contexte.locals.espaceActif = espaces.find((e) => e.id === session?.espaceActifId) ?? espaces.find((e) => e.genre === 'personnel');
  const reponse = await suite();
  // Une page vue par une personne connectée ne se garde ni en cache partagé ni dans l'historique des proxys.
  if (decision.session !== undefined && !reponse.headers.has('cache-control')) reponse.headers.set('cache-control', 'private, no-store');
  return reponse;
});
