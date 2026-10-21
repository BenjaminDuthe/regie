// Aperçu d'une scène d'un montage (histoire 3.10) : image SVG dessinée sur le serveur, à partir de la version enregistrée
// et des champs modifiés passés en paramètres. Page gardée par la session ; rien n'est enregistré ni écrit au journal.
// Un montage hors de portée et un identifiant mal formé donnent la même réponse (404) : rien n'est révélé.
import type { APIRoute } from 'astro';
import { apercuScene } from '../../domaine/apercu-scene.ts';
import { evaluerMontage } from '../../domaine/montage.ts';
import { montageAccessible } from '../../services/actions-montage.ts';
import { contexteInterface } from '../../services/contextes.ts';
import { ErreurMetier } from '../../services/erreurs.ts';
import { brouillonDepuisChamps } from '../../services/formulaire-montage.ts';

const ENTETES = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const absent = (): Response => new Response(null, { status: 404, headers: ENTETES });

export const GET: APIRoute = async ({ locals, url }) => {
  if (locals.regie === undefined || locals.session === undefined) return new Response(null, { status: 401 });
  const id = url.searchParams.get('id') ?? '';
  const scene = url.searchParams.get('scene') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id) || scene === '') return absent();
  try {
    const base = await montageAccessible(contexteInterface(locals.regie, locals.session), id);
    const { timeline } = brouillonDepuisChamps(base.timeline, (nom) => url.searchParams.get(nom));
    const svg = apercuScene(timeline, base.gabarit.definition, scene, { violations: evaluerMontage(timeline, base.gabarit.definition) });
    if (svg === undefined) return absent();
    return new Response(svg, { headers: { ...ENTETES, 'content-type': 'image/svg+xml; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } });
  } catch (e) {
    if (e instanceof ErreurMetier) return absent();
    throw e;
  }
};
