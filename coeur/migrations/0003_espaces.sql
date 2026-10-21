-- regie — utilisateurs et espaces (histoire 1.9, FR-72).
-- Un espace personnel par utilisateur, plus l'espace de la marque (Établia en V1). Les deux tables portent
-- marque_id ET sont cloisonnées par utilisateur : sans `app.utilisateur_id`, aucune ligne n'est visible
-- (la variable ne fait que rétrécir l'accès, jamais l'élargir). Exécutée par regie_migrations (propriétaire).

CREATE TABLE utilisateurs (
  -- Déterministe (voir idUtilisateur dans infra/espaces.ts) : on peut poser app.utilisateur_id avant toute lecture.
  id uuid PRIMARY KEY,
  marque_id uuid NOT NULL REFERENCES marques (id),
  sub text NOT NULL CHECK (length(sub) BETWEEN 1 AND 255),
  email text CHECK (email IS NULL OR length(email) <= 320),
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marque_id, sub)
);

CREATE TABLE espaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  proprietaire_id uuid NOT NULL REFERENCES utilisateurs (id),
  genre text NOT NULL CHECK (genre IN ('personnel', 'marque')),
  nom text NOT NULL CHECK (length(nom) BETWEEN 1 AND 120),
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proprietaire_id, genre)
);

-- Espace actif de la session : rappelé dans l'en-tête, changé en un geste.
ALTER TABLE sessions ADD COLUMN espace_actif_id uuid REFERENCES espaces (id);

ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateurs FORCE ROW LEVEL SECURITY;
ALTER TABLE espaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE espaces FORCE ROW LEVEL SECURITY;

CREATE POLICY utilisateurs_de_la_personne ON utilisateurs TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid
         AND id = nullif(current_setting('app.utilisateur_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid
              AND id = nullif(current_setting('app.utilisateur_id', true), '')::uuid);

CREATE POLICY espaces_de_la_personne ON espaces TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid
         AND proprietaire_id = nullif(current_setting('app.utilisateur_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid
              AND proprietaire_id = nullif(current_setting('app.utilisateur_id', true), '')::uuid);

GRANT SELECT, INSERT ON utilisateurs TO regie_coeur;
GRANT SELECT, INSERT ON espaces TO regie_coeur;
