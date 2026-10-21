// Aperçu du gabarit (histoire 2.8) : image SVG dessinée sur le serveur, à partir des champs du formulaire en paramètres.
// Page gardée par la session (middleware) ; rien n'est enregistré ni écrit au journal (arbitrage 2.8). L'équivalent pour
// l'API et le MCP est `gabarit.apercu`. L'image est servie en `<img>` : les scripts d'un SVG n'y sont jamais exécutés.
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { definitionGabarit, normaliser } from '../../domaine/gabarit.ts';
import { apercuSvg } from '../../domaine/apercu.ts';
import { definitionDepuisFormulaire } from '../../services/formulaire-gabarit.ts';

export const GET: APIRoute = ({ locals, url }) => {
  if (locals.regie === undefined || locals.session === undefined) return new Response(null, { status: 401 });
  const lu = definitionGabarit.safeParse(definitionDepuisFormulaire((nom) => url.searchParams.get(nom)));
  if (!lu.success) return new Response(z.prettifyError(lu.error), { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  return new Response(apercuSvg(normaliser(lu.data)), {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" },
  });
};
