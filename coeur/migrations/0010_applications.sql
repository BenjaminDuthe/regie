-- regie — applications à filmer (histoire 4.1, FR-13, FR-17, AR-21). Une application appartient à un espace : son nom, son
-- adresse d'accueil et la liste STRICTE des hôtes que la capture a le droit de joindre (aucun joker, aucun sous-domaine
-- implicite). Aucune preuve de contrôle du domaine en V1 (ajustement du 2026-10-18) : la cible est le tenant de démo
-- d'Établia, la liste d'hôtes est le seul garde-fou, appliqué aussi par le proxy de sortie (histoire 4.2).
-- Cloisonné par marque (RLS forcée) ET par espace visible, comme `gabarits`. Pas de DELETE en V1.
-- Exécutée par regie_migrations.

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  nom text NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  -- Adresse https de départ ; son hôte figure toujours dans `hotes` (vérifié par le cœur).
  accueil text NOT NULL CHECK (length(accueil) BETWEEN 9 AND 2000 AND accueil LIKE 'https://%'),
  hotes text[] NOT NULL CHECK (cardinality(hotes) BETWEEN 1 AND 20),
  version integer NOT NULL DEFAULT 1,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (espace_id, nom)
);
CREATE INDEX applications_espace ON applications (marque_id, espace_id, cree_le);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;

CREATE POLICY applications_de_la_marque ON applications TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = applications.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = applications.espace_id));

GRANT SELECT, INSERT ON applications TO regie_coeur;
GRANT UPDATE (nom, accueil, hotes, version, modifie_le) ON applications TO regie_coeur;
