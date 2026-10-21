-- regie — connexion de Claude par OAuth 2.1 (histoire 1.12, FR-46).
-- Trois tables, toutes cloisonnées par marque (RLS). Aucun secret en clair : codes, jetons d'accès et de
-- rafraîchissement n'existent qu'en SHA-256. Chaque secret porte la marque dans sa forme (`regie_oat_<marque>_…`),
-- ce qui permet de la retrouver sous la RLS sans connaître la personne. Exécutée par regie_migrations.

-- Clients enregistrés dynamiquement (RFC 7591), publics seulement : l'identifiant porte la marque.
CREATE TABLE oauth_clients (
  client_id text PRIMARY KEY CHECK (client_id ~ '^regie_cli_[0-9a-f]{32}_[A-Za-z0-9_-]{22}$'),
  marque_id uuid NOT NULL REFERENCES marques (id),
  nom text NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  redirect_uris text[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 5),
  cree_le timestamptz NOT NULL DEFAULT now()
);

-- Codes d'autorisation : à usage unique, 10 minutes au plus (regie en donne une).
CREATE TABLE oauth_codes (
  hache bytea PRIMARY KEY CHECK (length(hache) = 32),
  marque_id uuid NOT NULL REFERENCES marques (id),
  client_id text NOT NULL REFERENCES oauth_clients (client_id),
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs (id),
  sub text NOT NULL CHECK (length(sub) BETWEEN 1 AND 255),
  redirect_uri text NOT NULL CHECK (length(redirect_uri) <= 512),
  code_challenge text NOT NULL CHECK (length(code_challenge) = 43),
  portees text[] NOT NULL CHECK (portees <> '{}' AND portees <@ ARRAY['lecture', 'ecriture']),
  espace_ids uuid[] NOT NULL CHECK (espace_ids <> '{}'),
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL,
  utilise_le timestamptz,
  CHECK (expire_le > cree_le AND expire_le <= cree_le + interval '10 minutes')
);

-- Une connexion de Claude = un accord (personne, client, portée, espaces) et ses deux jetons courants.
-- Le rafraîchissement est tournant : l'ancien jeton est gardé (`refresh_precedent`) pour reconnaître sa réutilisation,
-- qui révoque toute la connexion.
CREATE TABLE oauth_connexions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  client_id text NOT NULL REFERENCES oauth_clients (client_id),
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs (id),
  sub text NOT NULL CHECK (length(sub) BETWEEN 1 AND 255),
  portees text[] NOT NULL CHECK (portees <> '{}' AND portees <@ ARRAY['lecture', 'ecriture']),
  espace_ids uuid[] NOT NULL CHECK (espace_ids <> '{}'),
  cree_le timestamptz NOT NULL DEFAULT now(),
  revoque_le timestamptz,
  hache_acces bytea NOT NULL UNIQUE CHECK (length(hache_acces) = 32),
  acces_expire_le timestamptz NOT NULL,
  hache_refresh bytea NOT NULL UNIQUE CHECK (length(hache_refresh) = 32),
  refresh_precedent bytea CHECK (refresh_precedent IS NULL OR length(refresh_precedent) = 32),
  refresh_expire_le timestamptz NOT NULL,
  -- Comme un jeton d'API : 90 jours au plus, rafraîchissements compris.
  CHECK (refresh_expire_le <= cree_le + interval '90 days 1 minute')
);
CREATE INDEX oauth_connexions_utilisateur ON oauth_connexions (marque_id, utilisateur_id);
CREATE INDEX oauth_connexions_precedent ON oauth_connexions (refresh_precedent);
CREATE INDEX oauth_codes_client ON oauth_codes (client_id);

ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE oauth_connexions ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connexions FORCE ROW LEVEL SECURITY;

CREATE POLICY oauth_clients_de_la_marque ON oauth_clients TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);
CREATE POLICY oauth_codes_de_la_marque ON oauth_codes TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);
CREATE POLICY oauth_connexions_de_la_marque ON oauth_connexions TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

-- DELETE seulement pour le ménage (clients jamais utilisés, codes périmés) ; une connexion se révoque, elle ne disparaît pas.
GRANT SELECT, INSERT, DELETE ON oauth_clients TO regie_coeur;
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_codes TO regie_coeur;
GRANT SELECT, INSERT, UPDATE ON oauth_connexions TO regie_coeur;
