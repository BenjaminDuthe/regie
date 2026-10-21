-- regie — file de traitement durable (histoire 2.1, AR-15, NFR-4, NFR-7).
-- Une tâche = une ligne de `taches`. Les services la prennent par SELECT … FOR UPDATE SKIP LOCKED sous un bail
-- (verrou à durée limitée, renouvelé tant que le service travaille). Si le service meurt, le bail expire et
-- `file_recuperer` reprend la tâche une seule fois quand sa reprise est permise, sinon la passe en échec
-- RESULTAT_INCONNU. Une seule tâche GPU tourne à la fois : index unique partiel. Pas d'équité entre comptes
-- (recentrage du 2026-10-18) : la classe `interactive` passe avant `lot`, puis premier arrivé, premier servi.
-- Toutes les fonctions s'exécutent avec les droits de l'appelant : la RLS par marque s'applique (app.marque_id).
-- Exécutée par regie_migrations (propriétaire).

CREATE TABLE taches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs (id),
  type text NOT NULL CHECK (type ~ '^[a-z][a-z0-9_]{0,40}$'),
  classe text NOT NULL CHECK (classe IN ('interactive', 'lot')),
  gpu boolean NOT NULL DEFAULT false,
  reprise text NOT NULL CHECK (reprise IN ('permise', 'interdite')),
  delai_garde_s integer NOT NULL CHECK (delai_garde_s BETWEEN 1 AND 86400),
  tentatives_max integer NOT NULL DEFAULT 3 CHECK (tentatives_max BETWEEN 1 AND 10),
  -- Tentatives déjà faites quand la série courante a commencé (relance à la main) : l'historique continue, le budget repart.
  tentatives_serie integer NOT NULL DEFAULT 0,
  -- Données de la tâche : références et réglages, jamais de secret ni de contenu d'utilisateur volumineux.
  entree jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(entree) <= 16384),
  etat text NOT NULL DEFAULT 'prete' CHECK (etat IN ('prete', 'en_cours', 'terminee', 'echouee', 'annulee', 'gelee')),
  tentatives integer NOT NULL DEFAULT 0,
  -- Reprises automatiques après un arrêt du service (au plus une).
  reprises integer NOT NULL DEFAULT 0,
  disponible_le timestamptz NOT NULL DEFAULT now(),
  verrou_par text CHECK (verrou_par IS NULL OR length(verrou_par) <= 80),
  bail_jusqua timestamptz,
  -- Après ce point l'effet est parti (publication…) : la tâche ne peut plus être annulée ni reprise.
  point_de_non_retour boolean NOT NULL DEFAULT false,
  resultat jsonb,
  -- Code de la cause (RESULTAT_INCONNU, DELAI_DEPASSE, ECHEC…) et action conseillée (relancer, verifier).
  cause text CHECK (cause IS NULL OR cause ~ '^[A-Z][A-Z0-9_]{0,40}$'),
  action text CHECK (action IS NULL OR action ~ '^[a-z][a-z_]{0,30}$'),
  cree_le timestamptz NOT NULL DEFAULT now(),
  demarree_le timestamptz,
  terminee_le timestamptz,
  resultat_applique_le timestamptz
);
CREATE INDEX taches_prete ON taches (classe, disponible_le, cree_le) WHERE etat = 'prete';
CREATE INDEX taches_en_cours ON taches (bail_jusqua) WHERE etat = 'en_cours';
CREATE INDEX taches_a_appliquer ON taches (terminee_le) WHERE etat = 'terminee' AND resultat_applique_le IS NULL;
CREATE INDEX taches_utilisateur ON taches (marque_id, utilisateur_id, cree_le DESC);
-- Sémaphore GPU : au plus une tâche GPU en cours pour toute l'installation.
CREATE UNIQUE INDEX taches_un_seul_gpu ON taches ((true)) WHERE gpu AND etat = 'en_cours';

-- Historique des tentatives (histoire 2.6) : une ligne par prise d'une tâche.
CREATE TABLE tentatives_taches (
  tache_id uuid NOT NULL REFERENCES taches (id),
  numero integer NOT NULL,
  marque_id uuid NOT NULL REFERENCES marques (id),
  debut timestamptz NOT NULL DEFAULT now(),
  fin timestamptz,
  -- en_cours | terminee | echouee | reprogrammee | perdue | annulee | delai
  issue text NOT NULL DEFAULT 'en_cours' CHECK (issue IN ('en_cours', 'terminee', 'echouee', 'reprogrammee', 'perdue', 'annulee', 'delai')),
  cause text CHECK (cause IS NULL OR cause ~ '^[A-Z][A-Z0-9_]{0,40}$'),
  PRIMARY KEY (tache_id, numero)
);

ALTER TABLE taches ENABLE ROW LEVEL SECURITY;
ALTER TABLE taches FORCE ROW LEVEL SECURITY;
ALTER TABLE tentatives_taches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tentatives_taches FORCE ROW LEVEL SECURITY;

CREATE POLICY taches_de_la_marque ON taches TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);
CREATE POLICY tentatives_taches_de_la_marque ON tentatives_taches TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

-- Pas de DELETE : une tâche garde sa trace.
GRANT SELECT, INSERT, UPDATE ON taches TO regie_coeur;
GRANT SELECT, INSERT, UPDATE ON tentatives_taches TO regie_coeur;

-- Prend la prochaine tâche prête. Le bail doit valoir au moins 3 fois l'intervalle de renouvellement : un service
-- qui rate deux renouvellements de suite garde encore sa tâche. Ne rend rien s'il n'y en a pas (ou si seules des
-- tâches GPU attendent alors que le GPU est pris).
CREATE FUNCTION file_prendre(p_service text, p_bail_s integer, p_renouvellement_s integer) RETURNS SETOF taches
  LANGUAGE plpgsql AS $$
DECLARE
  v taches%ROWTYPE;
  v_sans_gpu boolean := false;
  v_contrainte text;
BEGIN
  IF p_renouvellement_s < 1 OR p_bail_s < 3 * p_renouvellement_s THEN
    RAISE EXCEPTION 'bail trop court : au moins 3 fois l''intervalle de renouvellement' USING ERRCODE = '22023';
  END IF;
  LOOP
    SELECT * INTO v FROM taches
      WHERE etat = 'prete' AND disponible_le <= now() AND NOT (v_sans_gpu AND gpu)
      ORDER BY (classe = 'interactive') DESC, disponible_le, cree_le, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
    BEGIN
      UPDATE taches
         SET etat = 'en_cours', tentatives = tentatives + 1, verrou_par = p_service,
             bail_jusqua = now() + make_interval(secs => p_bail_s), demarree_le = now(), cause = NULL, action = NULL
       WHERE id = v.id
       RETURNING * INTO v;
      INSERT INTO tentatives_taches (tache_id, numero, marque_id) VALUES (v.id, v.tentatives, v.marque_id);
      RETURN NEXT v;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_contrainte = CONSTRAINT_NAME;
      IF v_contrainte IS DISTINCT FROM 'taches_un_seul_gpu' THEN RAISE; END IF;
      -- Le GPU est pris : on cherche une tâche qui n'en a pas besoin.
      v_sans_gpu := true;
    END;
  END LOOP;
END $$;

-- Prolonge le bail. Rend faux si la tâche n'est plus à ce service (annulée, reprise) ou si son délai de garde est dépassé :
-- le service doit alors s'arrêter.
CREATE FUNCTION file_renouveler(p_id uuid, p_service text, p_bail_s integer) RETURNS boolean
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE taches SET bail_jusqua = now() + make_interval(secs => p_bail_s)
   WHERE id = p_id AND etat = 'en_cours' AND verrou_par = p_service
     AND demarree_le + make_interval(secs => delai_garde_s) > now();
  RETURN FOUND;
END $$;

CREATE FUNCTION file_terminer(p_id uuid, p_service text, p_resultat jsonb) RETURNS boolean
  LANGUAGE plpgsql AS $$
DECLARE v taches%ROWTYPE;
BEGIN
  UPDATE taches SET etat = 'terminee', resultat = p_resultat, terminee_le = now(), bail_jusqua = NULL
   WHERE id = p_id AND etat = 'en_cours' AND verrou_par = p_service
   RETURNING * INTO v;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE tentatives_taches SET fin = now(), issue = 'terminee' WHERE tache_id = p_id AND numero = v.tentatives;
  -- Réveille l'application des résultats (le balayage de 30 s rattrape un message perdu).
  PERFORM pg_notify('file_resultats', v.marque_id::text);
  RETURN true;
END $$;

-- Échec d'une tentative. Avec p_reessayer et des tentatives restantes, la tâche repart après un délai exponentiel
-- (15 s, 30 s, 60 s… au plus 1 h) ; sinon elle est en échec définitif. Rend le nouvel état, ou NULL si la tâche n'est plus à ce service.
CREATE FUNCTION file_echouer(p_id uuid, p_service text, p_cause text, p_action text, p_reessayer boolean) RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  v taches%ROWTYPE;
  v_etat text;
BEGIN
  SELECT * INTO v FROM taches WHERE id = p_id AND etat = 'en_cours' AND verrou_par = p_service FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_reessayer AND NOT v.point_de_non_retour AND v.tentatives - v.tentatives_serie < v.tentatives_max THEN
    v_etat := 'prete';
    UPDATE taches
       SET etat = 'prete', cause = p_cause, action = p_action, bail_jusqua = NULL, verrou_par = NULL,
           disponible_le = now() + make_interval(secs => least(3600, 15 * power(2, v.tentatives - v.tentatives_serie - 1))::integer)
     WHERE id = p_id;
    UPDATE tentatives_taches SET fin = now(), issue = 'reprogrammee', cause = p_cause WHERE tache_id = p_id AND numero = v.tentatives;
  ELSE
    v_etat := 'echouee';
    UPDATE taches SET etat = 'echouee', cause = p_cause, action = p_action, bail_jusqua = NULL, terminee_le = now() WHERE id = p_id;
    UPDATE tentatives_taches SET fin = now(), issue = 'echouee', cause = p_cause WHERE tache_id = p_id AND numero = v.tentatives;
  END IF;
  RETURN v_etat;
END $$;

-- Le service annonce que l'effet extérieur va partir : plus d'annulation, plus de reprise automatique.
CREATE FUNCTION file_point_de_non_retour(p_id uuid, p_service text) RETURNS boolean
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE taches SET point_de_non_retour = true WHERE id = p_id AND etat = 'en_cours' AND verrou_par = p_service;
  RETURN FOUND;
END $$;

-- Annule une tâche prête, gelée ou en cours (le service s'en aperçoit à son prochain renouvellement), tant que
-- le point de non-retour n'est pas passé.
CREATE FUNCTION file_annuler(p_id uuid) RETURNS boolean
  LANGUAGE plpgsql AS $$
DECLARE v taches%ROWTYPE;
BEGIN
  SELECT * INTO v FROM taches WHERE id = p_id AND etat IN ('prete', 'gelee', 'en_cours') AND NOT point_de_non_retour FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE taches SET etat = 'annulee', bail_jusqua = NULL, terminee_le = now() WHERE id = p_id;
  IF v.etat = 'en_cours' THEN
    UPDATE tentatives_taches SET fin = now(), issue = 'annulee' WHERE tache_id = p_id AND numero = v.tentatives;
  END IF;
  RETURN true;
END $$;

-- Met une tâche prête de côté (la reprise de la file la laisse), et la remet.
CREATE FUNCTION file_geler(p_id uuid) RETURNS boolean
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE taches SET etat = 'gelee' WHERE id = p_id AND etat = 'prete';
  RETURN FOUND;
END $$;

CREATE FUNCTION file_degeler(p_id uuid) RETURNS boolean
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE taches SET etat = 'prete', disponible_le = now() WHERE id = p_id AND etat = 'gelee';
  RETURN FOUND;
END $$;

-- Relance une tâche en échec (histoire 2.6) : repart de zéro, sauf si l'échec laisse un doute sur un effet
-- extérieur (RESULTAT_INCONNU) — la décision de relancer est alors celle de la personne, qui l'a prise en appelant ceci.
CREATE FUNCTION file_relancer(p_id uuid) RETURNS boolean
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE taches
     SET etat = 'prete', tentatives_serie = tentatives, reprises = 0, disponible_le = now(), verrou_par = NULL, bail_jusqua = NULL,
         point_de_non_retour = false, terminee_le = NULL, cause = NULL, action = NULL, resultat = NULL
   WHERE id = p_id AND etat = 'echouee';
  RETURN FOUND;
END $$;

-- Reprise après un arrêt : les tâches dont le bail a expiré, ou dont le délai de garde est dépassé.
-- Bail expiré : reprise (une seule) si elle est permise et l'effet n'est pas parti ; sinon RESULTAT_INCONNU.
-- Délai de garde dépassé : échec DELAI_DEPASSE, même si le service renouvelait encore. Rend le nombre de tâches traitées.
CREATE FUNCTION file_recuperer() RETURNS integer
  LANGUAGE plpgsql AS $$
DECLARE
  v taches%ROWTYPE;
  n integer := 0;
BEGIN
  FOR v IN
    SELECT * FROM taches
     WHERE etat = 'en_cours'
       AND (bail_jusqua < now() OR demarree_le + make_interval(secs => delai_garde_s) < now())
     FOR UPDATE SKIP LOCKED
  LOOP
    n := n + 1;
    IF v.demarree_le + make_interval(secs => v.delai_garde_s) < now() THEN
      UPDATE taches SET etat = 'echouee', cause = 'DELAI_DEPASSE', action = 'relancer', bail_jusqua = NULL, terminee_le = now() WHERE id = v.id;
      UPDATE tentatives_taches SET fin = now(), issue = 'delai', cause = 'DELAI_DEPASSE' WHERE tache_id = v.id AND numero = v.tentatives;
    ELSIF v.reprise = 'permise' AND NOT v.point_de_non_retour AND v.reprises = 0 THEN
      UPDATE taches SET etat = 'prete', reprises = reprises + 1, verrou_par = NULL, bail_jusqua = NULL, disponible_le = now() WHERE id = v.id;
      UPDATE tentatives_taches SET fin = now(), issue = 'perdue', cause = 'RESULTAT_INCONNU' WHERE tache_id = v.id AND numero = v.tentatives;
    ELSE
      UPDATE taches SET etat = 'echouee', cause = 'RESULTAT_INCONNU', action = 'verifier', bail_jusqua = NULL, terminee_le = now() WHERE id = v.id;
      UPDATE tentatives_taches SET fin = now(), issue = 'perdue', cause = 'RESULTAT_INCONNU' WHERE tache_id = v.id AND numero = v.tentatives;
    END IF;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION file_prendre(text, integer, integer), file_renouveler(uuid, text, integer), file_terminer(uuid, text, jsonb),
  file_echouer(uuid, text, text, text, boolean), file_point_de_non_retour(uuid, text), file_annuler(uuid), file_geler(uuid),
  file_degeler(uuid), file_relancer(uuid), file_recuperer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION file_prendre(text, integer, integer), file_renouveler(uuid, text, integer), file_terminer(uuid, text, jsonb),
  file_echouer(uuid, text, text, text, boolean), file_point_de_non_retour(uuid, text), file_annuler(uuid), file_geler(uuid),
  file_degeler(uuid), file_relancer(uuid), file_recuperer() TO regie_coeur;
