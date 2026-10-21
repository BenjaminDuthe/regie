-- regie — sessions et journal d'audit chaîné (histoire 1.14).
-- Les deux tables portent marque_id : RLS forcée, même politique que les secrets, aucune variable de session
-- qui l'élargit. Exécutée par regie_migrations (propriétaire).

-- Sessions : seul le haché SHA-256 de l'identifiant (32 octets aléatoires) est stocké ; le cookie porte
-- `<marque_id>.<identifiant>`, ce qui permet de retrouver la session sous la RLS sans la contourner.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  hache_jeton bytea NOT NULL UNIQUE CHECK (length(hache_jeton) = 32),
  sub text NOT NULL CHECK (length(sub) BETWEEN 1 AND 255),
  email text CHECK (email IS NULL OR length(email) <= 320),
  -- Dernière authentification réelle auprès d'Authentik (auth_time) : sert à la réauthentification sensible.
  authentifie_le timestamptz NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL,
  revoquee_le timestamptz
);
CREATE INDEX sessions_expiration ON sessions (expire_le);

-- Journal d'audit : en ajout seul. Chaque ligne cite le haché de la précédente de la marque (hache_precedent
-- unique : la chaîne est linéaire) ; le haché couvre toute la ligne (NFR-21).
CREATE TABLE journal_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marque_id uuid NOT NULL REFERENCES marques (id),
  horodatage timestamptz NOT NULL,
  acteur text NOT NULL CHECK (length(acteur) BETWEEN 1 AND 255),
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]{0,62}$'),
  objet text NOT NULL CHECK (length(objet) BETWEEN 1 AND 255),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  hache_precedent text NOT NULL CHECK (hache_precedent ~ '^[0-9a-f]{64}$'),
  hache text NOT NULL CHECK (hache ~ '^[0-9a-f]{64}$'),
  UNIQUE (marque_id, hache_precedent),
  UNIQUE (marque_id, hache)
);

-- Modifier ou supprimer une ligne est refusé pour tous, propriétaire compris.
CREATE FUNCTION journal_audit_ajout_seul() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'journal_audit est en ajout seul'; END $$;
CREATE TRIGGER journal_audit_ajout_seul BEFORE UPDATE OR DELETE ON journal_audit
  FOR EACH ROW EXECUTE FUNCTION journal_audit_ajout_seul();
CREATE TRIGGER journal_audit_pas_de_vidage BEFORE TRUNCATE ON journal_audit
  FOR EACH STATEMENT EXECUTE FUNCTION journal_audit_ajout_seul();

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY sessions_de_la_marque ON sessions TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

CREATE POLICY journal_audit_de_la_marque ON journal_audit TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO regie_coeur;
GRANT SELECT, INSERT ON journal_audit TO regie_coeur;
