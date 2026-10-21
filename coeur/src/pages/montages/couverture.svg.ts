// Une couverture d'un montage (histoire 3.5) : image SVG dessinée sur le serveur, servie en `<img>` (ses scripts ne
// s'y exécutent jamais, et la CSP de la réponse interdit tout le reste). Page gardée par la session ; rien n'est écrit.
// Un montage hors de portée, un identifiant mal formé et une variante inconnue donnent la même réponse (404).
import type { APIRoute } from 'astro';
import { VARIANTES_COUVERTURE, type VarianteCouverture } from '@regie/contrats';
import { dessinerCouverture } from '../../domaine/couverture.ts';
import { montageAccessible } from '../../services/actions-montage.ts';
import { contexteInterface } from '../../services/contextes.ts';
import { ErreurMetier } from '../../services/erreurs.ts';

const ENTETES = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const absent = (): Response => new Response(null, { status: 404, headers: ENTETES });

export const GET: APIRoute = async ({ locals, url }) => {
  if (locals.regie === undefined || locals.session === undefined) return new Response(null, { status: 401 });
  const id = url.searchParams.get('id') ?? '';
  const variante = url.searchParams.get('variante') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id) || !(VARIANTES_COUVERTURE as readonly string[]).includes(variante)) return absent();
  try {
    const m = await montageAccessible(contexteInterface(locals.regie, locals.session), id);
    const svg = dessinerCouverture(m.timeline, m.gabarit.definition, variante as VarianteCouverture);
    return new Response(svg, { headers: { ...ENTETES, 'content-type': 'image/svg+xml; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } });
  } catch (e) {
    if (e instanceof ErreurMetier) return absent();
    throw e;
  }
};
