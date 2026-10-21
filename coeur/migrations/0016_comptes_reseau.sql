-- regie — comptes reliés aux réseaux de publication (histoire 7.6, FR-41, AR-22). Un compte est le compte Instagram (ou
-- une Page) d'un espace, relié par OAuth. Son JETON n'est jamais ici : il vit au coffre (type `jeton_reseau`, nom
-- `compte:<id>`), chiffré. Cette table ne garde que ce qu'il faut pour afficher l'état, prévenir avant l'échéance et
-- choisir le compte d'une publication. Cloisonnée par marque (RLS forcée) ET par espace visible de la personne, comme
-- `applications`. Pas de DELETE : se déconnecter passe le compte à `deconnecte` (le jeton est alors retiré du coffre).
-- Exécutée par regie_migrations.

CREATE TABLE comptes_reseau (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  -- La personne qui a relié le compte : c'est elle qui reçoit les rappels d'échéance.
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs (id),
  reseau text NOT NULL CHECK (reseau IN ('instagram', 'facebook', 'tiktok')),
  compte_externe text NOT NULL CHECK (length(compte_externe) BETWEEN 1 AND 200),
  nom text NOT NULL CHECK (length(nom) BETWEEN 1 AND 200),
  etat text NOT NULL DEFAULT 'connecte' CHECK (etat IN ('connecte', 'deconnecte')),
  -- Fin de validité du jeton : les rappels (J-7, veille) partent de cette date.
  expire_le timestamptz NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (espace_id, reseau, compte_externe)
);
CREATE INDEX comptes_reseau_espace ON comptes_reseau (marque_id, espace_id, reseau);

ALTER TABLE comptes_reseau ENABLE ROW LEVEL SECURITY;
ALTER TABLE comptes_reseau FORCE ROW LEVEL SECURITY;

CREATE POLICY comptes_reseau_de_la_marque ON comptes_reseau TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = comptes_reseau.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = comptes_reseau.espace_id));

GRANT SELECT, INSERT ON comptes_reseau TO regie_coeur;
GRANT UPDATE (utilisateur_id, nom, etat, expire_le, modifie_le) ON comptes_reseau TO regie_coeur;
