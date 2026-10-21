// regie — demande de capture reçue sur l'entrée standard du conteneur (histoire 4.2). Ni argument ni variable
// d'environnement : le laissez-passer ne se voit pas dans `ps`. Validation à la main (le service n'a aucune dépendance).

export type DemandeCapture = Readonly<{
  url: string;
  /** Hôtes autorisés de l'application : seconde garde, après le proxy. */
  hotes: readonly string[];
  proxy: Readonly<{ serveur: string; laissezPasser: string }>;
  viewport: Readonly<{ largeur: number; hauteur: number }>;
  delaiMs: number;
}>;

export type ResultatCapture =
  | Readonly<{ ok: true; hote: string; titre: string; miniature: string }>
  | Readonly<{ ok: false; cause: 'HOTE_REFUSE' | 'PAGE_INJOIGNABLE' | 'CAPTURE_ECHEC'; hote?: string }>;

const entier = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

export function lireDemande(brut: string): DemandeCapture {
  const d = JSON.parse(brut) as Record<string, unknown>;
  const proxy = d['proxy'] as Record<string, unknown> | undefined;
  const vue = d['viewport'] as Record<string, unknown> | undefined;
  if (
    typeof d['url'] !== 'string' ||
    !Array.isArray(d['hotes']) ||
    !d['hotes'].every((h) => typeof h === 'string') ||
    typeof proxy?.['serveur'] !== 'string' ||
    typeof proxy['laissezPasser'] !== 'string' ||
    !entier(vue?.['largeur'], 200, 2000) ||
    !entier(vue['hauteur'], 200, 4000) ||
    !entier(d['delaiMs'], 1000, 600_000)
  ) {
    throw new Error('demande de capture invalide');
  }
  if (!/^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(proxy['serveur'])) throw new Error('le proxy doit être une adresse IPv4 avec port');
  return {
    url: d['url'],
    hotes: d['hotes'] as string[],
    proxy: { serveur: proxy['serveur'], laissezPasser: proxy['laissezPasser'] },
    viewport: { largeur: vue['largeur'], hauteur: vue['hauteur'] },
    delaiMs: d['delaiMs'],
  };
}
