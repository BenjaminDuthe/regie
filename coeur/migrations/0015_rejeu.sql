-- regie — rejeu d'un script à chaque mise en production (histoire 4.11, FR-19, AR-13).
-- Un jeton de rejeu est un jeton d'API lié à UN script : il ne sait faire que `script.rejouer` sur ce script (le
-- registre d'actions le refuse partout ailleurs). Il vit un an au plus, au lieu de 90 jours pour un jeton personnel.
-- Exécutée par regie_migrations (propriétaire).

ALTER TABLE jetons_api ADD COLUMN script_id uuid REFERENCES scripts (id);
CREATE INDEX jetons_api_script ON jetons_api (marque_id, script_id) WHERE script_id IS NOT NULL;

-- La borne de 90 jours (contrainte sans nom, créée en 0004) est remplacée : 90 jours sans script, 366 avec.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'jetons_api'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%90 days%' LOOP
    EXECUTE format('ALTER TABLE jetons_api DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE jetons_api ADD CONSTRAINT jetons_api_duree CHECK (
  expire_le > cree_le
  AND expire_le <= cree_le + CASE WHEN script_id IS NULL THEN interval '90 days 1 minute' ELSE interval '366 days' END
);
-- Un jeton de rejeu n'a que la portée « ecriture » (jouer un script) et un seul espace : celui du script.
ALTER TABLE jetons_api ADD CONSTRAINT jetons_api_rejeu CHECK (script_id IS NULL OR (portees = ARRAY['ecriture'] AND cardinality(espace_ids) = 1));
