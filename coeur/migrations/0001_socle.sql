-- regie — socle de la base (histoire 1.4).
-- Exécutée par regie_migrations, seul propriétaire des tables (AD-8). L'installation pose, avant le premier
-- démarrage et avec leurs mots de passe tirés du coffre : la base, le rôle regie_migrations (propriétaire
-- de la base) et le rôle regie_coeur. Le bloc ci-dessous ne crée regie_coeur que s'il manque encore.
-- RLS par marque_id : `app.marque_id` est posé en tête de chaque transaction applicative
-- (set_config(..., true)). Variable absente ou vide = aucune ligne (échec fermé).
-- regie_admin est fondu dans regie_coeur ; un rôle par service technique arrive avec leur histoire.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'regie_coeur') THEN
    -- Sans mot de passe : l'installation le pose depuis le coffre. NOBYPASSRLS explicite.
    CREATE ROLE regie_coeur LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO regie_coeur;

GRANT SELECT ON migrations_appliquees TO regie_coeur;

-- La marque : Établia aujourd'hui, d'autres demain sans réécriture (AD-2, AD-8).
CREATE TABLE marques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL UNIQUE CHECK (length(nom) BETWEEN 1 AND 120),
  cree_le timestamptz NOT NULL DEFAULT now()
);

-- Le coffre : seul le chiffré est stocké (AES-256-GCM versionné, AAD secret_id ‖ marque_id ‖ type).
CREATE TABLE secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  type text NOT NULL CHECK (type ~ '^[a-z][a-z0-9_]{0,62}$'),
  nom text NOT NULL CHECK (length(nom) BETWEEN 1 AND 120),
  chiffre bytea NOT NULL CHECK (length(chiffre) >= 29),
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marque_id, type, nom)
);

-- Témoin : un chiffré connu, qui prouve au démarrage que la clé maîtresse est celle du coffre.
-- Une seule ligne, sans donnée d'utilisateur : hors RLS.
CREATE TABLE coffre_temoin (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  chiffre bytea NOT NULL
);

ALTER TABLE marques ENABLE ROW LEVEL SECURITY;
ALTER TABLE marques FORCE ROW LEVEL SECURITY;
ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE secrets FORCE ROW LEVEL SECURITY;

CREATE POLICY marques_de_la_marque ON marques TO regie_coeur
  USING (id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.marque_id', true), '')::uuid);

CREATE POLICY secrets_de_la_marque ON secrets TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

-- La rotation de la clé maîtresse parcourt les marques une à une, chacune sous sa propre RLS.
-- Cette fonction ne rend que les identifiants (aucune donnée), et seul regie_coeur peut l'appeler.
-- Aucune variable de session ne lève la RLS : une injection de set_config ne voit rien de plus.
-- FORCE RLS s'applique aussi au propriétaire : il lui faut sa propre politique, en lecture seule.
CREATE POLICY marques_lecture_proprietaire ON marques FOR SELECT TO CURRENT_USER USING (true);
CREATE FUNCTION marques_identifiants() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT id FROM marques ORDER BY id $$;
REVOKE ALL ON FUNCTION marques_identifiants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marques_identifiants() TO regie_coeur;

GRANT SELECT, INSERT, UPDATE ON marques TO regie_coeur;
GRANT SELECT, INSERT, UPDATE, DELETE ON secrets TO regie_coeur;
GRANT SELECT, INSERT, UPDATE ON coffre_temoin TO regie_coeur;
