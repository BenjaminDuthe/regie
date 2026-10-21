-- regie — scripts de démo (histoire 4.4, FR-14, FR-47). Un script est une suite d'étapes (aller, cliquer, saisir,
-- attendre, connexion, filmer…) que la capture rejoue sur UNE application déclarée (0010). Les étapes sont validées
-- par le cœur (contrat `@regie/contrats` scripts) avant d'arriver ici ; la base borne seulement la forme et la taille.
-- `dernier_jeu` garde le résultat du dernier essai (réussi, échec à l'étape N avec capture, hôte refusé) : il est
-- écrit par la capture (histoire 4.5) et remis à vide quand les étapes changent, car il parlerait d'un autre script.
-- Cloisonné par marque (RLS forcée) ET par espace visible, comme `applications`. Pas de DELETE en V1.
-- Exécutée par regie_migrations.

CREATE TABLE scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  application_id uuid NOT NULL REFERENCES applications (id),
  nom text NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  origine text NOT NULL CHECK (origine IN ('claude', 'parcours', 'test_importe')),
  etapes jsonb NOT NULL CHECK (jsonb_typeof(etapes) = 'array' AND jsonb_array_length(etapes) <= 100),
  dernier_jeu jsonb CHECK (dernier_jeu IS NULL OR jsonb_typeof(dernier_jeu) = 'object'),
  version integer NOT NULL DEFAULT 1,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, nom)
);
CREATE INDEX scripts_application ON scripts (marque_id, application_id, cree_le);

ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts FORCE ROW LEVEL SECURITY;

CREATE POLICY scripts_de_la_marque ON scripts TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = scripts.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = scripts.espace_id));

GRANT SELECT, INSERT ON scripts TO regie_coeur;
GRANT UPDATE (nom, etapes, dernier_jeu, version, modifie_le) ON scripts TO regie_coeur;
