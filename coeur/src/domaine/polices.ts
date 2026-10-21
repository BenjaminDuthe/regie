// regie — les polices proposées (histoire 2.7, FR-6, AR-17). Toutes sous licence libre, déclarées dans
// deploiement/licences-tiers.json (champ « polices ») ; la suite « licences » et un test de ce paquet le vérifient.
// Les fichiers de police ne sont pas embarqués ici : les histoires de rendu les installeront avec leur licence.

export const POLICES = Object.freeze({
  inter: { nom: 'Inter', largeurMoyenne: 0.56, largeurCapitales: 0.68 },
  montserrat: { nom: 'Montserrat', largeurMoyenne: 0.6, largeurCapitales: 0.74 },
  playfair: { nom: 'Playfair Display', largeurMoyenne: 0.52, largeurCapitales: 0.7 },
  bebas: { nom: 'Bebas Neue', largeurMoyenne: 0.4, largeurCapitales: 0.42 },
} as const);

export type IdPolice = keyof typeof POLICES;
export const IDS_POLICES = Object.keys(POLICES) as [IdPolice, ...IdPolice[]];
