-- regie — jetons d'API personnels (histoire 1.11, FR-45).
-- Seul le SHA-256 du jeton est stocké ; le jeton lui-même (`regie_pat_<marque>_<secret>`) n'est montré qu'une fois.
-- RLS par marque seulement : le jeton Bearer ne dit pas qui il est avant d'être retrouvé par son haché, alors que
-- la marque est écrite dans le jeton. Le filtrage par utilisateur (liste, révocation) est fait dans les requêtes.
-- Exécutée par regie_migrations (propriétaire).

CREATE TABLE jetons_api (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs (id),
  -- Copie du sub d'Authentik de l'utilisateur : l'acteur du journal d'audit, sans relire utilisateurs (RLS).
  sub text NOT NULL CHECK (length(sub) BETWEEN 1 AND 255),
  nom text NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  hache bytea NOT NULL UNIQUE CHECK (length(hache) = 32),
  portees text[] NOT NULL CHECK (portees <> '{}' AND portees <@ ARRAY['lecture', 'ecriture']),
  espace_ids uuid[] NOT NULL CHECK (espace_ids <> '{}'),
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL,
  revoque_le timestamptz,
  -- Un jeton vit 90 jours au plus.
  CHECK (expire_le > cree_le AND expire_le <= cree_le + interval '90 days 1 minute')
);
CREATE INDEX jetons_api_utilisateur ON jetons_api (marque_id, utilisateur_id);

ALTER TABLE jetons_api ENABLE ROW LEVEL SECURITY;
ALTER TABLE jetons_api FORCE ROW LEVEL SECURITY;

CREATE POLICY jetons_api_de_la_marque ON jetons_api TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

-- Pas de DELETE : un jeton se révoque, il ne disparaît pas (la trace reste).
GRANT SELECT, INSERT, UPDATE ON jetons_api TO regie_coeur;
