# Revue adversaire du socle d'architecture — regie (2026-10-02)

- **Objet :** `ARCHITECTURE-SPINE.md` (statut `draft`), confronté au PRD `prd-regie-2026-10-02/prd.md`.
- **Méthode :** pour chaque trou, deux unités du niveau en dessous (stories, services, équipes) qui respectent **chacune toutes les AD à la lettre**, mais se construisent de façon incompatible. Chaque paire se termine par le texte d'une AD nouvelle ou resserrée.
- **Rien n'a été modifié dans le socle.**

## Verdict

Le socle est solide sur le cloisonnement des façades, le coffre et les gardes. Il ne dit pourtant pas **qui écrit quoi, dans quelle transaction**, à la frontière entre le cœur et la file. On y trouve quatre trous critiques : une reprise de bail qui produit un double envoi, un ticket de secret exposé à tous les services et contradictoire avec lui-même, un statut de tâche à deux propriétaires, et des écritures sans unité de transaction ni acteur système face à la RLS. Ils sont à fermer avant l'étape 3 de l'ordre de mise en œuvre (file, planificateur, SSE).

| Gravité | Nombre |
| --- | --- |
| Critique | 4 |
| Haut | 10 |
| Moyen | 7 |
| Bas | 4 |

---

## CRITIQUE

### C1 — La reprise de bail (AD-3) renvoie une publication (AD-14) : double envoi

- **Unité A — story « File : reprise après redémarrage » (AD-3, NFR-7).** Un bail expiré remet la tâche `en_attente` une fois. C'est conforme à la lettre : « une reprise, pas une nouvelle tentative ».
- **Unité B — story « Connecteur Instagram » (AD-14).** Le service `publication` prend la tâche `publier`. Son bail expire pendant l'envoi : plantage, coupure de la base, ou téléversement plus long que le bail sans renouvellement. La file la reprend et le connecteur renvoie.
- **Incompatibilité :**
  - AD-14 dit qu'une publication en `envoi_en_cours` « n'est pas renvoyée ». Mais cette règle porte sur l'**objet publication**, au **redémarrage du cœur**, alors que la reprise porte sur la **tâche**, à tout moment.
  - Rien ne dit qui pose `envoi_en_cours` « avant l'appel au réseau ». Le service `publication` ne peut pas le faire : il n'a aucun droit sur les tables métier (AD-2). Le cœur peut le poser à la mise en file. Mais alors une tâche encore en attente au redémarrage est vue `envoi_en_cours` et finit en échec « résultat inconnu » sans être jamais partie.
  - Résultat : NFR-9 est violée dans un cas, FR-43 dans l'autre.
- **Correction (AD-3, à resserrer) :**
  > Chaque type de tâche déclare dans les contrats `reprise: 'permise' | 'interdite'`. Une tâche `reprise: 'interdite'` dont le bail expire passe `echouee`, avec la cause `RESULTAT_INCONNU`. Elle n'est jamais remise en attente. `publier` est `interdite`.
- **Correction (AD-14, à resserrer) :**
  > Le point de non-retour est posé par le service `publication` en appelant la fonction de file `file_point_de_non_retour(tache_id, cle_idempotence)`. Cette fonction est validée (COMMIT) avant tout octet envoyé au réseau. Le cœur traduit ce marqueur de tâche en `envoi_en_cours` sur la publication. Une publication dont la tâche n'a pas franchi ce point est simplement remise en attente au redémarrage. Une publication qui l'a franchi est vérifiée auprès du réseau, ou passe en échec `RESULTAT_INCONNU`. La clé d'idempotence est transmise au réseau partout où son API l'accepte.

### C2 — Ticket de secret (AD-9) : visible de tous les services et incompatible avec lui-même

- **Unité A — story « Coffre et tickets » (AD-9).** Le cœur émet à la mise en file un ticket à usage unique, valable 5 min, lié à la tâche. La seule voie entre le cœur et les services étant la file, le ticket va dans `entrees`.
- **Unité B — service `voix` (moteur GPL, AD-11).** Il se connecte avec le rôle `regie_services`. Ce rôle voit les tables de la file (AD-8), donc toutes les tâches de tous les types et leurs `entrees`. Il peut lire le ticket d'une tâche `publier` et l'échanger avant le service `publication`.
- **Incompatibilités internes à AD-9 :**
  1. Le ticket est « à usage unique », mais AD-9 dit que le **même** ticket sert à **déposer** le jeton OAuth renouvelé, ce qui fait deux usages.
  2. Un ticket qui expire en 5 min ne survit ni à une attente en file (NFR-32 permet 1 h), ni à un téléversement YouTube long, ni à la reprise d'AD-3 : le ticket est déjà consommé par la première prise.
  3. Les six services partagent un seul rôle `regie_services`. N'importe lequel peut donc prendre une tâche d'un autre type.
- **Correction (AD-9, à réécrire) :**
  > Aucun ticket ni secret n'est écrit dans la file. Le cœur expose sur le réseau interne `POST /interne/secrets/lire` et `POST /interne/secrets/deposer`. Il les accepte seulement si toutes ces conditions tiennent :
  > - (a) l'appelant présente l'identité de son service (un secret d'amorçage par service, propre à son conteneur, distinct de la clé maîtresse) ;
  > - (b) la tâche nommée est `prise` par ce service, avec le `porteur_id` du bail en cours ;
  > - (c) le type de tâche donne droit à cette `ref_secret` (matrice `type → refs autorisées` dans les contrats : `capture` → identifiants de démo, `publication` → OAuth et clés d'application ; aucun autre service).
  >
  > La lecture est permise une fois par prise. Le dépôt est réservé au service `publication`, une fois par renouvellement, et seulement pour la `ref_secret` de la tâche.
- **Correction (AD-8, à resserrer) :**
  > Chaque service technique a son rôle PostgreSQL (`regie_srv_rendu`, `regie_srv_voix`…). Ce rôle n'a ni SELECT ni UPDATE direct sur `taches`. Il a seulement EXECUTE sur les fonctions de file, qui filtrent par les types attribués à ce rôle.

### C3 — Le statut d'une tâche a deux propriétaires, et personne n'applique les résultats

- **Unité A — story « Machine à états de la tâche » dans `coeur/src/domaine` (AD-2).** « Les transitions […] de la tâche sont déclarées dans une machine […]. Aucun `UPDATE` d'un statut ne se fait hors de sa machine. »
- **Unité B — story « Client Python de la file » (AD-3).** Il prend la tâche, renouvelle le bail et passe `reussie` ou `echouee` par des `UPDATE` SQL écrits selon `file.sql.md`. C'est la seule voie possible, puisque les services n'importent jamais le cœur.
- **Incompatibilité :**
  - Deux propriétaires du même statut, écrits dans deux langages.
  - Aucune AD ne dit **qui fait passer la vidéo** à « brouillon », « en échec de traitement » ou « prête » quand une tâche `rendu` réussit, ni **comment le cœur l'apprend de façon durable** :
    - une équipe branche l'orchestration sur `LISTEN/NOTIFY` (AD-12), qui est perdu si le cœur est arrêté ;
    - une autre interroge l'état à la lecture.
  - Le pipeline transcription → langage → rendu (« coeur (orchestration) ») peut ainsi caler sans trace après un redémarrage.
- **Correction (AD-3, nouvelle) :**
  > Le protocole de file est implémenté **en fonctions SQL** livrées par migration : `file_prendre(types[], porteur_id)`, `file_renouveler`, `file_point_de_non_retour`, `file_terminer(resultat)`, `file_echouer(erreur)`, `file_annuler`, `file_geler`. Ces fonctions **sont** la machine à états de la tâche. `file.sql.md` en devient la documentation, et les clients TS et Python ne font qu'appeler ces fonctions.
- **Correction (AD-2, nouvelle clause) :**
  > L'application d'un résultat de tâche aux tables métier appartient au seul module `coeur/src/services/application-resultats`. Il traite toute tâche terminale avec `appliquee_le IS NULL`, dans une transaction qui fait trois choses : la transition métier, la création de la tâche suivante du pipeline, et `appliquee_le = now()`. Le module tourne au démarrage, puis à chaque `NOTIFY`, plus un balayage toutes les 30 s. `NOTIFY` n'est jamais qu'un réveil, jamais la seule source.

### C4 — Ni unité de transaction ni acteur système : la RLS, l'audit, la file et `NOTIFY` se contredisent

- **Unité A — story « Garder une vidéo » (AD-2, AD-13).** La fonction de service applique la transition puis appelle l'adaptateur de file. Celui-ci ouvre sa propre connexion, depuis le pool de `coeur/src/infra/file`, et met en file le rendu complet. Ce sont deux COMMIT.
- **Unité B — story « Audit » (AD-15).** L'adaptateur d'audit écrit après la réussite de la fonction, dans une transaction séparée.
- **Unité C — story « Planificateur : purge » (AD-14).** Le réveil n'a pas d'`Acteur`, donc `app.utilisateur_id` n'est pas fixé, donc la RLS (AD-8) ne renvoie aucune séance. L'équipe contourne en exécutant la purge sous `regie_migrations` (DDL, sans RLS). Aucune AD ne l'interdit.
- **Incompatibilités :**
  - Un arrêt entre les deux COMMIT laisse une vidéo « gardée » sans rendu complet. Or la purge exige ce rendu (AD-7) : la séance devient impurgeable, ce qui viole FR-52.
  - On obtient aussi une action sans trace d'audit.
  - La table `taches` porte un `utilisateur_id`. AD-8 la soumet donc à la RLS, et `file_prendre` (équité entre utilisateurs) ne verrait plus rien.
- **Correction (AD-1, nouvelle clause « unité de travail ») :**
  > Une fonction de service s'exécute dans **une** transaction ouverte par la façade, ou par le planificateur, sous `regie_coeur`. Cette transaction contient, dans cet ordre :
  > 1. `SET LOCAL app.utilisateur_id` (et `app.origine`) ;
  > 2. les lectures et les verrous ;
  > 3. la transition de domaine ;
  > 4. les insertions dans `taches` et `echeances` ;
  > 5. l'entrée d'audit ;
  > 6. `pg_notify`.
  >
  > Les adaptateurs (file, audit, échéances) reçoivent la transaction en paramètre et n'ouvrent jamais leur propre connexion. Les effets hors base (fichiers, SMTP, réseau) n'ont lieu qu'après le COMMIT, par une tâche.
- **Correction (AD-8, nouvelle clause « acteur système ») :**
  > Le planificateur et l'application des résultats agissent avec `Acteur.systeme(motif, proprietaireId)`. Ils fixent `app.utilisateur_id` au propriétaire de l'objet traité, et l'origine `systeme`. Aucun code applicatif ne se connecte sous `regie_migrations` ni avec `BYPASSRLS`. Les tables de la file ne sont pas soumises à la RLS : leur accès est borné par les fonctions de file (C2).

---

## HAUT

### H1 — Le montage a deux sources (base ou disque) et deux auteurs possibles (cœur ou service de langage)

- **Unité A — story « Correction par le texte » (AD-5).** Le nouveau montage horodaté est une ligne de la table `MONTAGE` (diagramme entité-association).
- **Unité B — story « Rendu » (AD-5, AD-7).** Le cœur passe au rendu « la liste explicite des fichiers à lire ». Le montage est un fichier de `/videos/<id>/montages/` (AD-7).
- **Unité C — service `langage`.** Pour être reproductible (AD-5 : sortie contrainte par schéma JSON), il renvoie directement un objet `Montage` vN complet.
- **Incompatibilités :**
  - Le montage « en vigueur » n'est pas le même pour l'écran (base) et pour le rendu (fichier).
  - Le schéma `Montage` a deux producteurs : le cœur pour les corrections, Python pour la génération.
- **Correction (AD-5, à resserrer) :**
  > Les montages vivent **en base**, en lignes immuables (`montages.id`, `video_id`, `cree_le`, `contenu jsonb`). La vidéo porte `montage_en_vigueur_id`. Seul le cœur crée un `Montage`. Les services rendent des résultats partiels typés (`ResultatTranscription`, `PropositionDecoupage`, `ResultatVoix`) que le cœur assemble. Une tâche de rendu reçoit le montage **en valeur** dans `entrees`, avec son `montage_id`. Le dossier `montages/` disparaît d'AD-7.

### H2 — La purge court contre les tâches en vol, et sa condition peut bloquer indéfiniment

- **Unité A — story « Correction » (AD-2).** Elle vérifie dans le domaine que la séance n'est pas purgée, puis met en file un rendu allégé qui lit les rushes.
- **Unité B — story « Purge » (AD-7, AD-14).** Elle vérifie la condition de rendu complet, supprime la base, puis les fichiers.
- **Incompatibilités :**
  - Les deux vérifications se croisent dans des transactions concurrentes, sans verrou commun. La tâche lancée par A lit ensuite des fichiers supprimés.
  - Si le rendu complet d'une vidéo gardée échoue (« en échec de traitement »), la condition d'AD-7 n'est jamais remplie. La purge est alors bloquée sans fin, alors que FR-52 fixe une échéance.
  - FR-52 exige aussi la suppression des brouillons jetés, et AD-7 ne la mentionne pas.
- **Correction (AD-2 et AD-7, à resserrer) :**
  > La machine de la séance a un état `purge_en_cours`. Toute opération qui lit des rushes prend `SELECT … FOR SHARE` sur la ligne de la séance dans sa transaction, puis vérifie l'état. La purge prend `FOR UPDATE` et vérifie qu'aucune tâche non terminale ne porte ce `seance_id` (colonne obligatoire des tâches qui lisent des rushes). Elle passe ensuite `purge_en_cours`, valide (COMMIT), et supprime enfin les fichiers et les brouillons jetés.
  >
  > Les entrées d'une tâche sont des **liens physiques** créés par le cœur dans `/donnees/taches/<id>/entrees/`. Une purge ne casse donc jamais une tâche déjà partie.
  >
  > Si la condition de rendu n'est pas remplie à l'échéance, la purge est reportée de 24 h et le propriétaire reçoit l'événement `purge_bloquee`. Au bout de 7 jours, l'administrateur est alerté. La purge n'efface jamais un rush dont un rendu complet manque.

### H3 — Le flux SSE (AD-12) échappe à la RLS et au retrait des membres (AD-8)

- **Unité A — story « SSE ».** Un flux par utilisateur, ouvert une fois avec un acteur calculé à l'ouverture. Il écoute le canal `taches` et filtre `payload.utilisateur_id`.
- **Unité B — story « Validation » (FR-39).** L'événement `video_a_valider` doit atteindre les **autres membres** de l'espace. Pour cela, l'équipe met dans le `NOTIFY` les données de la vidéo (titre, vignette).
- **Incompatibilités :**
  - Un membre retiré, ou un espace suspendu, continue de recevoir des événements par un flux ouvert avant le retrait, ce qui viole FR-3 (« dès sa requête suivante ») : un flux SSE est **une** requête.
  - `NOTIFY` n'est pas soumis à la RLS : tout rôle connecté qui fait `LISTEN` lit les charges utiles.
  - Les charges dépassent 8 000 octets.
- **Correction (AD-12, à resserrer) :**
  > Une charge `NOTIFY` ne contient que `{ type, objet_id }`, sans donnée métier. Le flux SSE relit chaque objet **par la couche de services**, avec un acteur recalculé à chaque événement et au moins toutes les 30 s (battement). Il se ferme sur `401/403` : session révoquée, membre retiré, espace suspendu. Les destinataires d'un événement sont déterminés par le droit de lecture de l'objet, pas par `taches.utilisateur_id`. Le `LISTEN` utilise une connexion dédiée, hors du pool, sous `regie_coeur`. Seul `regie_coeur` peut faire `LISTEN` sur les canaux applicatifs.

### H4 — Contrats TS et Python : même schéma, validations différentes, versions non négociées

- **Unité A — service `rendu` (TS).** Il valide `entrees` avec le schéma zod, qui porte `.refine(fin > debut)` et `.transform()` de dates.
- **Unité B — service `transcription` (Python).** Ses modèles pydantic sont générés depuis `z.toJSONSchema()`, qui perd les `refine` et les `transform` sans le signaler. La même tâche est donc acceptée d'un côté et refusée de l'autre.
- **Unité C — déploiement.** Le cœur, mis à jour, émet `version_contrat = 3`, alors qu'un service Python sait encore seulement lire la v2. AD-4 dit que « l'ancienne reste lisible », sans dire qui la lit ni qui choisit la version émise.
- **Correction (AD-4, à resserrer) :**
  > `paquets/contrats` n'utilise que le sous-ensemble de zod représentable en JSON Schema. Une règle de lint bloquante y interdit `refine`, `superRefine`, `transform`, `preprocess`, `z.date()` et `brand`. Les invariants entre champs vivent dans le domaine du cœur, qui les vérifie avant de mettre une tâche en file.
  >
  > Au démarrage, chaque service écrit dans `services_versions` les versions de contrat qu'il accepte, par type. Le cœur émet la plus haute version acceptée par le service visé. `file_prendre` ne donne une tâche qu'à un service qui accepte sa `version_contrat`.
  >
  > Le test de dérive valide les mêmes jeux d'exemples (valides et invalides) contre zod et contre pydantic, avec un résultat identique exigé.

### H5 — Suspension, annulation et suppression : la tâche ignore son espace et ne peut pas être annulée

- **Unité A — story « Suspension d'un espace » (AD-8).** « Les tâches et publications programmées d'un espace suspendu sont gelées. »
- **Unité B — story « Protocole de file » (AD-3).** Une tâche porte `utilisateur_id`, pas `espace_id`. Ses états sont limités à `en_attente`, `prise`, `reussie` et `echouee`, et les services ne connaissent pas les espaces (paradigme).
- **Incompatibilités :**
  - La file ne peut pas geler par espace.
  - Il n'existe pas d'état `annulee` pour FR-44 (annuler une publication programmée déjà mise en file), pour FR-53 (suppression de compte pendant un rendu) ni pour la régénération qui remplace un rendu.
  - Une tâche en vol pour un espace supprimé termine et rend son résultat. Le cœur « déplace le résultat à sa place définitive » et recrée ainsi le dossier d'un espace supprimé (AD-7 : « la base d'abord, les dossiers ensuite »).
- **Correction (AD-3, à resserrer) :**
  > Une tâche porte `espace_id` (nullable pour les tâches d'instance) et `seance_id` si elle en lit les fichiers. Ses états sont `en_attente | prise | reussie | echouee | annulee | gelee`. `file_annuler` et `file_geler` sont appelées par le cœur. Un service découvre l'annulation au renouvellement de son bail (refus), s'arrête et ne dépose rien.
  >
  > L'application d'un résultat (C3) vérifie que l'objet cible existe encore et n'est pas supprimé. Sinon, elle efface le dossier de la tâche.
  >
  > La suppression d'un compte ou d'un espace commence par annuler ses tâches non terminales, dans la même transaction.

### H6 — Le volume `/donnees` est monté en entier dans chaque service : AD-7 n'empêche rien

- **Unité A — story « Compose » (AD-16).** Le schéma de structure montre `TR & VX & RD & CA & PU --> V` : le volume entier.
- **Unité B — service `voix` (moteur GPL).** Il respecte AD-7 en ne lisant que « la liste explicite des fichiers ». Le contrôle est donc purement conventionnel. Un service compromis lit tous les espaces, ce qui va contre le « Prevents » d'AD-7 et contre NFR-16.
- **Correction (AD-7, à resserrer) :**
  > Les services techniques ne montent **que** `/donnees/taches`. Le cœur y crée, pour chaque tâche, `entrees/` (liens physiques vers les fichiers sources, en lecture seule) et `sortie/`. Les dossiers des tâches appartiennent à un UID par service.
  >
  > Seul le cœur monte `/donnees/espaces`. `capture` ne monte que le `sortie/` de sa tâche dans le conteneur Chromium.
  >
  > Le volume `/donnees` tient sur un seul système de fichiers, condition des liens physiques. Un test le vérifie.

### H7 — L'équité avant la priorité (AD-3) rend NFR-6 intenable

- **Unité A — story « Équité » (AD-3, NFR-4).** On sert d'abord l'utilisateur servi le moins récemment, puis la priorité.
- **Unité B — story « Correction par le texte » (NFR-6 : moins de 10 s).** Le rendu allégé, prioritaire, de l'utilisateur A attend la transcription de 10 min de l'utilisateur B, moins récemment servi. En plus, le sémaphore GPU (une tâche à la fois) sérialise rendu, transcription et langage.
- **Correction (AD-3, à resserrer) :**
  > Deux classes de tâches.
  > - **`interactive`** : rendu allégé de correction et aperçu de gabarit. Bornée par type (estimation ≤ 30 s), ordre FIFO, sans équité, servie par un ouvrier réservé du service `rendu`, `besoin_gpu = false`, encodage processeur.
  > - **`lot`** : tout le reste. Équité, puis priorité, puis ancienneté, sous le sémaphore GPU.
  >
  > Une tâche `interactive` qui dépasse sa borne passe `echouee` (`DELAI_INTERACTIF`).
  >
  > NFR-4 se mesure sur la classe `lot`, et NFR-6 sur la classe `interactive`.

### H8 — Sémaphore GPU : « verrou consultatif » s'implémente de deux façons incompatibles

- **Unité A — client TS de la file.** `pg_try_advisory_xact_lock` dans la transaction de prise : le verrou tombe au COMMIT de la prise, donc deux tâches GPU peuvent tourner ensemble.
- **Unité B — client Python.** `pg_advisory_lock` de session : le verrou tombe si la connexion casse alors que le processus occupe encore la VRAM, et une seconde tâche GPU démarre. Les deux clients passent pourtant une suite commune qui ne teste pas la coupure.
- **Correction (AD-3, à resserrer) :**
  > Le sémaphore GPU est un **prédicat sur l'état de la file**, évalué par `file_prendre` sous `pg_advisory_xact_lock(CLE_GPU)` : on ne prend une tâche `besoin_gpu` que s'il n'existe aucune tâche `besoin_gpu` à l'état `prise` avec `bail_jusqu_a > now()`.
  >
  > Un service qui n'arrive pas à renouveler son bail arrête son travail GPU avant l'expiration du bail : la durée du bail est d'au moins trois fois l'intervalle de renouvellement.
  >
  > La suite commune inclut la coupure de connexion et l'arrêt brutal du processus.

### H9 — Une vidéo en vigueur, publiée ou programmée, peut changer sous la publication

- **Unité A — story « Rejeu de script » (AD-10).** Le rejeu « remplace le montage de la vidéo liée ». La vidéo, prête, repasse « gardée » (AD-2).
- **Unité B — story « Publication programmée » (AD-13, AD-14).** Elle publie « toujours le rendu complet du montage en vigueur ».
- **Incompatibilité :**
  - Une publication programmée sur une vidéo validée part avec un montage que personne n'a validé.
  - Ou bien elle part pour une vidéo qui n'est plus « prête », alors que FR-42 dit « depuis une vidéo prête ».
  - Le cas est le même pour une correction par le texte après programmation.
- **Correction (AD-14, nouvelle clause) :**
  > Une publication fige `rendu_id` et `montage_id` à sa création. Quand le montage d'une vidéo change, ses publications `programmee` passent `en_attente_confirmation`. Elles ne partent pas à l'heure dite. Si le propriétaire ou le publieur ne confirme pas après que la vidéo est redevenue « prête », elles passent `en_echec` avec la cause `MONTAGE_MODIFIE`.
  >
  > Le rendu figé par une publication n'est jamais purgé.
  >
  > (À reporter dans le glossaire du PRD, qui ne connaît pas cet état.)

### H10 — Propriété de la vidéo : l'espace ou l'auteur ? Les limites se croisent

- **Unité A — story « Retrait d'un membre » (FR-3).** « Ses vidéos restent dans l'espace. » La vidéo appartient à l'espace.
- **Unité B — story « Suppression de compte » (FR-53, AD-7).** « Ses rushes, brouillons, vidéos […] sont effacés. » La vidéo appartient à l'auteur. On supprime alors les vidéos prêtes d'un espace partagé que son propriétaire conserve.
- **Unité C — story « Limites » (AD-18).** Le stockage est imputé à l'auteur, mais les fichiers sont rangés par espace. Deux envois tus parallèles du même auteur passent chacun le contrôle des 20 Go, faute de réservation.
- **Correction (AD-18 et AD-2, à resserrer) :**
  > Une vidéo, une séance et ses fichiers appartiennent à l'**espace**. `auteur_id` est un attribut, mis à NULL (auteur anonymisé) à la suppression du compte. Seuls les objets des espaces **dont l'utilisateur est propriétaire** sont effacés avec son compte. Les autres restent dans leur espace.
  >
  > Les limites se vérifient par **réservation** : la création d'un envoi tus insère une ligne `reservations_usage` sous `SELECT … FOR UPDATE` de la ligne `usages` de l'auteur. Le contrôle à réception transforme la réservation en consommation, et une expiration la libère.
  >
  > `taches.utilisateur_id` désigne l'auteur imputé : il sert à l'équité et au quota. `declenche_par` désigne l'acteur, pour l'audit.

---

## MOYEN

### M1 — L'adresse signée transite par la file et peut expirer en attente

- **Unités en conflit :**
  - La story « publication » met l'adresse signée HMAC du rendu dans `entrees`, pour Instagram, qui tire la vidéo par URL.
  - La story « adresses signées » (AD-7) impose une expiration de moins d'1 h et aucune journalisation.
- **Problèmes :**
  - Avec NFR-32 (1 h d'attente admise), l'adresse expire avant l'envoi.
  - Elle est lisible par tous les services, et peut finir en clair dans la colonne `entrees`, sauvegardée chaque nuit.
- **Correction (AD-7) :**
  > Une adresse signée est fabriquée juste à temps par le cœur, via `POST /interne/adresses/signer` soumis aux mêmes conditions que les secrets (C2). Elle n'est jamais écrite dans la file ni dans la base.

### M2 — L'audit n'a pas d'origine pour les actions sans façade

- **Problème :**
  - AD-15 et AD-8 énumèrent l'origine `interface|mcp|api`. Or la purge, la publication programmée, la désactivation automatique de la validation (FR-4), l'expiration des liens et l'application des résultats écrivent sans façade.
  - Une équipe les écrira sans audit, une autre forcera `interface`.
- **Correction (AD-15) :**
  > L'origine est `interface | mcp | api | systeme`. Une entrée `systeme` porte un `motif` (code de l'échéance ou du type de tâche) et l'`utilisateur_id` du propriétaire de l'objet.

### M3 — Échéances génériques : orphelines et non gelées

- **Problème :**
  - `echeances(type, objet_id)` n'a pas de clé étrangère.
  - Une échéance de purge ou de publication survit à la suppression de son objet.
  - Une échéance d'un espace suspendu se déclenche quand même, car AD-8 ne gèle que les « tâches et publications ».
- **Correction (AD-14) :**
  > `echeances` porte `espace_id` et `etat` (`active | gelee | consommee | annulee`). La suppression d'un objet annule ses échéances dans la même transaction. La suspension d'un espace les gèle, et la levée de suspension les recalcule. Un gestionnaire d'échéance qui ne trouve pas son objet consigne l'échéance comme `annulee`, sans erreur.

### M4 — « Courriel mis en file » : personne ne le consomme

- **Problème :**
  - Les Conventions disent qu'un événement crée « un courriel mis en file ».
  - `smtp-sortant` est un relais, pas un ouvrier, et aucun service technique n'a le type `courriel`.
  - Une équipe ferait consommer les courriels par le cœur, hors de l'équité. Une autre les mettrait dans la file commune, où une réinitialisation de mot de passe attendrait derrière des rendus.
- **Correction (Conventions et AD-14) :**
  > Les courriels vivent dans `courriels_sortants` (outbox), écrits dans la transaction de l'événement. Un ouvrier interne au cœur les envoie via `smtp-sortant`, hors de la file des tâches, avec une clé d'idempotence par courriel et une reprise bornée à 3 essais : c'est une exception explicite à FR-32, qui ne vise que les étapes de traitement.

### M5 — Transitions croisées entre machines à états

- **Problème :**
  - Le retrait d'un membre (machine de l'espace) doit faire passer des vidéos de « à valider » à « prête » (FR-4). Pourtant, la machine de la vidéo n'autorise « prête » qu'après l'approbation d'un autre membre.
  - Une correction d'une vidéo gardée relance un rendu **complet** à chaque correction (AD-2 et AD-13), ce qui coûte cher en GPU.
- **Correction (AD-2) :**
  > Une transition déclenchée par une autre machine est un **événement nommé** de la machine cible (`validation_desactivee`, `montage_remplace`), déclaré dans celle-ci et appelé dans la même transaction.
  >
  > Le rendu complet d'une vidéo gardée est différé : il est lancé 10 min après la dernière correction (échéance `rendu_complet`), ou immédiatement à la demande d'export, de publication ou de purge.

### M6 — Forme de l'erreur d'une tâche non définie

- **Problème :** les services Python « ne rendent qu'un code », mais la colonne `erreur` de la tâche, la notification d'échec (FR-32 : étape, cause, action possible) et `ErreurMetier` n'ont pas de contrat commun.
- **Correction (AD-4) :**
  > Schéma `ErreurTache { code, etape, contexte, action_possible }` dans `paquets/contrats`, avec des codes énumérés par type de tâche. Le cœur le traduit en `ErreurMetier` sans le réinterpréter.

### M7 — Fichier de licence des modèles et dérive d'image

- **Problème :** `modeles.lock` est vérifié au démarrage, mais la suite « licences » (AD-17) et l'image épinglée (AD-16) n'ont pas de point commun. Une équipe peut mettre un modèle dans l'image, une autre sur le volume, et la vérification ne couvre que l'un des deux.
- **Correction (AD-11) :**
  > Les modèles ne sont **que** sur le volume `/modeles`, jamais dans une image. `modeles.lock` est l'unique liste, lue par la suite licences et par le démarrage.

---

## BAS

- **B1 — `file.sql.md` est de la prose.**
  - Un protocole écrit en Markdown sera traduit deux fois.
  - Correction : voir C3, des fonctions SQL livrées par migration, dont ce fichier n'est que la documentation.
- **B2 — Enveloppe de réponse et MCP.**
  - `{ ok, donnees | erreur }` ne correspond pas au `isError` des résultats d'outils MCP.
  - Correction : préciser dans les Conventions que la façade MCP rend `isError: true` avec `ErreurMetier` en `structuredContent`. Le test de parité compare les `ErreurMetier`, pas les enveloppes.
- **B3 — Ordre de démarrage des services techniques.**
  - Les services peuvent démarrer avant les migrations du cœur, donc avant que les fonctions de file existent.
  - Correction (AD-16) : chaque service attend que `migrations_appliquees` contienne la version minimale déclarée dans son image, puis refuse de prendre une tâche en dessous.
- **B4 — Amendement NFR-18 encore différé.**
  - L'adresse liée à la session dépasse le PRD.
  - À reporter avant le gel du socle, sinon le test NFR-18 et AD-7 se contrediront.

---

## Résumé des corrections par AD

| AD | Action | Constats |
| --- | --- | --- |
| AD-1 | Ajouter l'unité de travail transactionnelle | C4 |
| AD-2 | Application des résultats, verrou de séance, événements entre machines | C3, H2, M5 |
| AD-3 | Fonctions SQL, reprise par type, `espace_id`/`seance_id`, états `annulee`/`gelee`, classes `interactive`/`lot`, sémaphore GPU en prédicat | C1, C3, H5, H7, H8 |
| AD-4 | Sous-ensemble zod, négociation de version, `ErreurTache` | H4, M6 |
| AD-5 | Montage en base, cœur seul auteur | H1 |
| AD-7 | Montage hors disque, liens physiques, montage restreint, adresses juste à temps, purge reportée | H1, H2, H6, M1 |
| AD-8 | Rôle par service, acteur système, file hors RLS | C2, C4 |
| AD-9 | Point d'accès interne authentifié par service et par bail, sans ticket dans la file | C2 |
| AD-12 | `NOTIFY` minimal, flux SSE relu par les services | H3 |
| AD-14 | Point de non-retour, publication figée, échéances avec état, courriels en outbox | C1, H9, M3, M4 |
| AD-15 | Origine `systeme` | M2 |
| AD-18 | Propriété par espace, réservation d'usage | H10 |
