---
type: revue
cible: ARCHITECTURE-SPINE.md (regie, 2026-10-02)
grille: good-spine checklist
relecteur: relecteur indépendant
date: 2026-10-02
---

# Revue du socle d'architecture regie — grille « good-spine »

## Verdict

Socle solide sur le cœur métier (parité, statuts, file, contrats, cloisonnement, secrets, gardes, publication sans double envoi), mais **pas encore prêt à être découpé en épopées** : l'enveloppe opérationnelle (dev / test / CI / livraison / exposition / supervision) n'est ni décidée ni différée, l'isolation de la capture dans le PVE principal laisse un trou de sécurité structurel, et plusieurs points de divergence réels (orchestration du pipeline et analyses audio/vidéo, priorité des tâches interactives, acteur « système » face au RLS, transport de l'enregistreur, points d'entrée des îlots) ne sont fixés par aucun AD.

Bilan : 2 critiques, 7 hauts, 10 moyens, 6 bas.

## Grille

| Critère | État | Constats |
| --- | --- | --- |
| Fixe les vrais points de divergence, sans en oublier | Partiel | H1, H2, H3, H4, H5, M1, M2, M9, M10 |
| Chaque Rule applicable et empêche la divergence annoncée | Partiel | H6 (AD-6), H2 (AD-3), M2 (AD-5), M6 (AD-3), M4 (AD-15) |
| Rien dans « Différé » ne laisse diverger deux unités | Partiel | H7, M5, M2 (modèle de langage / prompts) |
| Couvre les capacités du PRD | Presque | H7 (NFR-34), C1 (NFR-2 gate, NFR-29, NFR-13), M4 (FR-66), H1 (FR-57, FR-59, NFR-39) |
| Altitude « initiative » : toute dimension décidée, différée ou en question | Non | C1, C2, H7, M3, M8 |

---

## Critiques

### C1 — L'enveloppe opérationnelle dev / test / CI / livraison est absente

**Constat.** Le socle décide la production (AD-16) mais ne dit rien de :
- l'**environnement de développement** (le poste est un Mac : pas d'Arc, Podman en machine virtuelle, imbrication de conteneurs pour la capture, Python sur CPU ; comment lancer la pile en local ?) ;
- la **forge et la CI** (où tournent les suites « bloquantes à chaque commit » d'AD-17 et des Conventions ; quelle forge, compatible avec la règle 100 % libre ; où est publié le code source exigé par FR-67 / AGPL) ;
- la **construction et le stockage des images** épinglées par empreinte (qui construit, quel registre, signature) ;
- l'**environnement de test/préproduction** : NFR-2 exige « une version qui dépasse le seuil est refusée », NFR-1 / NFR-32 / NFR-4 exigent des tests de charge, NFR-31 un test de mise à jour sous file chargée ; ces vérifications demandent le vrai matériel (Arc) ; aucune porte de livraison n'est définie ;
- la **procédure de mise à jour et de retour arrière** (migrations en avant seulement ? image N-1 compatible avec le schéma N ?) ;
- le **mécanisme de NFR-29** (journal des changements MCP/API vérifié à chaque version) et le **journal d'exploitation** de NFR-13.

Sans décision, chaque épopée inventera son propre outillage (scripts de lancement, conteneurs de test, fixtures), et la règle « suites bloquantes » n'a aucun lieu d'exécution.

**Correction proposée.** Ajouter un **AD-19 — Environnements et chaîne de livraison** :
- trois environnements nommés : `dev` (poste, `compose.dev.yaml`, services IA sur CPU avec modèles réduits déclarés dans `modeles.dev.lock`, capture en conteneur rootless local), `ci` (forge libre auto-hébergée, p. ex. Forgejo + runner dans un LXC dédié du Proxmox, sans accès au LXC de prod), `prod` ;
- un **LXC `recette`** sur le même PVE (ou une fenêtre de recette sur le LXC prod, file vidée) où tournent, à chaque version candidate, le chronométrage NFR-2, le test de charge NFR-1/NFR-32/NFR-4, le test de mise à jour NFR-31 et la restauration NFR-13 ; la promotion vers prod n'est possible qu'avec le rapport signé de ce run ;
- registre d'images de la forge, images construites uniquement par la CI, référencées par empreinte dans `deploiement/compose.yaml` ;
- migrations **en avant seulement**, compatibles N-1 (expansion puis contraction sur deux versions), retour arrière = image précédente + restauration si la migration est destructive ;
- `CHANGELOG-API.md` généré avec la référence FR-65, test bloquant qui exige une entrée pour tout changement de contrat MCP/API ;
- `deploiement/journal-exploitation.md` (ou table `journal_exploitation`) pour les restaurations datées.
- Jeu de rushes de référence : emplacement hors dépôt (volume de la forge ou de `recette`), droits à l'image des personnes filmées documentés.

### C2 — Capture de code tiers dans le PVE principal : mode du LXC et accès au moteur de conteneurs non décidés

**Constat.** L'inscription est ouverte (FR-1) ; n'importe quel inscrit fait exécuter un Chromium piloté par un script qu'il fournit (FR-15, FR-16). AD-16 met regie dans **un LXC avec nesting** sur le **PVE principal** (qui héberge aussi Tdarr et le reste du parc), et AD-10 donne au service `capture` l'accès au moteur Podman. Le socle ne dit pas :
- si le LXC est **non privilégié** (un LXC privilégié avec nesting et `/dev/dri` est une évasion facile vers l'hôte) ;
- **sous quel utilisateur** tourne le Podman que pilote `capture`. Si c'est le même Podman rootless que celui qui fait tourner la pile, le socket donne au service `capture` le pouvoir de lancer un conteneur montant `/donnees`, rejoignant le réseau interne, ou lisant l'environnement du cœur (clé maîtresse) — ce qui annule AD-9 et AD-17 dès que `capture` est compromis ;
- les profils seccomp / AppArmor, limites cgroup (CPU, mémoire, PID) et durée maximale du conteneur jetable.

**Correction proposée.** Compléter AD-10 et AD-16 :
- LXC **non privilégié** obligatoire (`unprivileged: 1`, `nesting=1`, `keyctl=1`), mappage du gid `render` pour `/dev/dri` ; test d'installation qui échoue si le LXC est privilégié ;
- deux utilisateurs Unix dans le LXC : `regie` (pile compose) et `regie-bac` (Podman rootless **dédié aux conteneurs jetables**) ; `capture` ne reçoit que le socket de `regie-bac`, qui n'a ni `/donnees`, ni le réseau interne, ni l'environnement du cœur ; le dossier de sortie est un sous-dossier de `/donnees/taches/<tache_id>/` monté explicitement ;
- conteneur jetable : `--read-only`, `--cap-drop=ALL`, `--security-opt no-new-privileges`, seccomp par défaut de Chromium, `--pids-limit`, `--memory`, `--cpus`, durée maximale = délai de garde NFR-11 ;
- option à acter : placer `capture` + `proxy-capture` dans **un second LXC** (pas de `/dev/dri`, pas de volume `/donnees` complet), relié au premier par la file seulement — ce qui supprime aussi le risque pour Tdarr ;
- test NFR-19 étendu : un script tente d'atteindre le socket Podman, `/donnees`, l'API Proxmox (8006) et le réseau du LAN.

---

## Hauts

### H1 — L'orchestration du pipeline et les analyses audio/vidéo n'ont pas de propriétaire

**Constat.** La carte des capacités dit « coeur (orchestration) + transcription, langage, voix, rendu », mais plusieurs calculs lourds n'ont pas de place : détection de voix (FR-11, FR-56), netteté et stabilité des plans (FR-57), détection du tempo du morceau (FR-57), « voix la plus nette » (FR-59), mesure et atténuation voix/musique (NFR-39), détection des silences (FR-21, si non tirée de la transcription), journal de clics → zooms (FR-26). Le cœur ne peut pas les faire (AD-12, > 500 ms), et aucun service technique n'en est chargé. Rien ne fixe non plus la **liste des types de tâche**, leur **enchaînement par recette**, ni lesquels ont `besoin_gpu`. Les tâches « purge », « suppression », « export_donnees », « courriel » touchent les tables métier : elles ne peuvent pas être prises par un service technique (AD-2), donc le cœur est aussi un consommateur de la file — ce n'est écrit nulle part.

**Correction proposée.** Ajouter un **AD-20 — Pipeline de séance** :
- un registre `paquets/contrats/taches.ts` qui énumère chaque `type` de tâche avec : service consommateur, `besoin_gpu`, délai de garde NFR-11, priorité par défaut ;
- un nouveau type `analyse_media` (dans `rendu`, qui a déjà ffmpeg) : VAD, netteté, stabilité, tempo, niveaux sonores ; résultat typé versionné ;
- le graphe d'étapes par recette (`controle → transcription → analyse → decoupage (langage) → assemblage (cœur, pur) → rendu_allege`) déclaré dans `coeur/src/domaine/recettes`, seul endroit qui crée les tâches suivantes à la réception d'un résultat ;
- liste explicite des types consommés par le **travailleur interne du cœur** (purge, suppression, export_donnees, courriel, rafraichissement_confidentialite).

### H2 — L'équité de la file contredit les exigences de latence interactive

**Constat.** AD-3 trie d'abord par « utilisateur servi le moins récemment », puis par priorité, avec **un seul créneau GPU**. Or la correction à la voix (FR-62) demande une transcription courte + un appel au modèle de langage, et NFR-6 / FR-37 visent < 10 s et < 2 s. Une dictée de l'utilisateur A attendra derrière la transcription de 10 min de l'utilisateur B (plus servi récemment ou non), et derrière tout chargement/déchargement de modèle sur l'Arc. Le rendu allégé prioritaire d'AD-13 subit la même règle. La Rule n'empêche donc pas la divergence : chaque story ajoutera son contournement.

**Correction proposée.** Dans AD-3, définir deux **classes** : `interactive` (dictée, rendu allégé après correction, exploration de capture) et `lot`. Règle : une tâche `interactive` passe avant toute tâche `lot` sans tenir compte de l'équité, bornée (durée estimée < 60 s, au plus N par utilisateur en attente) ; l'équité NFR-4 s'applique à l'intérieur de chaque classe. Préciser que la transcription de dictée tourne sur **CPU** (modèle Whisper réduit déclaré dans `modeles.lock`) pour ne pas attendre le créneau GPU, et fixer le budget de NFR-6 étape par étape.

### H3 — RLS sans acteur « système » : planificateur et travailleurs n'ont pas d'identité

**Constat.** AD-8 impose `app.utilisateur_id` sur chaque transaction et une règle RLS sur chaque table liée à un utilisateur. Mais le planificateur (publications programmées, purge, rappels), l'ingestion des résultats de tâches, la suppression d'un espace annoncée et les notifications agissent **sans utilisateur**. Chaque story va inventer son contournement (`BYPASSRLS`, fonctions `SECURITY DEFINER`, usurpation de l'auteur), ce qui est exactement la fuite qu'AD-8 veut empêcher.

**Correction proposée.** Ajouter à AD-8 : un acteur `Systeme { motif, objetId }` construit uniquement par le planificateur et le travailleur interne ; un rôle PostgreSQL `regie_systeme` dont les règles RLS ne donnent accès qu'aux lignes désignées par `app.objet_id` (ou, à défaut, une liste fermée de fonctions `SECURITY DEFINER` dans `migrations/`, testées) ; l'audit enregistre `origine = systeme`. Préciser `SET LOCAL` (portée transaction) pour éviter la fuite de réglage dans le pool de connexions.

### H4 — Points d'entrée des îlots Svelte : session ou jeton ?

**Constat.** FR-46 : « aucune requête au MCP ni à l'API privée n'aboutit sans jeton valide ». Or les îlots Svelte (fil de relecture, corrections, envoi tus, SSE) appellent le serveur avec le **cookie de session**. Le socle ne dit pas si ces appels passent par `/api` (alors l'API accepte aussi la session, contre FR-46) ou par des routes propres à la façade interface (non nommées). Pas de règle anti-CSRF non plus (SameSite=Lax ne couvre pas tout, notamment les sous-domaines et les GET à effet).

**Correction proposée.** Dans AD-1 et les Conventions : routes de la façade interface sous `/i/<ressource>/<verbe>`, session seule, contrôle de l'en-tête `Origin` + jeton anti-CSRF sur toute méthode non sûre ; `/api` et `/mcp` jeton seul, cookie ignoré ; test de parité étendu aux trois préfixes ; le test des routes publiques couvre `/i` aussi.

### H5 — L'enregistreur de clics casse le « seul tube » sans règle de remplacement

**Constat.** AD-10 prévoit un screencast CDP relayé dans la page, avec clics et saisies relayés en sens inverse. C'est un canal **bidirectionnel temps réel** de plusieurs minutes, qui ne peut pas passer par la file PostgreSQL. Le paradigme (« la file PostgreSQL est le seul tube ») ne le permet pas, et rien ne dit qui relaie (le cœur en WebSocket ? un accès direct du navigateur au service `capture` ?), comment l'accès est authentifié, ni comment le cloisonnement s'applique. Deux stories (enregistreur, exploration) feront deux choix.

**Correction proposée.** Ajouter une exception nommée dans le Paradigme et dans AD-10 : canal WebSocket `/i/enregistreur/<seance_id>` **terminé par le cœur** (acteur, droits, quota de durée), relayé vers `capture` sur le réseau interne par un ticket à usage unique lié à la tâche (même mécanisme qu'AD-9) ; `capture` n'est jamais exposé ; le flux n'est pas enregistré ; durée maximale = délai de garde. Ajouter `WebSocket` aux Conventions (format des messages dans `paquets/contrats`).

### H6 — AD-6 : la garde de contraste ne peut pas être une fonction pure du montage

**Constat.** FR-28 exige un contraste ≥ 4,5:1 « sur leur fond ». Quand le style n'a pas de fond plein, le fond est l'image de la vidéo : la mesure demande des **pixels**. AD-6 déclare `gardes = (montage, bornes) → violations[]`, appelée par le cœur avant tout rendu : impossible sans décoder la vidéo, et le cœur ne fait pas de travail long (AD-12). Les stories vont soit ignorer la garde (non conforme), soit la recoder dans `rendu` (deux modules de gardes, contre la Rule).

**Correction proposée.** Scinder AD-6 en deux étages explicites : **garde statique** (pure, cœur : taille, zone sûre, bornes, contraste quand le style impose un fond ou un contour mesurable) et **garde visuelle** (tâche `mesure_gardes` dans `rendu`, qui échantillonne les images sous chaque texte et rend des mesures typées), le verdict restant calculé par **le même module** `coeur/src/domaine/gardes` à partir de ces mesures. Alternative plus simple à acter : imposer aux gabarits un fond ou un contour dont le contraste se calcule sans la vidéo, et le tester à l'aperçu du gabarit (FR-7).

### H7 — Exposition et supervision : NFR-34 contredit le « Différé »

**Constat.** NFR-34 exige une **sonde externe toutes les minutes** et un rapport mensuel ; le Différé écarte « l'observabilité distante ». Rien non plus sur : alerte de l'administrateur (disque plein, GPU absent, file bloquée, sauvegarde ratée, certificat expirant), nom de domaine et DNS dynamique sur la connexion domestique, ouverture de ports, certificat (ACME), choix de `proxy-tls`, rétention des journaux, page de maintenance annoncée (exclue de NFR-34).

**Correction proposée.** Ajouter un **AD-21 — Exposition et supervision** : `proxy-tls` = Caddy (ACME HTTP-01, Apache-2.0) derrière la redirection 443 du routeur, DNS dynamique documenté ; sonde externe libre (p. ex. Uptime Kuma hébergé **hors** du PVE — sinon la panne de la box est invisible), qui produit le rapport mensuel ; point `/sante` public (ajouté à la liste des routes publiques) qui vérifie base, file, coffre, espace disque ; alertes par courriel à l'administrateur pour : disque > 80 %, tâche GPU échouée pour cause matériel, sauvegarde ou restauration ratée, certificat < 14 j ; rétention des journaux (p. ex. 14 j, journald). Retirer « observabilité distante » du Différé ou le reformuler (« traces et métriques détaillées »).

---

## Moyens

### M1 — Deux moteurs de rendu des textes (lecteur et libass)

AD-13 fait dessiner sous-titres et textes par le lecteur du navigateur, et le rendu par libass. Deux implémentations du même style (animation mot à mot, retour à la ligne, polices) vont diverger, et l'utilisateur relit un aperçu qui ne ressemble pas au fichier publié.
**Correction :** un module unique `paquets/contrats/mise-en-page` qui calcule, depuis le montage, le gabarit et `bornes.json`, des boîtes positionnées en pixels (lignes, coupures, mots, instants) ; le lecteur et le générateur ASS ne font que dessiner ces boîtes ; test visuel qui compare une image du rendu allégé et une capture du lecteur à quelques instants.

### M2 — Reproductibilité (FR-30, NFR-12) mal tenue par la Rule d'AD-5

Température 0 et graine ne suffisent pas : llama.cpp n'est pas déterministe entre Vulkan/SYCL et CPU, ni avec plusieurs créneaux parallèles ou le cache de prompt ; Whisper sur GPU et sur CPU donne des horodatages différents. Le repli CPU (AD-11) casse donc la reproductibilité sans le dire. Les **prompts** n'ont pas de lieu ni de version.
**Correction :** le montage enregistre `backend` (gpu/cpu) et la version des prompts ; llama.cpp en `--parallel 1`, sans réutilisation de cache entre tâches ; prompts versionnés dans `paquets/contrats/prompts/` et référencés par empreinte dans le montage ; NFR-12 vérifié à backend constant ; règle : un « refaire » d'une séance garde le backend d'origine ou le signale.

### M3 — Clé maîtresse : lieu de stockage et sauvegarde non décidés

« Lue dans l'environnement du seul cœur » : en pratique un fichier d'environnement dans le LXC, donc **sauvegardé par PBS avec la base chiffrée** et copié hors site. Une copie de sauvegarde volée contient alors clé et secrets.
**Correction :** clé dans un fichier sur l'hôte PVE (ou un LXC coffre), monté en lecture seule dans le seul conteneur `coeur`, **exclu** des sauvegardes PBS ; copie hors ligne papier/clé USB documentée ; test de restauration NFR-13 qui réinjecte la clé par cette voie.

### M4 — Audit consultable par espace (FR-66) impossible avec la forme d'AD-15

L'entrée d'audit porte `utilisateur_id`, origine, jeton, objet, mais pas l'**espace** ; le propriétaire ne peut pas lire « le journal de son espace », et aucune règle RLS n'est définie pour la lecture de l'audit (l'utilisateur ne doit voir que le sien).
**Correction :** ajouter `espace_id` (opaque, sans clé étrangère) et `action` (code stable) ; règles de lecture RLS : soi-même, ou propriétaire de l'espace, ou admin pour les entrées `instance` ; index sur `(espace_id, cree_le)`.

### M5 — Différé « second hôte sans changer l'architecture » : faux en l'état

AD-7 repose sur un **volume partagé** monté dans les conteneurs, AD-17 sur un réseau interne d'un seul hôte. Déporter les services IA vers un second hôte impose un système de fichiers réseau ou un transfert de fichiers, et une sortie réseau entre hôtes : ce sont des décisions d'architecture. Des stories qui codent des chemins locaux en dur rendraient le repli coûteux.
**Correction :** inscrire dans AD-7 que les services ne lisent que les chemins reçus dans la tâche, relatifs à une racine configurable (`RACINE_DONNEES`) ; écrire dans le Différé le déclencheur et l'option retenue (NFS en lecture seule pour les rushes + écriture dans `taches/`, réseau WireGuard entre hôtes).

### M6 — Sémaphore GPU : Tdarr, manque de VRAM et blocage

Le verrou consultatif ne coordonne pas **Tdarr** ; un manque de VRAM causé par Tdarr fera passer des tâches `echouee` sans relance automatique (FR-32), donc des échecs visibles par les créatrices sans faute de leur part. Un processus bloqué qui garde sa connexion garde aussi le verrou : GPU bloqué jusqu'à intervention. Le rendu `h264_vaapi` utilise l'Arc : est-il `besoin_gpu` ?
**Correction :** fixer les heures de Tdarr (ou un plafond de flux) dans AD-16 ; classer une erreur « mémoire GPU insuffisante » comme **reprise** (comme un bail expiré, une seule fois) ; à dépassement du délai de garde, le service se termine (le verrou tombe avec la connexion) ; dire explicitement que l'encodage VAAPI n'est pas `besoin_gpu` (moteur média distinct) ou l'inclure.

### M7 — Le proxy de capture refuse les applications de Benjamin hébergées sur son réseau

UJ-2 vise Établia, probablement hébergée sur le même Proxmox : son nom résout vers une adresse privée (ou vers l'IP publique avec boucle NAT). AD-10 refuse toute adresse privée : le parcours phare échoue.
**Correction :** liste d'exceptions d'instance (hôte + IP privée précise), réglée par l'administrateur seul, réservée aux espaces de l'administrateur ; le proxy résout puis vérifie l'IP au moment de la connexion (anti-DNS rebinding) ; test NFR-19 inchangé pour tous les autres espaces.

### M8 — Volumétrie, rétention et périmètre de sauvegarde

20 Go par utilisateur × 20 actifs, plus les rendus, plus les dossiers de tâches : plusieurs centaines de Go, copiés hors site sur une connexion domestique. Le socle ne dit pas si les rushes (éphémères, ≤ 60 j) sont sauvegardés, ni la taille du volume, ni la purge de `/donnees/taches/`.
**Correction :** décider le périmètre (proposition : base + montages + rendus + gabarits + musique ; rushes exclus, perte assumée et dite dans la politique de confidentialité) ; dimensionner le volume et l'alerte disque (H7) ; effacer `taches/<id>` à la fin de la tâche et par échéance en cas de plantage.

### M9 — Versionnement de l'API et du MCP (NFR-29)

AD-4 versionne les contrats de tâches, pas la surface publique. Rien ne dit comment un client distingue deux versions de l'API ou d'un outil MCP.
**Correction :** préfixe `/api/v1/…`, version d'outil MCP dans le registre (dépréciation annoncée dans la description de l'outil), la version N-1 servie pendant une version ; lien avec le `CHANGELOG-API` de C1.

### M10 — Nature du conteneur `smtp-sortant` et secret du relais

Les identifiants du relais SMTP sont au coffre (memlog), mais un MTA (Postfix…) dans un conteneur a besoin de ces identifiants en configuration : le secret sort du cœur, contre AD-9. Si `smtp-sortant` n'est qu'un relais sans identifiants, alors le cœur parle directement au relais externe et la règle de sortie d'AD-17 est fausse.
**Correction :** trancher : soit le cœur (travailleur interne) envoie en SMTP authentifié directement au relais de l'administrateur et `smtp-sortant` disparaît (AD-17 : le cœur a une sortie limitée au relais), soit `smtp-sortant` devient un service technique qui prend des tâches `courriel` et obtient les identifiants par ticket (AD-9).

---

## Bas

### L1 — Memlog incohérent avec le socle sur VM / LXC
Le memlog garde « Hébergement bêta : VM » et « PBS (VM et volume), restauration dans une VM jetable », remplacés plus loin par la décision LXC. **Correction :** marquer ces lignes `(superseded)` en renvoyant à la décision LXC.

### L2 — Versions de la pile datées dans le futur ou en RC
Node 26 n'est LTS que le 2026-10-28 ; drizzle-orm en 1.0.0-rc.5 en production ; vitest « dernière stable au premier commit » n'est pas épinglé. **Correction :** épingler vitest, noter la date de bascule Node, et dire la règle de montée de version (RC acceptée tant que les migrations sont en SQL à la main).

### L3 — Correspondance route / outil ambiguë
`/api/<ressources>` (pluriel) et `<domaine>_<verbe>` « même nom » : `videos/garder` ↔ `video_garder` ? **Correction :** donner la règle exacte (domaine au singulier dans les deux, p. ex. `/api/video/garder` ↔ `video_garder`) et la faire vérifier par le test de parité.

### L4 — Formule d'estimation (AD-3, NFR-3) ambiguë
« ratio × position dans la file » ne tient compte ni de l'équité par utilisateur ni du créneau GPU unique. **Correction :** estimer par simulation de l'ordre de prise réel (somme des `estime_ms` des tâches qui passeront avant, selon la règle d'équité et le créneau GPU), et garder la journalisation estimé/réel.

### L5 — Conversion des tests Playwright/Cypress (FR-16) sans lieu
Pas dit si la conversion est dans le cœur (domaine pur) ou dans `capture`. **Correction :** convertisseur pur dans `paquets/contrats/scripts` (AST → étapes), utilisé par le cœur à l'import, vérification des hôtes comprise.

### L6 — Publication vers Meta / TikTok : envoi du fichier
Certaines API récupèrent la vidéo par URL (adresse signée publique, NFR-18) ; d'autres acceptent un téléversement. Le choix change l'exposition et la vérification de domaine (TikTok). **Correction :** préciser dans AD-14 : téléversement depuis `publication` partout où l'API le permet, adresse signée liée à la publication sinon, avec la durée et le domaine vérifié.

---

## Ce qui est bien tenu

- AD-1 (parité par une couche de services, exceptions dans un seul fichier, test de parité) et AD-2 (machines à états uniques, rôle `regie_services` sans tables métier) ferment les deux divergences majeures du produit.
- AD-3 distingue proprement reprise (NFR-7) et nouvelle tentative (FR-32), et prévoit une suite commune TS/Python.
- AD-4 (zod → JSON Schema → pydantic généré, test de dérive) est vérifiable.
- AD-9 (tickets à usage unique, dépôt du jeton OAuth renouvelé) et AD-14 (`envoi_en_cours` validé avant l'appel, « résultat inconnu » plutôt que double envoi) sont précis et testables.
- AD-15 (audit sans clé étrangère, déclencheur d'ajout seul) concilie FR-53 et NFR-21.
- AD-11 / AD-17 tiennent la règle 100 % libre (licences dans `modeles.lock`, suite licences bloquante, GPL contenue dans son conteneur).
