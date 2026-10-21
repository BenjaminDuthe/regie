---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - 'docs/planning/prds/prd-regie-2026-10-02/prd.md'
  - 'docs/planning/architecture/architecture-regie-2026-10-02/ARCHITECTURE-SPINE.md'
  - 'maquette/public/relire.html'
  - 'maquette/public/capture.html'
  - 'maquette/public/editeur.html (ajoutée le 2026-10-18)'
  - 'MANDAT.md (Recentrage du 2026-10-18)'
---

# regie - Epic Breakdown

## Overview

Ce document découpe en épopées et en histoires livrables les exigences de regie V1 : le PRD du 2026-10-02, le socle d'architecture (AD-1 à AD-21) et les deux maquettes validées (« Relire » et capture d'applis web), qui tiennent lieu de spécification UX.

Termes : ceux du glossaire du PRD, sans synonyme.

## Recentrage du 2026-10-18 — plan de livraison (prime sur la suite)

Le grill du 2026-10-18 recentre la V1 sur un seul utilisateur et une première tranche en production : une démo d'app filmée par script, éditée sur ordinateur, publiée ou programmée sur Instagram (MANDAT, « Recentrage du 2026-10-18 » ; PRD §0 ; socle, « Amendement du 2026-10-18 »). Cette section ordonne les histoires. Elle en ajoute de nouvelles (épopées 0 et 9, histoires 1.14, 3.10 et 3.11), en réduit certaines et renvoie le reste en V1.1. Les histoires plus bas restent la spécification détaillée. Quand elles parlent d'espaces, de membres, d'inscription ou de quotas, on lit « la marque Établia de Benjamin » et l'on écarte ce qui ne sert qu'à plusieurs comptes.

### Ordre de la V1

| # | Histoire | Ajustement du 2026-10-18 |
|---|----------|--------------------------|
| 1 | 0.1 Réparer Authentik et créer l'application « regie » | nouvelle |
| 2 | 0.2 Le LXC `regie` sur `pve-media` | nouvelle |
| 3 | 0.3 `regie.etablia.fr` derrière nginx | nouvelle |
| 4 | 0.4 La CI tourne sur Forgejo | **faite** côté Forgejo (2026-10-20 : miroir, runner, premier run vert) ; reste à Benjamin le jeton de statut GitHub et la protection de `main` |
| 5 | 1.1 Amorcer le dépôt, la CI et la première page | **faite** (238c584) ; CI verte sur Forgejo le 2026-10-20 |
| 6 | 1.2 Une première page sûre, lisible et accessible | **faite** (2026-10-20) : CSP en en-tête, jetons UX-DR1, en-tête commun, lien vers le code source du commit en service |
| 7 | 1.3 Des suites de conformité qui bloquent chaque commit | **faite** (2026-10-20) : licences, mots interdits, appels sortants dans `npm run ci` ; reportés : SBOM de l'image (avec le workflow d'image) et connexions observées (avec les conteneurs) |
| 8 | 1.4 Migrations contrôlées, coffre et démarrage sûr | **faite** (2026-10-20) : migrations SQL en une transaction avec SHA-256 (refus si un fichier appliqué change), RLS forcée par `marque_id`, `regie_admin` fondu dans `regie_coeur`, clé maîtresse en fichier de secret + HKDF + AES-256-GCM versionné avec rotation, masquage des secrets dans pino, `/sante` (base, coffre, disque), démarrage qui refuse en nommant la cause ; tests PostgreSQL réels par `npm run test:postgres` (ignorés dans `npm run ci`, pas de PostgreSQL dans la CI Forgejo) ; reportés : unités Quadlet et ordre de démarrage, ports 443/80, rapport GPU (AR-20), commande de recette `regie-recette` (LXC), rôles par service technique (avec leurs histoires), `/sante` file, sauvegarde et GPU (2.1, 9.2) |
| 9 | 1.14 Se connecter par Authentik | **faite** (2026-10-21) : OIDC maison (code + PKCE S256, state, nonce, id_token RS256/ES256 vérifié, découverte et JWKS), sessions en base (SHA-256 seul, RLS, cookie `__Host-`), garde Astro et liste unique des routes publiques testée contre les pages, pages légales, `exigerAuthRecente` (max_age=600), journal d'audit chaîné, POST /deconnexion protégé ; reportés : application Authentik à créer par Benjamin, mentions légales `⟨À CONFIRMER⟩`, /mcp complet (1.11, 1.12), fichiers de /v/* (3.x), consultation du journal (1.13) |
| 10 | 1.9 Mon espace personnel et mes espaces de marque | **faite** (2026-10-21) : utilisateur et espace personnel (dont la personne est propriétaire) créés à la première connexion, espace de la marque Établia, espace actif dans la session et rappelé dans l'en-tête, bascule en un geste (POST protégé par l'Origin, journalisée), RLS marque + `app.utilisateur_id` (rien sans la variable), tests de cloisonnement A/B sur PostgreSQL réel ; reportés : création d'espaces partagés et invitations (hors V1 réduite), sélecteur d'espace pour d'autres marques (une seule marque en V1) |
| 11 | 1.11 Une API privée à jetons, en parité avec l'interface | **faite** (2026-10-21) : jetons d'API personnels (`regie_pat_<marque>_<secret>`, seul le SHA-256 en base, valeur montrée une fois, portée lecture/écriture, espaces choisis, expiration ≤ 90 jours imposée par la base, révocation immédiate, création soumise à `exigerAuthRecente`), page Jetons, registre unique des actions (`espace.lister`, `jeton.lister`, `jeton.revoquer`, `jeton.creer`) appelé par l'interface et par `POST /api/v1/<domaine>/<verbe>` (Bearer, réponses `{ok, donnees}` / `{ok:false, erreur}`), `ErreurMetier`, audit de chaque action et de chaque refus avec son origine, exceptions de parité dans un fichier unique, référence générée `docs/api/reference.md` avec test de dérive, `CHANGELOG-API` ; reportés : limitation de débit (429) faute de clientèle à protéger en V1, actions métier (viendront avec leurs histoires, dans le même registre), outils MCP (1.12) |
| 12 | 1.12 Brancher son Claude sur regie | **faite** (2026-10-21) : serveur MCP sans état sur `/mcp` ; OAuth 2.1 (PKCE S256, DCR bornée, `iss` RFC 9207, accès 30 min, refresh tournant avec détection de réutilisation) ; consentement sous la session Authentik avec choix de l'espace et des droits ; écran « Connexions de Claude » avec révocation ; champ `non_fiable` prêt ; aucun appel sortant ; reportés : CIMD (voir ARBITRAGES 1.12) |
| 13 | 1.13 Consulter le journal d'audit | **faite** (2026-10-21) : page `/journal` ; chacun voit ses actions, le propriétaire celles qui touchent à son espace, l'administrateur tout le journal de la marque avec le seul genre des objets des autres ; filtres période (jours de Paris), origine (interface, MCP, API) et objet ; chaîne vérifiée sur toute la marque et résultat affiché ; reportés : vue inter-marques et SELECT interdit du rôle `regie_admin` sur les contenus, vérification nocturne programmée (2.2) |
| 14 | 2.1 Une file de traitement durable et équitable | **faite** (2026-10-21) : file PostgreSQL (`taches`, migration 0006) prise par `FOR UPDATE SKIP LOCKED` sous bail de 60 s renouvelé toutes les 15 s (bail ≥ 3 renouvellements), classes interactive avant lot puis FIFO sans équité entre comptes, un seul GPU (index unique partiel), tentatives avec délai exponentiel (15 s, plafond 1 h), historique des tentatives, reprise après arrêt (une reprise, puis `RESULTAT_INCONNU` ; jamais après le point de non-retour ni pour une reprise interdite), délai de garde par type (`DELAI_DEPASSE`), application des résultats une seule fois (NOTIFY + balayage de 30 s), registre des types dans `@regie/contrats`, tâche d’essai testée, RLS par marque ; reportés : exécutants réels (histoires suivantes), suite commune TypeScript/Python, passerelle `application-resultats` côté Python |
| 15 | 2.2 Des échéances qui ne se perdent pas | **faite** (2026-10-21) : tables `echeances` et `travaux_internes` (migration 0007, RLS par marque) ; `programmerEcheance` s'écrit dans la transaction de l'action métier ; planificateur démarré en dernier (rattrapage immédiat, passe chaque minute) : moins de 2 h de retard toujours rattrapée, au-delà selon la règle du type (`ECHEANCE_PERIMEE` sinon), un seul travail par échéance même à deux instances ; récurrences de nuit à l'heure de Paris (changements d'heure testés) : purge des sessions expirées, purge des clients OAuth inutilisés, vérification de la chaîne d'audit avec trace (tête, lignes, résultat) et `CHAINE_ROMPUE` + log d'erreur en cas d'écart ; reportés : export externe de la chaîne (arbitrage), alerte de rupture dans l'interface (2.6), gestionnaires de `publication` et `rappel` (histoires de publication) |
| 16 | 2.5 Suivre ma séance dans la file | **faite** (2026-10-21) : page `/taches` + flux SSE `/flux/taches` (même origine, CSP inchangée, 3 flux par personne, 15 min max, session relue à chaque tour) ; position et fin estimée (médiane des 50 dernières durées, sinon durée typique du type) en heure de Paris arrondie à 5 min ; actions `tache.lister` et `tache.lire` (API + MCP) ; cause et action conseillée d'une tâche en échec ; repli `<noscript>` par rechargement ; reportés : séance de rushes (n'existe pas encore), relance (2.6) |
| 17 | 2.6 Être prévenue et relancer une étape en échec | **faite** (2026-10-21) : table `notifications` (migration 0008, RLS par marque) alimentée par un déclencheur à l'échec définitif (une fois, avec étape, cause, action) ; actions `tache.relancer`, `notification.lister`, `notification.acquitter` (API + MCP + audit) ; page `/taches` : notifications, historique des tentatives, bouton « Relancer » sans renvoi des rushes ; rupture du journal signalée à l'administrateur ; reportés : courriel (V1.1), rushes non purgés, vidéo qui retrouve son statut, série prête (2.12) |
| 18 | 2.7 Un gabarit de départ, des gardes et une mise en page communes | **faite** (2026-10-21) : `deploiement/bornes.json` (seuils versionnés) lu par `domaine/bornes.ts` ; modules purs `gardes` ((montage, mesures, bornes) → violations : contraste < 4,5:1, texte < 48 px sur 1920, hors zone sûre 880×1220 en (0, 220)), `mise-en-page`, `gabarit`, `polices` (4 polices libres OFL-1.1 déclarées dans `licences-tiers.json`) ; table `gabarits` (migration 0009, RLS par marque et espace) ; gabarit de départ neutre donné à chaque espace ; actions `gabarit.lister`, `gabarit.personnaliser` (API + MCP + audit) ; page `/gabarit` (trois choix) ; refus `GARDE_NON_RESPECTEE` 422 sans moyen de forcer ; reportés : couleurs, polices et logo réels d'Établia (arbitrage), fichiers de police (rendu), test image rendu ⇔ lecteur (3.1) |
| 19 | 2.8 Définir mon gabarit complet et le prévisualiser | **faite** (2026-10-21) : éditeur `/gabarit` complet (2 à 4 couleurs, polices des titres et des sous-titres, style, carte de fin, légende, mots-clics, nouveau gabarit) ; actions `gabarit.creer`, `gabarit.definir`, `gabarit.apercu` (API + MCP, les deux premières au journal) ; aperçu SVG dessiné sur le serveur (`/gabarit/apercu.svg`, trois scènes d'un brouillon d'exemple, zone sûre tracée), mis à jour en direct ; enregistrement hors garde refusé en 422 (scène, code temporel, élément, mesure, seuil) ; gabarit Établia neutre (arbitrage 2.7), aucune limite de 3 gabarits ; reportés : import et rastérisation du logo SVG (AR-12, monogramme provisoire), choix du gabarit à l'envoi d'une séance, suppression d'un gabarit |
| 20 | 4.1 Déclarer mon application et prouver mes hôtes | **faite** (2026-10-21) : table `applications` (migration 0010, RLS par marque et espace visible, nom unique par espace, 1 à 20 hôtes) ; module pur `@regie/contrats` `hotes` (hôtes en liste stricte : minuscules, punycode, refus des jokers, ports, adresses IP sous toutes leurs écritures, noms locaux) ; actions `application.lister|declarer|modifier` (API + MCP + journal, 422 `HOTE_REFUSE` qui nomme l'hôte fautif) ; page `/demos` « Démos d'app » en 1, 2 et 3 colonnes à 360, 900 et 1240 px sous l'en-tête collant ; sans preuve de contrôle du domaine (ajustement du 2026-10-18) ; reportés : retrait d'une application, hôtes générés depuis un parcours enregistré |
| 21 | 4.2 Une capture enfermée, loin du reste de regie | **faite** (2026-10-21) : proxy de sortie CONNECT (liste blanche par laissez-passer signé, refus des plages privées, de l’IP du foyer, des ports hors 443 et du rebinding DNS ; destinations tracées 1 an), conteneur Chromium jetable (cap-drop=ALL, lecture seule, bac à sable actif, no-new-privileges, WebRTC/QUIC/DoH coupés, réseau interne seul), tâche `capture` (mini capture de l’accueil), Containerfiles et unités Quadlet non installées ; reportés : preuve de contrôle du domaine, hôte+IP privée admin, essai réel du bac à sable (arbitrage 4.2) |
| 22 | 4.3 Un compte de démo au coffre et un test de connexion | **faite** (2026-10-21) : compte de démo au coffre chiffré (identifiant et mot de passe jamais réaffichés ni journalisés, seulement remplaçables ; saisie après connexion récente, exception de parité `compte.deposer`), passerelle de secrets (matrice type de tâche / type de secret, bail vérifié), tâche `test_connexion` dans la capture isolée (mini capture de l’accueil, ou étape fautive : ouvrir, trouver, saisir, valider), actions `compte.etat` et `compte.tester` en parité API/MCP ; reportés : routes HTTP `/interne/secrets/*` (passerelle dans le cœur), essai réel Chromium |
| 23 | 4.4 Lire et corriger les étapes d'un script | inchangée |
| 24 | 4.5 Jouer et filmer mon script | inchangée |
| 25 | 4.8 Demander un script à Claude | inchangée ; première façon d'obtenir un script en V1 |
| 26 | 4.6 Une démo recadrée et zoomée sur chaque clic | inchangée |
| 27 | 4.7 Une voix de synthèse locale qui commente ma démo | sous-titres tirés du texte de la voix |
| 28 | 2.12 Voir mon brouillon dans une page d'aperçu | aperçu d'une démo |
| 29 | 3.10 Éditer les textes, l'ordre et les durées d'une vidéo | nouvelle (FR-73) |
| 30 | 3.11 Régler les animations et regénérer le rendu | nouvelle (FR-73) |
| 31 | 2.13 Changer de gabarit sans toucher au passé | inchangée |
| 32 | 3.5 Choisir mon accroche, ma couverture et ma prise | réduite à la couverture (FR-25) ; l'accroche se règle dans l'éditeur |
| 33 | 3.7 Ma légende et mes hashtags | inchangée |
| 34 | 3.8 Télécharger ma vidéo prête | inchangée |
| 35 | 3.9 Ma bibliothèque de vidéos | inchangée |
| 36 | 4.11 Rejouer ma démo à chaque mise en production | inchangée |
| 37 | 7.1 L'administrateur ouvre la publication | clés de l'application Meta dans Paramètres ; pas de droit de publication par espace |
| 38 | 7.6 Publier sur Instagram et Facebook | Instagram seul en V1 ; la Page Facebook passe en V1.1 |
| 39 | 7.3 Publier une vidéo maintenant, jamais deux fois | inchangée |
| 40 | 7.4 Programmer, déplacer ou annuler une publication | inchangée |
| 41 | 7.5 Suivre le résultat et rejouer un échec | échec visible dans l'interface ; courriel en V1.1 |
| 42 | 9.1 Tout piloter depuis Claude | nouvelle |
| 43 | 9.2 Une sauvegarde quotidienne, restaurée avant la production | nouvelle ; remplace 8.4 pour la V1 |
| 44 | 9.3 La recette sur le compte Instagram de test | nouvelle |
| 45 | 9.4 La première vraie vidéo Établia | nouvelle ; clôt la V1 |

### V1.1, dans cet ordre

1. **Autres réseaux** : 7.6 (Page Facebook), 7.7 TikTok (en premier si le temps manque), 7.2 YouTube.
2. **Rushes et montage automatique** : 2.3, 2.4, 2.9, 2.10, 2.11, 2.14, 3.5 (accroches et prises), 3.6, puis l'épopée 5 (5.1 à 5.6).
3. **Relecture au téléphone** : 3.1, 3.2, 3.3, 3.4.
4. **Capture, autres sources de script** : 4.9, 4.10.
5. **Plusieurs personnes** : 1.6, 1.7, 1.8, 1.10, puis l'épopée 6 (6.1, 6.2).
6. **Données personnelles et exploitation** : 8.1, 8.2, 8.3, 8.4 (test mensuel), 8.5 (sonde Uptime Kuma).

**Retirée** : 1.5, remplacée par 1.14 (le second facteur est porté par Authentik).

## Epic 0: Infrastructure de la V1

Benjamin dispose d'une identité unique (Authentik), d'un conteneur LXC dédié sur `pve-media`, d'une adresse publique en HTTPS et d'une CI qui tourne chez lui. **Aucune action d'infrastructure ne se fait sans le feu vert de Benjamin au moment de la faire** ; chaque histoire décrit l'action, la montre, puis l'exécute après accord.

### Story 0.1: Réparer Authentik et créer l'application « regie »

As a Benjamin,
I want qu'Authentik reparte sur le plan d'adresses actuel et connaisse regie,
So that l'interface de regie ne s'ouvre qu'à moi, avec mon second facteur.

**Acceptance Criteria:**

**Given** le CT 115 `authentik` arrêté sur `pve-media`, configuré en `192.168.1.115/24` avec la passerelle `192.168.1.200`
**When** Benjamin donne son accord
**Then** `net0` passe sur une adresse libre en `192.168.20.x/24` avec la passerelle du réseau actuel, le conteneur démarre et son interface répond sur le réseau local
**And** l'ancienne configuration est notée dans `deploiement/infra/authentik.md` pour pouvoir revenir en arrière

**Given** Authentik relancé
**When** on se connecte avec le compte de Benjamin
**Then** un second facteur (TOTP ou WebAuthn) est exigé

**Given** l'administration d'Authentik
**When** on crée le fournisseur OIDC et l'application « regie »
**Then** le client est confidentiel, l'adresse de retour est `https://regie.etablia.fr/auth/retour`, et seul le groupe de Benjamin y a accès
**And** l'identifiant et le secret du client vont dans Vaultwarden, jamais dans le dépôt (NFR-14)

### Story 0.2: Le LXC `regie` sur `pve-media`

As a Benjamin,
I want un conteneur LXC dédié à regie, avec l'accès à l'Arc B570,
So that regie tourne isolé du reste du serveur et peut rendre ses vidéos sur la carte graphique.

**Acceptance Criteria:**

**Given** `pve-media` (192.168.20.200) et l'accord de Benjamin
**When** le LXC `regie` est créé
**Then** il est en Debian 13, non privilégié, avec le nesting activé, une adresse fixe en `192.168.20.x`, et sa définition est versionnée dans `deploiement/infra/lxc-regie.md`

**Given** le LXC `regie`
**When** on y installe Podman rootless avec linger, Quadlet et cgroups v2
**Then** un conteneur de test démarre au boot de l'hôte sans session ouverte (NFR-7)

**Given** `/dev/dri` transmis avec le `gid` du groupe `render`
**When** un conteneur de test encode une vidéo avec ffmpeg en QSV ou VAAPI
**Then** l'encodage passe par l'Arc ; en cas d'échec, la cause est notée et le repli sur processeur est documenté (Différé du socle)

**Given** le pare-feu Proxmox du LXC
**When** on teste les sorties
**Then** seuls Internet, nginx (CT 101), Authentik (CT 115) et la cible de sauvegarde sur `pve-nipogi` sont joignables ; le reste du réseau local est refusé

### Story 0.3: `regie.etablia.fr` derrière nginx

As a Benjamin,
I want ouvrir regie sur Internet à une adresse en HTTPS,
So that je l'utilise de partout et que Meta puisse lire les vidéos à publier.

**Acceptance Criteria:**

**Given** l'enregistrement DNS `regie.etablia.fr` vers l'IP publique du foyer et l'accord de Benjamin
**When** le site est ajouté au nginx du CT 101
**Then** il obtient un certificat Let's Encrypt renouvelé automatiquement et redirige le port 80 vers 443

**Given** une requête sur `regie.etablia.fr`
**When** nginx la relaie vers le LXC `regie`
**Then** les en-têtes de sécurité (HSTS, `X-Content-Type-Options`, `Referrer-Policy`) sont posés, les limites de débit s'appliquent et le journal d'accès ne contient aucune chaîne de requête
**And** la configuration est versionnée dans `deploiement/nginx/regie.conf`

**Given** le cœur pas encore déployé
**When** on ouvre `https://regie.etablia.fr/sante`
**Then** une page d'attente répond, sans exposer d'autre service du serveur

### Story 0.4: La CI tourne sur Forgejo

As a développeur de regie,
I want que chaque commit poussé sur GitHub soit testé sur mon Forgejo,
So that la CI reste chez moi et le dépôt public reste la référence.

**Acceptance Criteria:**

**Given** le Forgejo du CT 130 et l'accord de Benjamin
**When** le dépôt `BenjaminDuthe/regie` y est ajouté en miroir de GitHub
**Then** chaque commit poussé sur GitHub arrive sur Forgejo en moins de 10 minutes

**Given** un runner Forgejo Actions dédié, sans accès aux secrets de production
**When** un commit arrive
**Then** `.forgejo/workflows` lance `npm run ci` (types, tests, scan de secrets) et le résultat est visible sur Forgejo

**Given** une branche dont la CI échoue
**When** on prépare la fusion sur `main`
**Then** l'échec est visible avant la fusion

## Histoires ajoutées aux épopées 1 et 3 (2026-10-18)

### Story 1.14: Se connecter par Authentik

As a Benjamin,
I want me connecter à regie avec mon compte Authentik,
So that je n'ai ni mot de passe de plus, ni second facteur à gérer dans regie.

**Acceptance Criteria:**

**Given** une page de l'interface sans session valide
**When** je l'ouvre
**Then** je suis renvoyé vers Authentik (code d'autorisation + PKCE S256, `state` et `nonce` vérifiés), puis ramené sur la page demandée (FR-72)

**Given** le retour d'Authentik
**When** le jeton d'identité est validé (émetteur, audience, signature, expiration)
**Then** une session est créée en base, portée par un cookie `__Host-` `HttpOnly; SameSite=Lax; Secure`, et révocable

**Given** une action sensible (saisir une clé, connecter un compte réseau, créer un jeton)
**When** la dernière authentification Authentik date de plus de 10 min
**Then** regie redemande une authentification (`max_age`) avant d'agir

**Given** `/mcp`, les adresses signées des vidéos, les pages légales et `/sante`
**When** on les appelle sans session
**Then** ils ne renvoient pas vers Authentik ; `/mcp` exige un jeton Bearer valide (FR-46), les adresses signées leur signature de moins d'une heure

**Given** la liste des routes publiques dans un seul fichier
**When** la CI tourne
**Then** un test la compare aux routes servies et échoue sur toute route publique non déclarée

**Given** la politique de confidentialité et les conditions d'utilisation
**When** on les ouvre sans session
**Then** elles sont servies par regie elle-même, en français (FR-51, exigées par Meta)

**Given** une connexion, un échec ou une déconnexion
**When** l'action se termine
**Then** une ligne est ajoutée au journal d'audit chaîné, sans secret (NFR-21)

### Story 3.10: Éditer les textes, l'ordre et les durées d'une vidéo

As a Benjamin,
I want ouvrir une vidéo dans un éditeur par scènes et y changer tous les textes, l'ordre et la durée des scènes,
So that la démo dit exactement ce que je veux, sans repasser par une capture.

Spécification UX : la maquette `maquette/public/editeur.html`, validée le 2026-09-08, adaptée aux scènes d'une démo filmée.

**Acceptance Criteria:**

**Given** une vidéo prête ou un brouillon sur ordinateur
**When** je l'ouvre dans l'éditeur
**Then** je vois ses scènes dans l'ordre, chacune avec sa durée, ses textes (accroche, textes à l'écran, sous-titres, carte de fin) et un aperçu à jour dans le navigateur (FR-73, AD-13)

**Given** une scène
**When** je modifie un texte, sa durée, ou que je la déplace, la duplique ou la retire
**Then** l'aperçu suit sans rendu complet, et l'enregistrement crée une nouvelle version immuable du montage (AD-5)

**Given** un texte qui sort de la zone sûre ou devient illisible sur le gabarit
**When** j'enregistre
**Then** la garde l'indique sur la scène fautive et la vidéo ne passe pas « prête » tant que ce n'est pas corrigé (FR-28, AD-6)

**Given** une vidéo qui a déjà une publication partie
**When** je l'édite
**Then** la publication partie reste liée à l'ancienne version ; seules les publications futures prennent la nouvelle

**Given** Claude connecté
**When** il lit le montage puis change un texte, une durée ou l'ordre par le MCP
**Then** le résultat est le même que dans l'interface (FR-47, FR-64)

### Story 3.11: Régler les animations et regénérer le rendu

As a Benjamin,
I want choisir et régler les animations de chaque texte et de chaque scène, puis regénérer la vidéo,
So that le rythme et l'habillage me conviennent avant de publier.

**Acceptance Criteria:**

**Given** une scène dans l'éditeur
**When** je choisis une animation d'entrée ou de sortie pour un texte, ou une transition entre deux scènes, et que je règle sa durée et son délai
**Then** l'aperçu la joue, et seules les animations du catalogue du moteur sont proposées

**Given** un zoom automatique tiré du journal des clics
**When** je le décale, change son niveau ou le retire
**Then** l'aperçu suit (FR-26)

**Given** une version éditée
**When** je lance « regénérer »
**Then** une tâche de rendu entre dans la file, sa progression est visible (FR-31), et la vidéo rendue fait foi à la place de l'aperçu (AD-13)

**Given** le même montage, le même matériel et le même build
**When** on le rend deux fois
**Then** les deux fichiers sont identiques (FR-30)

**Given** Claude connecté
**When** il règle une animation ou lance la regénération par le MCP
**Then** le résultat est le même que dans l'interface (FR-47)

## Epic 9: Mise en production de la V1

La V1 est en production : Claude pilote tout, les données sont sauvegardées et restaurables, la recette est passée sur un compte de test, et la première vraie vidéo Établia est partie.

### Story 9.1: Tout piloter depuis Claude

As a Benjamin,
I want faire depuis Claude tout ce que je fais dans l'interface, sauf toucher aux secrets,
So that je produis une démo de bout en bout sans ouvrir regie.

**Acceptance Criteria:**

**Given** le registre de parité
**When** la CI tourne
**Then** chaque action de l'interface a son outil MCP et son point d'API, sauf les exceptions déclarées (FR-47) ; aucun outil ne lit, n'écrit ni ne renvoie un secret

**Given** Claude connecté par OAuth
**When** je lui demande « fais une démo de la création d'une facture dans Établia et programme-la demain à 18 h sur Instagram »
**Then** il obtient le script, le fait jouer, édite les textes, lance le rendu et crée la publication programmée, par les seuls outils MCP

**Given** la référence du MCP
**When** une version est livrée
**Then** elle est générée depuis le code, avec un exemple de demande par parcours (FR-65)

### Story 9.2: Une sauvegarde quotidienne, restaurée avant la production

As a Benjamin,
I want une sauvegarde quotidienne que j'ai déjà restaurée une fois,
So that une panne de `pve-media` ne me fait perdre ni mes vidéos ni mes réglages.

**Acceptance Criteria:**

**Given** le LXC `regie` en service
**When** la nuit passe
**Then** un `pg_dump` chiffré par age et, chaque semaine, un vzdump du LXC arrivent sur `pve-nipogi` ; leur âge est visible dans `/sante` (NFR-41)

**Given** la clé maîtresse du coffre
**When** on inspecte une sauvegarde
**Then** elle n'y figure pas ; elle est gardée dans Vaultwarden (AD-9)

**Given** une sauvegarde et un conteneur vierge
**When** on suit la procédure de `deploiement/restauration.md`
**Then** regie redémarre en mode `restauration`, sans planificateur ni publication, avec ses vidéos et ses réglages, et la procédure est datée et signée par Benjamin avant la mise en production

### Story 9.3: La recette sur le compte Instagram de test

As a Benjamin,
I want jouer tout le parcours sur un compte Instagram de test,
So that je vois chaque cas avant de toucher au compte Établia.

**Acceptance Criteria:**

**Given** un compte Instagram de test connecté dans Paramètres
**When** une démo filmée, éditée et programmée à une heure proche arrive à échéance
**Then** elle part seule, une seule fois, et sa publication passe « publiée » avec le lien rendu par Instagram (FR-43, FR-44)

**Given** une publication qui échoue (jeton révoqué, vidéo hors bornes)
**When** l'échec arrive
**Then** il est visible dans l'interface avec sa cause, et « rejouer » relance après correction

**Given** un redémarrage du LXC pendant qu'une publication est programmée
**When** l'heure arrive
**Then** la publication part quand même, sans doublon

### Story 9.4: La première vraie vidéo Établia

As a Benjamin,
I want publier la première démo sur le compte Instagram d'Établia,
So that la V1 est terminée, en production.

**Acceptance Criteria:**

**Given** la recette 9.3 passée et la restauration 9.2 faite
**When** je relis la vidéo dans regie et donne mon accord
**Then** elle est publiée ou programmée sur le compte Établia depuis `regie.etablia.fr`

**Given** la vidéo publiée
**When** je l'ouvre dans Instagram
**Then** elle est lisible, verticale, sans filigrane, avec sa légende ; le MANDAT note le lot 17 « fait »

## Requirements Inventory

### Functional Requirements

**Comptes, espaces de marque et membres (§4.1)**

- FR-1 : Un visiteur crée un compte (courriel + mot de passe), inscriptions ouvertes en V1. Courriel confirmé avant la première séance ; quota de 2 h de rushes par mois et 20 Go, refus expliqué au-delà ; l'administrateur peut suspendre les inscriptions (page d'inscription qui l'annonce) ; échecs de connexion répétés freinés, bloqués temporairement et tracés.
- FR-54 : Connexion, déconnexion ; mot de passe oublié par lien unique valable 1 h, réponse qui ne révèle pas si l'adresse existe ; demande et usage tracés.
- FR-2 : Créer un espace de marque (en devenir propriétaire) ; espace personnel dès la première connexion ; changer d'espace actif en un geste.
- FR-3 : Inviter un membre par lien unique valable 7 jours, le retirer (accès perdu dès la requête suivante, ses vidéos restent) ; accorder ou retirer le droit de publier.
- FR-4 : Activer ou désactiver la validation (au moins deux membres) ; retour à un seul membre → désactivation automatique, propriétaire prévenu, vidéos « à valider » → « prêtes » ; sans validation, gardée → prête.
- FR-5 : Cloisonnement : aucune donnée d'un espace n'est exposée à un non-membre, quelle que soit la porte d'entrée ; test automatisé de refus pour chaque lecture et écriture.

**Gabarit (§4.2)**

- FR-55 : Gabarit de départ pour tout nouvel espace, personnalisable au téléphone en trois choix (couleur principale, police, style des sous-titres).
- FR-6 : Définir le gabarit par défaut : logo, 2 à 4 couleurs, polices des titres et sous-titres, style des sous-titres, carte de fin, légende et hashtags par défaut ; polices sous licence libre seulement ; choix du gabarit à l'envoi s'il y en a plusieurs (3 au plus).
- FR-7 : Aperçu du gabarit sur un brouillon d'exemple avant enregistrement ; refus si une garde échoue (élément, mesure, seuil).
- FR-8 : Un changement de gabarit s'applique aux brouillons suivants ; vidéos prêtes, archivées ou publiées inchangées ; régénérer un brouillon en relecture avec le nouveau gabarit tant que les rushes ne sont pas purgés.

**Envoi des rushes (§4.3)**

- FR-9 : Séance d'un ou plusieurs rushes (téléphone ou ordinateur) avec intention en texte libre ; vidéos de téléphone jusqu'en 4K ; 30 min de rushes au plus par séance.
- FR-10 : Envoi reprenable après perte de réseau, veille ou fermeture d'onglet, pendant 24 h, sans renvoyer ce qui est reçu (500 Mo coupé puis rétabli).
- FR-11 : Contrôle à réception (orientation, durée, lisibilité) avant tout traitement ; rush horizontal ou illisible signalé, l'utilisateur le retire ou le garde ; absence de voix relevée seulement pour proposer la recette.
- FR-12 : Dès la fin de l'envoi, heure estimée des brouillons et position dans la file.

**Capture par script d'actions (§4.4)**

- FR-13 : Le propriétaire déclare une application à capturer : hôtes autorisés, identifiants d'un compte de démo (sans second facteur) au coffre ; test de connexion (page d'accueil capturée ou étape fautive) ; identifiants saisis dans l'interface seulement.
- FR-14 : Script depuis une phrase, par le MCP seulement : regie fournit à Claude pages, éléments cliquables et captures ; chaque étape vérifiée contre les hôtes autorisés.
- FR-15 : Enregistreur de clics : chaque clic, saisie et navigation devient une étape.
- FR-16 : Import d'un test Playwright ou Cypress converti en script, jamais exécuté ; étape non convertible signalée avec son numéro, script bloqué tant qu'elle reste.
- FR-17 : Lire, ajouter, retirer, réordonner les étapes, par l'interface et le MCP ; hôte ajouté seulement après preuve de contrôle du domaine (DNS ou fichier publié).
- FR-18 : Jouer un script dans un navigateur piloté, filmer en vertical, journal horodaté des clics ; navigation hors liste → arrêt et refus tracé ; capture isolée (réseau interne, fichiers d'autrui, secrets étrangers).
- FR-19 : Rejeu par appel authentifié (chaîne de déploiement) avec un jeton limité au rejeu ; étape en échec signalée avec numéro et capture d'écran ; correction puis rejeu.

**Montage automatique (§4.5)**

- FR-56 : Trois recettes (démo d'app, face caméra, lifestyle sur musique) ; proposition automatique (capture → démo, voix → face caméra, sinon lifestyle) ; changement possible avant le montage ; un changement de plan, zoom ou texte au moins toutes les 3 s ; recette affichée sur chaque brouillon.
- FR-20 : Recettes parlées : un brouillon par idée, 5 au plus ; série numérotée (1/3…) avec suite annoncée ; si aucune idée ne passe les gardes, annonce avec raison et conseil de tournage.
- FR-59 : Meilleure prise (la plus complète, sans hésitation, voix la plus nette) ; les autres en variantes.
- FR-21 : Coupe des silences de plus de 0,7 s, des hésitations et des faux départs.
- FR-22 : Sous-titres mot à mot animés au style du gabarit, transcription faite sur le serveur ; mots peu sûrs signalés.
- FR-57 : Lifestyle sur musique : plans les plus nets et stables, coupés au rythme du morceau ; au moins un brouillon ; accroche portée par un texte à l'écran.
- FR-58 : Textes à l'écran tirés de l'intention ou de la transcription, au style du gabarit, sous gardes ; corrigeables dans le fil.
- FR-23 : Accroche dans les deux premières secondes ; trois variantes.
- FR-24 : Trois variantes de musique + « sans musique » ; voix intelligible sous la musique.
- FR-25 : Trois variantes de couverture au style du gabarit.
- FR-26 : Démo : recadrage 9:16 et zoom sur chaque clic d'après le journal, curseur visible.
- FR-27 : Démo : voix de synthèse locale, texte tiré du script et modifiable avant rendu ; voix sous licence libre commerciale, validée sur deux vidéos test avant la bêta.
- FR-28 : Gardes non forçables (lisibilité, zone sûre, bornes) qui nomment segment, code temporel, mesure et seuil ; brouillon bloqué visible dans le fil, segment fautif mis en avant, non gardable tant qu'il échoue ; défauts : contraste 4,5:1, capitales ≥ 48 px sur 1920, zone sûre 880×1220 à (0, 220) ; bornes par réseau dans un fichier versionné.
- FR-29 : Refaire une série en disant ce qui ne va pas, avec au besoin une autre recette ; impossible après purge.
- FR-30 : Reproductibilité à entrées, versions, matériel, pilote et moteur identiques ; « refaire » signale une version changée.

**File de traitement et notifications (§4.6)**

- FR-31 : Pour chaque séance et capture : étape en cours, position, temps restant estimé.
- FR-32 : Notifications dans l'interface et par courriel (série prête, étape en échec, publication en échec) ; l'échec nomme étape, cause et action ; jamais de nouvelle tentative automatique, sauf les courriels (3 essais). Pas de push en V1.
- FR-33 : Relancer une étape en échec sans renvoyer les rushes, tant qu'ils ne sont pas purgés ; historique des tentatives ; vidéo « en échec de traitement » qui retrouve son statut après relance réussie.

**Fil de relecture (§4.7)**

- FR-34 : Parcourir les brouillons d'une série en plein écran, lecture automatique avec le son, numéro dans la série.
- FR-61 : Relecture sur version allégée ; export et publication sur le rendu complet 1080×1920 tiré des rushes d'origine.
- FR-35 : Garder ou jeter d'un glissement, avec bouton équivalent ; brouillon jeté récupérable jusqu'à la purge.
- FR-36 : Corriger par le texte : barrer et rétablir une phrase, corriger un mot de sous-titre ou un texte à l'écran, sans repasser par la file complète ; zones douteuses en premier ; vidéo prête corrigée → gardée ; plus de correction si publication programmée ou publiée, ni après purge.
- FR-60 : Zones douteuses signalées : mots peu sûrs, coupes et frontières d'idée incertaines ; proposées en premier.
- FR-62 : Corriger à la voix (« coupe la deuxième phrase »), transcrite sur le serveur, appliquée comme une correction par le texte, mêmes règles.
- FR-37 : Choisir entre 3 accroches, 3 musiques ou « sans musique », 3 couvertures et les autres prises, aperçu en moins de 2 s ; impossible après purge.
- FR-38 : Lire et corriger légende et hashtags proposés ; nombre dans les bornes du réseau visé.

**Validation (§4.8)**

- FR-39 : Un membre autre que l'auteur voit les vidéos « à valider », valide (→ prête) ou renvoie avec commentaire (→ gardée, retour chez l'auteur, repasse « à valider » à la correction ou nouvelle soumission) ; corrigée après validation → « à valider ».

**Export et publication (§4.9)**

- FR-40 : Télécharger une vidéo prête au format vertical, avec légende et couverture, sans filigrane.
- FR-41 : Le propriétaire d'un espace ayant le droit de publication connecte un compte par réseau (Instagram Reels, Page Facebook, TikTok, YouTube Shorts), dans l'interface seulement ; échéance visible, rappels J-7 et la veille (interface et courriel), reconnexion ; en V1, droit accordé aux seuls espaces de l'administrateur ; TikTok et YouTube en privé tant que l'application n'est pas auditée ou vérifiée.
- FR-42 : Le propriétaire ou un membre autorisé crée une publication d'une vidéo prête vers un compte connecté, maintenant ou programmée à une heure de Paris ; contrôle des bornes et du quota du réseau ; une publication par compte et par vidéo.
- FR-63 : TikTok : niveau de confidentialité parmi ceux permis, déclaration de contenu commercial ; envoi en brouillon dans l'app TikTok (état final « envoyée en brouillon »).
- FR-43 : Exécution des publications programmées à l'heure dite, y compris après redémarrage, jamais deux fois.
- FR-44 : Résultat : « publiée » (identifiant et lien) ou « en échec » (cause), notifié ; rejouer une publication en échec avec historique ; annuler ou déplacer une publication programmée ; le statut de publication ne change pas celui de la vidéo.
- FR-45 : Bibliothèque : lister vidéos et publications par espace, statuts, réseau et période ; supprimer une vidéo sans publication publiée, sinon l'archiver.

**MCP et API privée (§4.10)**

- FR-46 : Connexion de Claude par OAuth (espace et droits choisis à l'écran) ; jetons pour l'API, le rejeu et Claude Code créés dans l'interface, affichés une fois, expirants, révocables ; jeton limité aux espaces et droits de l'utilisateur, éventuellement à un espace et une action.
- FR-47 : Parité à trois de toute action métier, sauf exceptions déclarées (secrets, comptes réseau, réglages d'administration, jetons, membres et droits, désactivation de la validation, suppressions de compte ou d'espace : interface seule ; script depuis une phrase : MCP seul) ; aucun outil ni point d'API ne touche un secret.
- FR-48 : Erreurs MCP et API à code stable, message en français, contexte (objet, étape, valeur), sans secret.
- FR-64 : Lire la structure d'un brouillon ou d'une vidéo (recette, segments, transcription, textes, musique, couverture, zones douteuses) par les trois portes.
- FR-65 : Référence du MCP et de l'API générée depuis le code à chaque version, avec un exemple de demande à Claude par parcours.
- FR-66 : Journal d'audit consultable (soi, propriétaire pour son espace, administrateur pour l'instance), filtres période, utilisateur, origine, objet.

**Bibliothèque musicale (§4.11)**

- FR-49 : Chaque morceau porte source, licence et attribution ; usage commercial sans redevance seulement ; attribution ajoutée à la légende ; morceau proposé par un utilisateur vérifié par l'administrateur.
- FR-50 : Ambiances préférées du gabarit (énergique, calme, sans musique par défaut) qui orientent les propositions.

**Données personnelles et obligations légales (§4.12)**

- FR-51 : Conditions d'utilisation et politique de confidentialité publiques dès la bêta, acceptées à l'inscription ; l'utilisateur garde la propriété de ses rushes et vidéos.
- FR-52 : Purge des rushes 30 jours après le tri complet d'une séance (sans tri complet : 60 jours après la livraison de la série, rappel à 30 jours) ; date de purge affichée ; après purge : plus de refaire, corriger, variante, régénération, relance lisant les rushes, récupération de jeté ; export, publication, programmation et archivage restent possibles ; pour une capture, le script reste.
- FR-53 : Suppression du compte : rushes, brouillons, vidéos, scripts et secrets effacés, sauf audit légal ; espace partagé rendu au propriétaire, ou supprimé après avertissement des membres s'il part.
- FR-67 : Lien vers le code source de la version en service sur chaque page (AGPL-3.0).
- FR-68 : Télécharger une archive de ses données (compte, vidéos prêtes, montages, scripts, légendes), sans secret.
- FR-69 : Point de contact public pour signaler un contenu illicite ou exercer un droit ; l'administrateur traite et peut suspendre l'espace.

**Administration de l'instance (§4.13)**

- FR-70 : Rôle d'administrateur distinct, désigné à l'installation, jamais donné par une action ; accorde le droit de publication, saisit les clés, vérifie les morceaux, traite les signalements, suspend les inscriptions ; aucun accès aux contenus des espaces dont il n'est pas membre.
- FR-71 : Saisir, remplacer et tester les clés d'application des réseaux et les paramètres d'envoi des courriels, dans l'interface seulement ; jamais réaffichées, seul l'état est visible ; au coffre.

### NonFunctional Requirements

**Performance et file**

- NFR-1 : Aucune réponse n'attend un traitement long ; < 500 ms au 95e centile à charge nominale (20 utilisateurs actifs, 3 séances de 10 min par semaine chacun).
- NFR-2 : Série prête en < 15 min pour 10 min de rushes 1080p, file vide ; chronométrage à chaque version, refus au-delà.
- NFR-3 : Temps restant affiché à moins de 30 % d'écart dans 80 % des cas.
- NFR-4 : File servie à tour de rôle : personne n'attend plus d'un traitement complet à cause d'un autre.
- NFR-5 : Relecture qui démarre en < 2 s en 4G (10 Mbit/s) sur la version allégée.
- NFR-6 : Correction par le texte visible dans l'aperçu en < 10 s.
- NFR-32 : À charge nominale, aucune séance n'attend plus de 1 h avant traitement.
- NFR-33 : Version allégée d'un brouillon de 60 s < 15 Mo.

**Fiabilité**

- NFR-7 : Tâches, file, envois et publications programmées survivent à un redémarrage.
- NFR-8 : Publication programmée partie dans la minute ; après arrêt, rattrapage si < 2 h, sinon échec avec cause ; changements d'heure testés.
- NFR-9 : Zéro double envoi, même avec coupure pendant l'envoi.
- NFR-10 : 100 % des échecs visibles avec cause et action ; aucun échec silencieux.
- NFR-11 : Délai de garde par type de tâche (contrôle 5 min ; transcription 3 × durée, ≥ 10 min ; montage 30 min ; rendu 15 min ; capture 15 min ; voix 10 min ; réseau 10 min).
- NFR-12 : Deux rendus des mêmes entrées, mêmes matériel et versions : montages identiques à 40 ms près.
- NFR-13 : Sauvegarde quotidienne, perte ≤ 24 h, restauration < 4 h, testée chaque mois.
- NFR-34 : Disponibilité 99 % par mois hors maintenance annoncée ; sonde chaque minute (couverture partielle en bêta).

**Sécurité et confidentialité**

- NFR-14 : Zéro secret en clair (base, journaux, dépôt, réponses) ; scan bloquant et recherche des valeurs de test.
- NFR-15 : Chiffrement authentifié, refus de démarrer sans clé valide (cause nommée, valeur tue), format versionné, rotation de la clé maîtresse sans perte.
- NFR-16 : Aucune donnée lisible d'un utilisateur ou espace à l'autre, sur les trois portes ; suite à deux comptes.
- NFR-17 : Toute route sous session ou jeton, sauf liste publique énumérée et testée.
- NFR-18 : Vidéo servie seulement par adresse signée (publication ou session), expirant en < 1 h.
- NFR-19 : Capture isolée ; accès interdits testés par un script hostile.
- NFR-20 : Hachage salé > 100 ms ; au-delà de 5 échecs en 15 min, freinage puis blocage temporaire, tracé.
- NFR-21 : Journal en ajout seul de toute action d'état et tentative de publication (utilisateur, origine, jeton), sans secret.
- NFR-35 : Aucune ressource tierce dans les pages ; aucun rush, transcription ni rendu ne quitte le serveur, sauf vers un réseau choisi.

**Accessibilité, appareils et ton**

- NFR-22 : De 360 px à l'ordinateur, sans défilement horizontal ; tests visuels à 360, 768 et 1 280 px.
- NFR-23 : Contraste ≥ 4,5:1 ; aucune information portée par la couleur seule.
- NFR-24 : Tout au clavier avec focus visible ; chaque geste a un bouton équivalent ; parcours UJ-1 et UJ-3 au clavier et sans geste.
- NFR-25 : Heures affichées et programmées en heure de Paris, sans décalage aux changements d'heure.
- NFR-36 : Textes tutoyés, vocabulaire de créatrice, heures en clair ; liste de mots interdits contrôlée automatiquement.

**Liberté, intégrations et exploitation**

- NFR-26 : 100 % des dépendances, modèles et voix sous licence libre commerciale ; musiques à source vérifiable ; aucune IA en nuage.
- NFR-27 : Un connecteur isolé par réseau ; bornes et seuils des gardes dans un fichier versionné et testé.
- NFR-28 : MCP et API appellent le même service que l'interface ; test de parité et de dérive de la référence.
- NFR-29 : Changement incompatible annoncé une version avant.
- NFR-30 : Contrôle des prérequis au démarrage (outils, modèles, clé), refus en nommant le manquant.
- NFR-31 : Migrations atomiques sans perte de la file, des envois ni des publications programmées.
- NFR-37 : Mesures d'usage (gestes, temps de relecture, corrections, « refaire ») enregistrées sur le serveur, sans service tiers.

**Qualité du montage**

- NFR-38 : Taux d'erreur de mots ≤ 10 % sur le jeu de rushes français de référence.
- NFR-39 : Musique au moins 12 dB sous la voix.

### Additional Requirements

Tirées du socle d'architecture (AD-1 à AD-21). Pas de gabarit de projet tiers : l'histoire 1.1 monte le dépôt selon la « Structure de départ » du socle (`paquets/contrats`, `coeur`, `services/*`, `deploiement`, CI Forgejo).

**Fondations et livraison**

- AR-1 (AD-19) : Monorepo `paquets/contrats`, `coeur`, `services/{rendu,capture,publication,transcription,langage,voix}`, `deploiement`. CI Forgejo + Forgejo Actions dans un LXC dédié, registre d'images ; toutes les suites bloquantes à chaque commit ; images étiquetées par empreinte et SBOM sur `main` ; GitHub en miroir. Dev sur Mac par compose avec profil `cpu`, données de démonstration, aucun secret réel. LXC `regie-recette` à la demande (chronométrage, charge, restauration mensuelle).
- AR-2 (Stack) : Node.js 26 LTS ESM TypeScript strict ; fastify 5 + @fastify/middie + @fastify/static ; Astro 7 (adaptateur node en middleware, `astro check`) ; îlots Svelte 5 ; zod 4 ; MCP @modelcontextprotocol/server 2.2 + adaptateur fastify, spéc. 2026-07-28 sans état ; PostgreSQL 18 + pg + drizzle (typage seul, migrations en SQL) ; tus ; playwright 1.63 ; pino ; vitest ; Python 3.14 + pydantic 2 + datamodel-code-generator ; openvino-genai + Whisper large-v3-turbo ; llama.cpp ; FFmpeg 9 + libass ; Caddy ; Podman 5.4 + Quadlet ; Debian 13 ; Proxmox VE 9.2 + PBS 4.2. Aucune RC en production.
- AR-3 (AD-16) : Deux LXC non privilégiés en VLAN DMZ : `regie` (proxy-tls, coeur, postgres, transcription, langage, voix, rendu, publication ; `/dev/dri` de l'Arc partagé avec Tdarr) et `regie-capture`. Quadlet, linger, cgroups v2, réseaux `--internal`, idmap élargi, groupe `render`. Images épinglées par empreinte. Ordre de démarrage du cœur : environnement → clé et coffre → base → migrations → services → façades → Astro → application des résultats, file, planificateur.
- AR-4 (AD-16) : Migrations SQL numérotées, en avant seulement, compatibles N-1, appliquées au démarrage dans une transaction ; SHA-256 dans `migrations_appliquees`, refus si un fichier appliqué a changé.
- AR-5 (Conventions) : `env.ts` seul lecteur de l'environnement (`URL_PUBLIQUE`, `RACINE_DONNEES`…) ; fichier de chaînes unique contrôlé contre les mots interdits ; nommage SQL et TS du socle ; UUIDv7 pour les objets, 256 bits pour les capacités ; `timestamptz` UTC, ISO 8601 `Z` ; durées en ms ; réponses `{ ok, donnees | erreur }`, 202 + `{ tacheId, etat }` pour une opération longue ; `ErreurMetier { code DOMAINE_CAUSE, contexte }` traduite en HTTP 400/401/403/404/409/422/429 ; journaux JSON masqués ; écarts marqués `// Écart :`.

**Cœur et façades**

- AR-6 (AD-1) : Toute action métier est une fonction de `coeur/src/services` `(acteur, entrée validée) → résultat` qui lève une `ErreurMetier` ; une fonction = une transaction (set_config, verrous, transitions, tâches, échéances, courriels, audit, pg_notify) ; façades minces ; registre unique `/api/v1/<domaine>/<verbe>` ↔ outil MCP `<domaine>_<verbe>` ; fichier `exceptions-parite` ; `CHANGELOG-API` ; version N-1 servie une version.
- AR-7 (AD-2) : Machines à états uniques de la vidéo, de la publication, de la séance (`date_purge`, `purge_en_cours`) et de l'espace (`actif`, `suspendu`) ; événements nommés entre machines (`validation_desactivee`, `montage_remplace`, `espace_suspendu`) ; les objets appartiennent à l'espace (`auteur_id` mis à NULL à la suppression) ; module unique `application-resultats` (démarrage, NOTIFY, balayage 30 s) ; `SEANCE_PURGEE` sous `FOR SHARE`.
- AR-8 (AD-12) : Plus de 500 ms → tâche et HTTP 202 ; routes d'îlots `/i/…` sous session, avec contrôle `Origin` et jeton anti-CSRF ; `/api/v1` et `/mcp` en `Bearer` seulement ; SSE par utilisateur, objet relu avec l'acteur recalculé, fermeture sur 401/403 ; tus avec `Upload-Length` obligatoire, crochet d'appartenance, envois ouverts bornés, refus sous 15 % de disque libre ; fin d'envoi → `analyse_media`.
- AR-9 (AD-4) : Contrats zod versionnés dans `paquets/contrats`, exportables sans perte en JSON Schema ; variante « compatible grammaire » testée contre llama.cpp ; modèles pydantic générés, test de dérive bloquant ; `ErreurTache { code, etape, contexte, action_possible }` ; modules purs `mise-en-page`, `scripts`, `prompts`.

**Données, droits et secrets**

- AR-10 (AD-8) : `Acteur` recalculé à chaque requête ; `Acteur.systeme(motif, objet)` ; espace suspendu refusé sur les trois façades ; courriel non confirmé → ni espace ni séance ; RLS `ENABLE` + `FORCE` sur toute table d'espace ou d'utilisateur, échec fermé sans variable ; rôles `regie_coeur`, `regie_admin` (aucun SELECT sur les contenus), `regie_migrations`, un rôle par service (EXECUTE sur les fonctions de file seulement) ; un pool par rôle ; suite de cloisonnement (deux comptes, deux services).
- AR-11 (AD-9) : Clé maîtresse sur l'hôte PVE, montée en lecture seule dans le seul `coeur`, exclue des sauvegardes, copie sous séquestre ; sous-clés HKDF `coffre`, `hmac-adresses`, `liens` ; AES-256-GCM versionné, AAD `secret_id ‖ espace_id ‖ type` ; `POST /interne/secrets/lire` et `/deposer` liés à l'identité du service, au bail et à une matrice (type de tâche, type de secret) ; masquage par nom et par valeur dans les journaux.
- AR-12 (AD-7) : Arborescence fixe sous `RACINE_DONNEES` construite par le seul module `chemins` ; services confinés à `taches/<id>/{entrees,sortie}` (liens physiques, relecture `O_NOFOLLOW`) ; signature magique puis `analyse_media` en conteneur sans réseau, jamais ffprobe dans le cœur ; SVG rastérisés ; adresses signées HMAC juste à temps (< 1 h, usage `publication` ou `session`), jamais écrites ; domaine `fichiers.<domaine>` sans cookie, CSP sandbox ; purge conditionnée au rendu complet du montage en vigueur ; `export_donnees` ; suppression base puis dossiers, table `suppressions`.
- AR-13 (AD-15) : scrypt (≥ 100 ms) ; freinage (compte, IP) bloqué après 5 échecs en 15 min, compte seul en freinage progressif ; inscription toujours « vérifie ta boîte » ; sessions en base, cookie `__Host-`, révoquées au changement de mot de passe ; second facteur **obligatoire pour l'administrateur seul** (TOTP ou WebAuthn), hors V1 pour les autres comptes ; réauthentification < 10 min pour les actions sensibles ; serveur d'autorisation OAuth 2.1 (PKCE S256, CIMD et DCR bornée, consentement sous session, RFC 9207, jetons d'accès courts, rafraîchissement tournant) ; jetons `regie_pat_` hachés, expiration obligatoire (90 j, 1 an pour le rejeu), portées énumérées ; liens uniques hachés ; liste des routes publiques testée ; audit en INSERT seul, identifiants opaques, chaînage sha256 exporté chaque nuit.
- AR-14 (AD-18) : Limites dans `coeur/src/domaine/limites`, réglables (2 h/mois de Paris, 20 Go, 30 min par séance, 5 brouillons, 3 gabarits) ; réservation à la création de l'envoi sous `FOR UPDATE`, convertie à l'analyse, libérée à l'expiration ; quota imputé à l'auteur ; « refaire » gratuit ; unicités en contraintes de base.

**File, pipeline et IA**

- AR-15 (AD-3) : File = fonctions SQL livrées par migration (`file_prendre`, `file_renouveler`, `file_terminer`, `file_echouer`, `file_point_de_non_retour`, `file_annuler`, `file_geler`) ; registre `paquets/contrats/taches.ts` ; `SKIP LOCKED`, bail ≥ 3 × renouvellement ; classes `interactive` avant `lot`, équité par utilisateur ; sémaphore GPU par index unique partiel ; reprise unique si `permise`, sinon `RESULTAT_INCONNU` ; estimation par simulation de l'ordre de prise ; suite commune TS/Python avec coupures.
- AR-16 (AD-21) : Graphe déclaré par recette : `analyse_media` → `transcription` → `langage` → montage créé par le cœur → `rendu_allege` → `rendu_complet` ; tâches internes (purge, suppression, export, courriels, nettoyage) dans `travaux_internes`.
- AR-17 (AD-5) : Montage JSON versionné, lignes immuables, créé par le seul cœur ; confiance par mot calculée par regie (optionnelle jusqu'au banc) ; rendu fonction pure ; reproductibilité (température 0, graine, `--parallel 1`, versions et `backend` inscrits) ; licence obligatoire pour polices et morceaux.
- AR-18 (AD-6) : Module unique de gardes `(montage, mesures, bornes) → violations[]`, appelé avant rendu complet, « garder », publication et aperçu du gabarit ; mesures visuelles par `analyse_media` ; `GARDE_NON_RESPECTEE` 422 ; `deploiement/bornes.json` versionné.
- AR-19 (AD-13) : Module pur `mise-en-page` partagé par le lecteur du navigateur et le générateur ASS, test image rendu ⇔ lecteur ; aperçu qui applique le dernier montage jusqu'à la nouvelle version allégée (classe interactive) ; rendu complet 10 min après la dernière correction ou à la demande.
- AR-20 (AD-11) : Transcription, langage, voix en Python sur réseau sans sortie ; OpenVINO GenAI avec horodatage au mot ; libération de la VRAM après chaque tâche ; llama.cpp compatible OpenAI, sorties contraintes ; modèles sur `/modeles` seulement, listés dans `modeles.lock` (licence, SHA-256) ; repli processeur. Différés à trancher : modèle de langage et backend au banc ; voix de synthèse ; confiance par mot ; accès à l'Arc vérifié en première tâche d'installation.

**Capture, publication, exploitation**

- AR-21 (AD-10) : `regie-capture` sur VLAN isolé ; Podman rootless d'un utilisateur dédié ; un conteneur Chromium jetable par capture (`cap-drop=ALL`, lecture seule, bac à sable actif) ; réseau interne vers `proxy-capture` seulement ; proxy anti-rebinding qui refuse les plages privées et l'IP du foyer, trace les destinations 1 an ; hôtes prouvés (DNS TXT ou `/.well-known/regie`), exception administrateur « hôte + IP privée » ; scripts déclaratifs (`aller`, `cliquer`, `saisir`, `attendre`, `connexion`, `filmer`) ; tests importés convertis ; modes capture, exploration (`non_fiable`), enregistreur (screencast sur WebSocket terminé par le cœur) ; rejeu → séance liée et `montage_remplace` ; suite d'évasion.
- AR-22 (AD-14) : Instants en UTC ; table `echeances` (publication, rendu différé, purge et rappel, expirations, rappels de connexion, suppression annoncée) ; planificateur qui rattrape < 2 h ; publication qui fige `montage_id` et `rendu_id`, passe `en_attente_confirmation` si le montage change ; clé d'idempotence, `reprise: interdite`, point de non-retour → `envoi_en_cours` ; OAuth des réseaux (`state` lié, PKCE, `redirect_uri` fixe, portées dans `reseaux.json`) ; un connecteur par réseau ; outbox `courriels_sortants` (3 essais, liens depuis `URL_PUBLIQUE`).
- AR-23 (AD-17) : Sorties Internet limitées à `publication`, `proxy-capture`, `coeur` (SMTP) et `proxy-tls` (ACME) ; CSP `default-src 'self'` par `security.csp` d'Astro ; suites « appels sortants » et « licences » (npm, pip, modèles, polices, musique) bloquantes ; `npm ci --ignore-scripts`, `pip --require-hashes` ; `LICENCES-TIERS`.
- AR-24 (AD-16, AD-20) : Caddy (TLS, en-têtes, débit, journal sans chaîne de requête), ports 443/80 seulement, DNS dynamique ; `/sante` (base, file, coffre, disque, dernière sauvegarde, dernier bail GPU) ; Uptime Kuma (panne, disque < 15 %, sauvegarde > 26 h, file bloquée, certificat) ; dump age + PBS chaque nuit, hors site, rushes exclus, rétention 35 j ; mode `restauration` et rejeu de `suppressions` ; restauration test mensuelle ; procédure d'urgence ; conservation journaux 30 j, audit et destinations 1 an.
- AR-25 (Conventions) : Mesures d'usage dans `mesures_usage` (ajout seul) ; notifications = interface + ligne `courriels_sortants` dans la même transaction, pour les 15 événements listés ; textes venus d'une page, d'une transcription ou d'un autre membre rendus à Claude dans des champs `non_fiable` ; îlots sans store global, états `chargement`, `pret`, `erreur` ; `docs/rgpd/registre.md`.

### UX Design Requirements

Tirées des maquettes validées `maquette/public/relire.html` et `maquette/public/capture.html`.

**Fondations visuelles**

- UX-DR1 : Jetons de thème sombre sur `:root` repris des maquettes : `--fond #0c0c0d`, `--surface #17171a`, `--surface-2 #222226`, `--trait #34343a`, `--texte #f4f3f0`, `--doux #b3b1aa`, `--garder #3ddc84`, `--jeter #ff6b5e`, `--doute #ffc94d`, `--accent #ff8fb1` (avec leurs fonds translucides), `--rayon 14px`, et l'anneau de focus `0 0 0 3px #fff, 0 0 0 5px #3b82f6`. Contraste vérifié ≥ 4,5:1 sur chaque couple texte/fond utilisé.
- UX-DR2 : Mise en page mobile d'abord, sans défilement horizontal de 360 px à l'ordinateur ; points de rupture à 700 px (carte vidéo arrondie), 900 px (feuilles en panneau latéral, deux colonnes de la capture) et 1 240 px (trois colonnes de la capture, aperçu collant).
- UX-DR3 : `prefers-reduced-motion` coupe les animations (image, glissements de scène) ; `[hidden]` force `display: none`.
- UX-DR4 : Composant d'en-tête collant de l'application : nom regie, espace actif (changement en un geste), navigation (Relire, Démos d'app), lien vers le code source.

**Fil de relecture (« Relire »)**

- UX-DR5 : Carte vidéo plein écran : image, voile, accroche, texte à l'écran, sous-titres au style du gabarit, signature ; segments de progression de la série (gardé, jeté, à trier) ; numéro « Brouillon 1 sur 3 », titre, bouton retour aux séances, bouton son (`aria-pressed`), barre de progression et temps.
- UX-DR6 : Garder et jeter par glissement horizontal (seuil 30 % de la largeur, rotation, tampons « Gardée » / « Jetée ») avec boutons « Jeter », « Lecture/Pause », « Garder » toujours visibles ; aide « Glisse à droite pour garder, à gauche pour jeter » ; raccourcis flèche droite (garder), flèche gauche (jeter), espace (lecture), Échap (fermer la feuille), inactifs dans un champ de saisie.
- UX-DR7 : Toast `role="status"` avec bouton « Annuler » après garder, jeter, couper une phrase ou retirer une étape ; disparaît après 4 s ; se place au-dessus d'une feuille ouverte.
- UX-DR8 : Rail d'outils de correction : Corriger (pastille du nombre de zones douteuses), Dicter, Variantes, Légende.
- UX-DR9 : Feuilles du bas sur téléphone, panneau latéral à partir de 900 px : `role="dialog"`, titre lié, poignée, bouton Fermer, Échap ; une seule ouverte à la fois.
- UX-DR10 : Feuille « Corriger » : bouton micro (`aria-pressed`) et consigne en `aria-live="polite"` ; zones douteuses en premier (surlignées `--doute`, marquées réglées) ; transcription par phrases à toucher pour couper / remettre (libellé « Couper : … » / « Remettre : … », barré + texte, pas la couleur seule) ; mention de la date limite de correction (purge).
- UX-DR11 : Indicateur d'état de l'aperçu `role="status"` (« Mise à jour de l'aperçu… » → prêt), affiché pendant le rendu allégé interactif.
- UX-DR12 : Feuille « Variantes » à onglets (`role="tablist"`) : Accroche, Musique (dont « sans musique »), Couverture (vignettes), Prise ; aperçu immédiat du choix.
- UX-DR13 : Feuille « Légende et hashtags » : choix du réseau visé (`radiogroup`), zone de légende avec compteur, puces de hashtags retirables, ajout d'un hashtag ; garde `role="alert"` qui nomme la borne dépassée du réseau.
- UX-DR14 : Écran « Série relue » : bilan gardées / jetées (pastilles texte + couleur), heure de disponibilité en clair, « Revoir la série », « Retour à mes séances », rappel de la date de récupération des brouillons jetés.
- UX-DR15 : Brouillon bloqué par une garde visible dans le fil, segment fautif mis en avant avec mesure et seuil, « Garder » désactivé avec la raison.

**Démos d'app (écran de capture)**

- UX-DR16 : Carte « Application à filmer » : liste des hôtes avec état (vérifié, en attente de preuve DNS TXT, avec instructions et bouton de revérification) ; coffre du compte de démo qui n'affiche jamais la valeur, formulaire « Remplacer » ; « Tester la connexion » qui rend une mini capture ou l'étape fautive.
- UX-DR17 : Liste des scripts avec origine (Claude, parcours enregistré, test importé) et état du dernier jeu (réussi, échec à l'étape N, hôte refusé).
- UX-DR18 : Éditeur d'étapes : monter, descendre, retirer (toast « Annuler »), ajouter (verbe en liste déroulante + cible) ; étape en panne mise en avant avec sa capture d'écran et les actions « Viser le … » et « Retirer l'étape » ; hôte non autorisé nommé dans le refus.
- UX-DR19 : Zone de texte de la voix de synthèse, modifiable avant rendu.
- UX-DR20 : Interrupteur `role="switch"` « Rejouer à chaque mise en production » et jeton de rejeu affiché une seule fois, avec copie et avertissement.
- UX-DR21 : Panneau « Jouer et filmer » : aperçu vertical avec curseur, onde de clic, zoom, pastille « Capture », journal horodaté (saisie, choix, clic) ; fin annoncée « brouillon prêt vers 18 h 52 dans Relire ».
- UX-DR22 : Fenêtres « Demander à Claude » (explique la connexion MCP), « Faire le parcours une fois » (étapes ajoutées en direct pendant l'enregistrement, mot de passe remplacé par l'étape connexion) et « Importer un test » (étapes converties, étape non convertible signalée par son numéro, « Créer le script » bloqué tant qu'elle reste).

**Transverses**

- UX-DR23 : Textes tutoyés, vocabulaire de créatrice, heures en clair (« vers 18 h 40 ») dans le fichier de chaînes ; aucun mot interdit.
- UX-DR24 : Toute information d'état doublée d'un texte ou d'une icône (jamais la couleur seule) ; libellés accessibles sur tous les boutons d'icône ; champs avec `label` (éventuellement visuellement caché).
- UX-DR25 : Chaque îlot a des états chargement, prêt et erreur visibles ; une erreur nomme la cause et l'action possible.

### FR Coverage Map

- FR-1 : Épopée 1 — Compte, espace et Claude
- FR-2 : Épopée 1 — Compte, espace et Claude
- FR-3 : Épopée 1 — Compte, espace et Claude
- FR-4 : Épopée 6 — Valider à plusieurs
- FR-5 : Épopée 1 — Compte, espace et Claude
- FR-6 : Épopée 2 — Rushes → premier brouillon
- FR-7 : Épopée 2 — Rushes → premier brouillon
- FR-8 : Épopée 2 — Rushes → premier brouillon
- FR-9 : Épopée 2 — Rushes → premier brouillon
- FR-10 : Épopée 2 — Rushes → premier brouillon
- FR-11 : Épopée 2 — Rushes → premier brouillon
- FR-12 : Épopée 2 — Rushes → premier brouillon
- FR-13 : Épopée 4 — Démos d'applis web
- FR-14 : Épopée 4 — Démos d'applis web
- FR-15 : Épopée 4 — Démos d'applis web
- FR-16 : Épopée 4 — Démos d'applis web
- FR-17 : Épopée 4 — Démos d'applis web
- FR-18 : Épopée 4 — Démos d'applis web
- FR-19 : Épopée 4 — Démos d'applis web
- FR-20 : Épopée 5 — Recettes en série et lifestyle
- FR-21 : Épopée 2 — Rushes → premier brouillon
- FR-22 : Épopée 2 — Rushes → premier brouillon
- FR-23 : Épopée 3 — Relire, corriger, exporter
- FR-24 : Épopée 3 — Relire, corriger, exporter
- FR-25 : Épopée 3 — Relire, corriger, exporter
- FR-26 : Épopée 4 — Démos d'applis web
- FR-27 : Épopée 4 — Démos d'applis web
- FR-28 : Épopée 2 — Rushes → premier brouillon
- FR-29 : Épopée 5 — Recettes en série et lifestyle
- FR-30 : Épopée 2 — Rushes → premier brouillon
- FR-31 : Épopée 2 — Rushes → premier brouillon
- FR-32 : Épopée 2 — Rushes → premier brouillon
- FR-33 : Épopée 2 — Rushes → premier brouillon
- FR-34 : Épopée 3 — Relire, corriger, exporter
- FR-35 : Épopée 3 — Relire, corriger, exporter
- FR-36 : Épopée 3 — Relire, corriger, exporter
- FR-37 : Épopée 3 — Relire, corriger, exporter
- FR-38 : Épopée 3 — Relire, corriger, exporter
- FR-39 : Épopée 6 — Valider à plusieurs
- FR-40 : Épopée 3 — Relire, corriger, exporter
- FR-41 : Épopée 7 — Publier sur les réseaux
- FR-42 : Épopée 7 — Publier sur les réseaux
- FR-43 : Épopée 7 — Publier sur les réseaux
- FR-44 : Épopée 7 — Publier sur les réseaux
- FR-45 : Épopée 3 — Relire, corriger, exporter
- FR-46 : Épopée 1 — Compte, espace et Claude
- FR-47 : Épopée 1 — Compte, espace et Claude
- FR-48 : Épopée 1 — Compte, espace et Claude
- FR-49 : Épopée 3 — Relire, corriger, exporter
- FR-50 : Épopée 3 — Relire, corriger, exporter
- FR-51 : Épopée 1 — Compte, espace et Claude
- FR-52 : Épopée 2 — Rushes → premier brouillon
- FR-53 : Épopée 8 — Données et exploitation
- FR-54 : Épopée 1 — Compte, espace et Claude
- FR-55 : Épopée 2 — Rushes → premier brouillon
- FR-56 : Épopée 5 — Recettes en série et lifestyle
- FR-57 : Épopée 5 — Recettes en série et lifestyle
- FR-58 : Épopée 5 — Recettes en série et lifestyle
- FR-59 : Épopée 5 — Recettes en série et lifestyle
- FR-60 : Épopée 3 — Relire, corriger, exporter
- FR-61 : Épopée 3 — Relire, corriger, exporter
- FR-62 : Épopée 3 — Relire, corriger, exporter
- FR-63 : Épopée 7 — Publier sur les réseaux
- FR-64 : Épopée 2 — Rushes → premier brouillon
- FR-65 : Épopée 1 — Compte, espace et Claude
- FR-66 : Épopée 1 — Compte, espace et Claude
- FR-67 : Épopée 1 — Compte, espace et Claude
- FR-68 : Épopée 8 — Données et exploitation
- FR-69 : Épopée 8 — Données et exploitation
- FR-70 : Épopée 1 — Compte, espace et Claude
- FR-71 : Épopée 1 — Compte, espace et Claude (courriels) ; Épopée 7 — Publier sur les réseaux (clés des réseaux)

## Epic List

### Epic 1 : Compte, espace de marque et connexion de Claude
Une créatrice crée son compte, se connecte, crée un espace de marque, invite des membres, branche son Claude par OAuth et crée des jetons ; l'administrateur désigné à l'installation (second facteur obligatoire, pour lui seul) saisit les paramètres d'envoi des courriels ; chacun consulte son journal d'audit. Pose le dépôt (CI Forgejo, contrats, migrations, RLS, coffre), le registre de parité à trois portes et les pages légales.
**FRs covered:** FR-1, FR-54, FR-2, FR-3, FR-5, FR-46, FR-47, FR-48, FR-51, FR-65, FR-66, FR-67, FR-70, FR-71

### Epic 2 : Des rushes au premier brouillon sous-titré
La créatrice règle son gabarit, envoie ses rushes (envoi reprenable, contrôle à réception, quotas), suit la file et ses notifications, relance une étape en échec, et reçoit un brouillon face caméra simple — silences coupés, sous-titres mot à mot, gardes respectées — visible dans une page d'aperçu et lisible par les trois portes ; les rushes sont purgés à l'échéance.
**FRs covered:** FR-55, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-21, FR-22, FR-28, FR-30, FR-31, FR-32, FR-33, FR-52, FR-64

### Epic 3 : Relire, corriger, choisir et exporter
La créatrice parcourt sa série dans le fil « Relire » plein écran, garde ou jette d'un geste, corrige par le texte ou à la voix en commençant par les zones douteuses, choisit accroche, musique, couverture et prise, ajuste légende et hashtags, puis télécharge la vidéo prête sans filigrane et retrouve tout dans sa bibliothèque.
**FRs covered:** FR-23, FR-24, FR-25, FR-34, FR-35, FR-36, FR-37, FR-38, FR-40, FR-45, FR-49, FR-50, FR-60, FR-61, FR-62

### Epic 4 : Démos d'applis web filmées par script
Le propriétaire déclare une application (hôtes prouvés, compte de démo au coffre), obtient un script par Claude, par l'enregistreur ou par import d'un test, le corrige, le joue et le filme dans une capture isolée, et le fait rejouer par sa chaîne de déploiement ; la démo est recadrée, zoomée sur les clics et commentée par une voix de synthèse locale.
**FRs covered:** FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-26, FR-27

### Epic 5 : Recettes face caméra en série et lifestyle
regie propose la recette adaptée aux rushes, découpe une prise parlée en une série d'idées avec la meilleure prise, monte un lifestyle au rythme de la musique avec textes à l'écran, et permet de refaire une série en disant ce qui ne va pas.
**FRs covered:** FR-56, FR-20, FR-59, FR-57, FR-58, FR-29

### Epic 6 : Valider à plusieurs
Le propriétaire d'un espace à plusieurs active la validation ; un autre membre valide les vidéos ou les renvoie avec un commentaire à l'auteur.
**FRs covered:** FR-4, FR-39

### Epic 7 : Publier sur les réseaux
Le propriétaire autorisé connecte Instagram, Facebook, TikTok et YouTube, publie tout de suite ou à l'heure de Paris choisie, jamais deux fois, suit le résultat, rejoue un échec, annule ou déplace une publication programmée.
**FRs covered:** FR-41, FR-42, FR-63, FR-43, FR-44, FR-71

### Epic 8 : Données personnelles et exploitation
L'inscrite exporte ses données ou supprime son compte ; tout le monde peut signaler un contenu illicite, que l'administrateur traite ; l'instance est sauvegardée, restaurable et surveillée.
**FRs covered:** FR-53, FR-68, FR-69

## Epic 1: Compte, espace de marque et connexion de Claude

Une créatrice crée son compte, se connecte, crée un espace de marque, invite des membres, branche son Claude par OAuth et crée des jetons ; l'administrateur désigné à l'installation saisit les paramètres d'envoi des courriels ; chacun consulte son journal d'audit. L'épopée pose le dépôt, la CI, le coffre, le cloisonnement par la base et le registre de parité à trois portes, que toutes les épopées suivantes réutilisent.

### Story 1.1: Amorcer le dépôt, la CI et la première page

As a développeur de regie,
I want un dépôt monté selon la structure du socle, avec une CI qui bloque à chaque commit et une première page servie,
So that chaque histoire suivante s'ajoute sur une base testée, libre et sans secret.

**Acceptance Criteria:**

**Given** un clone vierge du dépôt
**When** je lance `npm ci --ignore-scripts` puis la commande de développement (compose, profil `cpu`)
**Then** `paquets/contrats`, `coeur/src/{env.ts,facades,services,domaine,infra}`, `migrations`, `services/`, `deploiement/` et `docs/rgpd/registre.md` existent (AR-1)
**And** le cœur fastify sert Astro en middleware et la page d'accueil s'affiche

**Given** un commit poussé sur Forgejo
**When** Forgejo Actions s'exécute
**Then** les suites bloquantes de base tournent : types (`astro check`, TS strict), vitest et scan de secrets (NFR-14)

**Given** une variable d'environnement lue ailleurs que dans `coeur/src/env.ts`
**When** la CI tourne
**Then** elle échoue en nommant le fichier fautif (AR-5)

**Given** les manifestes `package.json`, `pyproject.toml` et le fichier de versions
**When** la CI vérifie les dépendances
**Then** elles sont épinglées aux versions stables de la stack du socle (Node 26, fastify 5, Astro 7, Svelte 5, zod 4, PostgreSQL 18, Python 3.14…), sans aucune RC, et `pip` installe avec `--require-hashes` (AR-2, AR-23)

### Story 1.2: Une première page sûre, lisible et accessible

As a visiteuse,
I want une page qui ne charge rien d'un tiers, s'affiche bien sur mon téléphone et respecte mes réglages d'accessibilité,
So that regie est sûr et agréable dès la première page.

**Acceptance Criteria:**

**Given** la page d'accueil
**When** je l'ouvre
**Then** elle s'affiche sans aucune ressource tierce, sous une CSP `default-src 'self'` posée par `security.csp` d'Astro (NFR-35, AR-23)

**Given** la page d'accueil et l'en-tête commun (UX-DR4)
**When** je l'ouvre à 360, 768 et 1 280 px
**Then** les jetons de thème de UX-DR1 sont définis sur `:root`, aucun défilement horizontal n'apparaît (NFR-22, UX-DR2) et `prefers-reduced-motion` est respecté (UX-DR3)
**And** chaque page porte un lien vers le code source de la version en service (FR-67, AGPL-3.0)

### Story 1.3: Des suites de conformité qui bloquent chaque commit

As a mainteneur de regie,
I want que la CI refuse toute dépendance non libre, tout appel sortant non déclaré et tout mot interdit,
So that regie reste 100 % libre, local et fidèle à son vocabulaire sans relecture manuelle.

**Acceptance Criteria:**

**Given** un commit poussé sur Forgejo
**When** Forgejo Actions s'exécute
**Then** les suites bloquantes « licences » (npm, pip, polices, modèles, musique), « appels sortants » et « mots interdits » sur le fichier de chaînes unique tournent (NFR-26, NFR-36, AR-23, UX-DR23)
**And** une dépendance sans licence libre compatible, une sortie Internet hors de la liste du socle ou un mot interdit fait échouer la CI en nommant la cause

**Given** un commit sur `main`
**When** l'image est construite
**Then** elle est étiquetée par empreinte avec son SBOM, et `LICENCES-TIERS` est à jour (AR-1, AR-23)

### Story 1.4: Migrations contrôlées, coffre et démarrage sûr

As a administrateur de l'instance,
I want que regie refuse de démarrer si la clé maîtresse, la base ou un prérequis manque, et applique ses migrations sans perte,
So that aucun secret n'est jamais stocké en clair et qu'une mise à jour ne casse rien en silence.

**Acceptance Criteria:**

**Given** un fichier de migration SQL numéroté non encore appliqué
**When** le cœur démarre
**Then** il l'applique dans une transaction et inscrit son SHA-256 dans `migrations_appliquees` (AR-4, NFR-31)
**And** si un fichier déjà appliqué a changé, le démarrage est refusé en nommant le fichier

**Given** la clé maîtresse absente, illisible ou invalide
**When** le cœur démarre
**Then** il s'arrête avec la cause nommée, sans jamais écrire la valeur (NFR-15, NFR-30)

**Given** un secret déposé au coffre
**When** il est lu en base
**Then** il n'apparaît que chiffré en AES-256-GCM versionné, avec AAD `secret_id ‖ espace_id ‖ type`, sous la sous-clé HKDF `coffre` (AR-11)
**And** une rotation de la clé maîtresse rechiffre tous les secrets sans perte (test automatisé)

**Given** un journal contenant le nom ou la valeur d'un secret connu
**When** pino l'écrit
**Then** la valeur est masquée (AR-11, NFR-14)

**Given** l'instance démarrée
**When** j'appelle `/sante`
**Then** j'obtiens l'état de la base, du coffre et du disque, sans authentification et sans aucune donnée d'utilisateur (AR-24)

**Given** l'image du cœur et celle de PostgreSQL déployées dans le LXC `regie` (Debian 13, Podman 5.4, Quadlet, réseaux `--internal`)
**When** le LXC démarre
**Then** les unités démarrent dans l'ordre du socle : environnement, clé et coffre, base, migrations, services, façades, Astro (AR-3) ; l'application des résultats, la file et le planificateur prennent la fin de cet ordre dans les histoires qui les créent (2.1 et 2.2)
**And** seuls les ports 443 et 80 de Caddy sont exposés (AR-24)

**Given** la carte Intel Arc B570 partagée avec Tdarr
**When** la première tâche d'installation vérifie l'accès au GPU dans le LXC (pilote `xe`, intel-media-driver, Resizable BAR, `gid` du groupe `render`, idmap élargi, linger, cgroups v2)
**Then** le rapport est inscrit dans `deploiement/` ; si l'accès échoue, l'instance est configurée en repli processeur et `/sante` l'indique (AR-20, socle « différés »)

**Given** la commande de recette
**When** je la lance
**Then** un LXC `regie-recette` est créé à la demande depuis les mêmes images épinglées, avec des données de démonstration et sans aucun secret réel, puis détruit après usage (AR-1)

### Story 1.5: L'administrateur se connecte avec un second facteur

As a administrateur désigné à l'installation,
I want me connecter avec mon mot de passe et un second facteur, puis me déconnecter,
So that le compte le plus puissant de l'instance est protégé dès le premier jour.

**Acceptance Criteria:**

**Given** la commande d'installation qui désigne l'administrateur
**When** elle crée le compte
**Then** le mot de passe est haché par scrypt (≥ 100 ms) et le rôle d'administrateur ne peut être donné par aucune action de l'interface, du MCP ni de l'API (FR-70, NFR-20, AR-13)

**Given** l'administrateur à sa première connexion
**When** il saisit un mot de passe juste
**Then** regie lui impose d'enrôler un second facteur (TOTP ou WebAuthn) avant tout autre écran (AR-13)
**And** la session est créée en base, portée par un cookie `__Host-` et révocable

**Given** 5 échecs de connexion en 15 min pour un couple compte et IP
**When** une nouvelle tentative arrive
**Then** elle est freinée puis bloquée temporairement, et chaque échec est tracé (NFR-20, AR-13)

**Given** une action sensible (réglage d'administration, jeton, secret)
**When** la dernière authentification date de plus de 10 min
**Then** regie demande une réauthentification avant d'agir (AR-13)

**Given** une connexion, un échec ou une déconnexion
**When** l'action se termine
**Then** une ligne est ajoutée au journal d'audit en ajout seul, chaînée par sha256, sans secret (NFR-21, AR-13)

### Story 1.6: L'administrateur règle l'envoi des courriels

As a administrateur,
I want saisir, remplacer et tester les paramètres d'envoi des courriels dans l'interface,
So that regie peut envoyer les confirmations et les notifications sans qu'aucun secret ne soit versionné.

**Acceptance Criteria:**

**Given** l'écran d'administration des courriels
**When** je saisis hôte, port, identifiant et mot de passe SMTP puis j'enregistre
**Then** le mot de passe va au coffre et n'est plus jamais réaffiché : seul l'état (« configuré le … », « dernier test réussi ») est visible (FR-71)

**Given** des paramètres enregistrés
**When** je clique « Envoyer un courriel de test »
**Then** une ligne `courriels_sortants` est créée et envoyée, avec jusqu'à 3 essais, et le résultat s'affiche en clair (AR-22)

**Given** un utilisateur qui n'est pas administrateur, ou un appel MCP ou API
**When** il tente de lire ou modifier ces paramètres
**Then** l'accès est refusé : cette action est déclarée dans `exceptions-parite` comme réservée à l'interface (FR-47, AR-6)

### Story 1.7: S'inscrire et confirmer son courriel

As a visiteuse,
I want créer un compte avec mon courriel et un mot de passe, en acceptant les conditions,
So that je peux commencer à utiliser regie.

**Acceptance Criteria:**

**Given** les inscriptions ouvertes
**When** je m'inscris avec un courriel et un mot de passe et j'accepte les conditions d'utilisation et la politique de confidentialité
**Then** regie répond toujours « vérifie ta boîte », que l'adresse existe déjà ou non, et envoie un lien de confirmation unique (256 bits, haché en base) (FR-1, AR-13)
**And** la version des pages légales acceptée est enregistrée (FR-51)

**Given** les pages légales
**When** une visiteuse non connectée les ouvre
**Then** conditions d'utilisation et politique de confidentialité sont publiques et disent que l'utilisatrice reste propriétaire de ses rushes et vidéos (FR-51)

**Given** un compte au courriel non confirmé
**When** il tente de créer un espace ou une séance
**Then** regie refuse et propose de renvoyer le lien (AR-10)

**Given** l'administrateur qui suspend les inscriptions
**When** une visiteuse ouvre la page d'inscription
**Then** la page annonce que les inscriptions sont fermées et aucun compte ne peut être créé (FR-1)

**Given** une instance de production dont les inscriptions sont fermées
**When** l'administrateur veut les ouvrir
**Then** regie exige deux vérifications saisies et datées dans l'écran d'administration (l'examen des brevets H.264 pour un service hébergé, la mesure du débit montant et des coupures de la connexion du foyer), et lit le dernier chronométrage de recette réussi inscrit automatiquement par l'histoire 2.12 (NFR-2, NFR-34, socle « différés »)
**And** s'il en manque une, l'ouverture est refusée en nommant ce qui manque

**Given** la liste des routes publiques
**When** la suite « routes publiques » tourne
**Then** toute route hors de cette liste répond 401 sans session ni jeton (NFR-17)

### Story 1.8: Se connecter, se déconnecter et retrouver son mot de passe

As a créatrice inscrite,
I want me connecter, me déconnecter et réinitialiser mon mot de passe oublié,
So that j'accède à mon compte en sécurité depuis mon téléphone ou mon ordinateur.

**Acceptance Criteria:**

**Given** un compte confirmé
**When** je me connecte puis me déconnecte
**Then** la session est créée puis révoquée en base, et les deux actions sont tracées (FR-54)

**Given** la page « mot de passe oublié »
**When** je saisis une adresse
**Then** la réponse est identique que l'adresse existe ou non, et un lien unique valable 1 h est envoyé si elle existe (FR-54)
**And** la demande et l'usage du lien sont tracés

**Given** un lien de réinitialisation utilisé ou de plus de 1 h
**When** je l'ouvre
**Then** regie le refuse et propose d'en demander un autre

**Given** un mot de passe changé
**When** le changement est enregistré
**Then** toutes mes autres sessions sont révoquées (AR-13)

**Given** les formulaires de connexion
**When** je les parcours au clavier seul
**Then** chaque champ a un libellé, le focus est visible et les erreurs sont annoncées en texte (NFR-24, UX-DR24)

### Story 1.9: Mon espace personnel et mes espaces de marque

As a créatrice,
I want un espace personnel dès ma première connexion, créer des espaces de marque et passer de l'un à l'autre d'un geste,
So that les contenus de chaque marque restent séparés.

**Acceptance Criteria:**

**Given** un compte confirmé qui se connecte pour la première fois
**When** la session s'ouvre
**Then** un espace personnel existe, dont je suis propriétaire (FR-2)

**Given** l'en-tête de l'application
**When** je crée un espace de marque puis je change d'espace actif
**Then** le changement se fait en un geste et l'espace actif est rappelé dans l'en-tête (FR-2, UX-DR4)

**Given** toute table rattachée à un espace ou à un utilisateur
**When** une migration la crée
**Then** la RLS y est en `ENABLE` et `FORCE`, et une requête sans `app.utilisateur_id` ne renvoie rien (échec fermé) (AR-10)

**Given** deux comptes A et B avec chacun un espace
**When** la suite de cloisonnement tente, en tant que B, chaque lecture et écriture sur l'espace de A
**Then** chaque tentative est refusée, sans révéler l'existence de l'objet (FR-5, NFR-16)

### Story 1.10: Inviter et retirer des membres

As a propriétaire d'un espace de marque,
I want inviter un membre par un lien, lui accorder ou retirer le droit de publier, et le retirer de l'espace,
So that je travaille à plusieurs sur une marque sans partager mon compte.

**Acceptance Criteria:**

**Given** un espace dont je suis propriétaire
**When** je crée une invitation
**Then** regie produit un lien unique valable 7 jours, à usage unique (FR-3)
**And** un lien expiré ou déjà utilisé est refusé avec un message clair

**Given** une personne connectée qui ouvre une invitation valide
**When** elle l'accepte
**Then** elle devient membre et voit l'espace dans son sélecteur

**Given** un membre de mon espace
**When** je lui accorde ou retire le droit de publier
**Then** le droit change dès sa requête suivante et l'action est tracée (FR-3)

**Given** un membre retiré
**When** il fait une nouvelle requête sur l'espace par n'importe quelle porte
**Then** l'accès est refusé, et les vidéos dont il était l'auteur restent dans l'espace (FR-3, AR-7, AR-10)

**Given** un appel MCP ou API qui tente de gérer les membres ou leurs droits
**When** il arrive
**Then** il est refusé : action déclarée « interface seule » (FR-47)

### Story 1.11: Une API privée à jetons, en parité avec l'interface

As a créatrice qui automatise,
I want créer dans l'interface des jetons d'API limités et appeler `/api/v1` avec les mêmes règles que l'interface,
So that mes scripts font exactement ce que je fais à la main, sans jamais voir un secret.

**Acceptance Criteria:**

**Given** l'écran « Jetons »
**When** je crée un jeton en choisissant expiration (90 jours au plus), espaces et portées
**Then** il est affiché une seule fois sous la forme `regie_pat_…`, stocké haché, et révocable (FR-46, AR-13)

**Given** une action métier écrite dans `coeur/src/services`
**When** elle est inscrite au registre unique
**Then** elle est servie à `/api/v1/<domaine>/<verbe>` avec la même validation zod, les mêmes droits et la même `ErreurMetier` que l'îlot d'interface (FR-47, AR-6, NFR-28)
**And** le test de parité échoue pour toute action ni servie ni déclarée dans `exceptions-parite`

**Given** une erreur métier
**When** elle est renvoyée par l'API
**Then** la réponse est `{ ok: false, erreur: { code, message, contexte } }` avec un code stable `DOMAINE_CAUSE`, un message en français et le bon statut HTTP, sans secret (FR-48, AR-5)

**Given** une version publiée
**When** la CI construit la référence
**Then** la référence de l'API et du MCP est générée depuis le registre et un test de dérive bloque toute différence (FR-65, NFR-28)
**And** `CHANGELOG-API` annonce tout changement incompatible une version à l'avance (NFR-29)

### Story 1.12: Brancher son Claude sur regie

As a créatrice,
I want connecter mon Claude à regie par un bouton « Se connecter », en choisissant l'espace et ce qu'il a le droit de faire,
So that je pilote regie en conversation sans jamais lui confier un mot de passe.

**Acceptance Criteria:**

**Given** Claude qui découvre le serveur MCP de regie
**When** il lance la connexion
**Then** regie joue le serveur d'autorisation OAuth 2.1 (PKCE S256, CIMD ou DCR bornée, RFC 9207) et affiche un écran de consentement sous session où je choisis l'espace et les droits (FR-46, AR-13)

**Given** un jeton d'accès accordé
**When** Claude appelle un outil `<domaine>_<verbe>` sur `/mcp` (Streamable HTTP, sans état)
**Then** l'outil appelle le même service que l'interface, limité à l'espace et aux droits choisis (FR-47, NFR-28)
**And** le jeton d'accès est court et le rafraîchissement est tournant

**Given** une erreur
**When** l'outil échoue
**Then** il rend le même code stable, le message en français et le contexte, sans secret (FR-48)

**Given** l'écran « Connexions de Claude »
**When** je révoque une connexion
**Then** l'appel suivant de Claude est refusé

**Given** un texte venu d'un autre membre ou d'une transcription
**When** il est rendu à Claude
**Then** il est placé dans un champ marqué `non_fiable` (AR-25)

### Story 1.13: Consulter le journal d'audit

As a créatrice, propriétaire ou administrateur,
I want consulter le journal d'audit de ce que je peux voir, avec des filtres,
So that je sais qui a fait quoi, depuis quelle porte et avec quel jeton.

**Acceptance Criteria:**

**Given** le journal d'audit
**When** je l'ouvre
**Then** je vois mes propres actions ; en tant que propriétaire, celles de mon espace ; en tant qu'administrateur, celles de l'instance, sans le contenu des espaces dont je ne suis pas membre (FR-66, FR-70)

**Given** des filtres période, utilisateur, origine (interface, MCP, API) et objet
**When** je les applique
**Then** la liste se restreint en conséquence, en heure de Paris (NFR-25)

**Given** le rôle `regie_admin`
**When** une requête tente un SELECT sur une table de contenus
**Then** la base la refuse (AR-10)

**Given** le chaînage sha256 du journal
**When** une ligne est modifiée après coup
**Then** la commande de vérification du chaînage le détecte (AR-13) ; sa programmation nocturne arrive avec le planificateur (histoire 2.2)

## Epic 2: Des rushes au premier brouillon sous-titré

La créatrice règle son gabarit, envoie ses rushes, suit la file et ses notifications, relance une étape en échec, et reçoit un brouillon face caméra simple — silences coupés, sous-titres mot à mot, gardes respectées — visible dans une page d'aperçu et lisible par les trois portes ; les rushes sont purgés à l'échéance.

### Story 2.1: Une file de traitement durable et équitable

As a créatrice,
I want que mes traitements survivent à un redémarrage et passent à tour de rôle avec ceux des autres,
So that je n'attends jamais à cause d'un autre utilisateur ni d'une panne.

**Acceptance Criteria:**

**Given** les fonctions SQL `file_prendre`, `file_renouveler`, `file_terminer`, `file_echouer`, `file_point_de_non_retour`, `file_annuler`, `file_geler` livrées par migration
**When** un service prend une tâche
**Then** la prise se fait par `SKIP LOCKED` avec un bail d'au moins 3 fois l'intervalle de renouvellement, la classe `interactive` passe avant `lot`, et l'équité se fait par utilisateur (AR-15, NFR-4)

**Given** le registre `paquets/contrats/taches.ts`
**When** un type de tâche y est déclaré
**Then** il porte son délai de garde de NFR-11, sa classe, son besoin de GPU et sa politique de reprise (`permise` ou `interdite`) (AR-15, AR-16)

**Given** un service tué pendant une tâche
**When** son bail expire
**Then** la tâche est reprise une seule fois si sa reprise est `permise`, sinon elle passe en échec `RESULTAT_INCONNU` avec cause et action (AR-15, NFR-7, NFR-10)

**Given** deux tâches GPU prêtes
**When** deux services tentent de les prendre
**Then** une seule tient le sémaphore GPU, garanti par un index unique partiel (AR-15)

**Given** le module `application-resultats`
**When** une tâche se termine
**Then** son résultat est appliqué au démarrage, sur `NOTIFY` ou au balayage de 30 s, une seule fois (AR-7)
**And** la suite commune TS/Python de la file, avec coupures simulées, passe en CI

### Story 2.2: Des échéances qui ne se perdent pas

As a créatrice,
I want que tout ce que regie doit faire à une date donnée se fasse, même après un arrêt du serveur,
So that aucun rappel, aucune purge ni aucune expiration ne se perd.

**Acceptance Criteria:**

**Given** la table `echeances` livrée par migration (type, objet, instant UTC, état)
**When** une fonction de `coeur/src/services` programme une échéance
**Then** elle l'inscrit dans la même transaction que l'action métier (AR-6, AR-22)
**And** les types du socle sont déclarés : publication, rendu différé, purge et rappel, expirations, rappels de connexion, suppression annoncée (AR-22)

**Given** le planificateur
**When** le cœur démarre
**Then** il prend place à la fin de l'ordre de démarrage, après l'application des résultats et la file (AR-3)
**And** chaque échéance due déclenche une tâche interne dans `travaux_internes`, une seule fois (AR-16)

**Given** un arrêt du serveur
**When** il redémarre
**Then** les échéances en retard de moins de 2 h sont rattrapées ; une plus ancienne est traitée selon la règle de son type, qui la rattrape ou la passe en échec avec la cause (AR-22, NFR-8)

**Given** le journal d'audit chaîné
**When** la nuit arrive
**Then** sa vérification et l'export du chaînage sha256 tournent, et un écart alerte l'administrateur (AR-13)

**Given** les changements d'heure d'été et d'hiver
**When** la suite de tests du planificateur tourne
**Then** les instants restent justes en UTC et en heure de Paris (NFR-25)

### Story 2.3: Envoyer ses rushes, même si le réseau coupe

As a créatrice,
I want ouvrir une séance avec mon intention et envoyer mes rushes depuis mon téléphone ou mon ordinateur, en reprenant là où l'envoi s'est arrêté,
So that je ne renvoie jamais ce qui est déjà parti.

**Acceptance Criteria:**

**Given** l'écran « Nouvelle séance »
**When** j'écris mon intention en texte libre et je choisis un ou plusieurs rushes (jusqu'en 4K)
**Then** une séance est créée et l'envoi part par tus, `Upload-Length` obligatoire (FR-9, AR-8)

**Given** un envoi de 500 Mo coupé (réseau, veille, onglet fermé) puis rétabli dans les 24 h
**When** je reviens sur la séance
**Then** l'envoi reprend sans renvoyer ce qui est reçu (FR-10)
**And** au-delà de 24 h, l'envoi expire et sa réservation de quota est libérée (AR-14)

**Given** mes quotas (2 h par mois de Paris, 20 Go, 30 min par séance)
**When** je crée un envoi
**Then** la durée et la taille sont réservées sous `FOR UPDATE` avant le transfert, et un dépassement est refusé avec le quota en cause et ce qui reste (FR-1, FR-9, AR-14)

**Given** moins de 15 % d'espace disque libre
**When** un envoi est créé
**Then** il est refusé avec un message clair (AR-8)

**Given** une créatrice non membre de l'espace
**When** elle tente d'écrire dans l'envoi d'une autre
**Then** le crochet d'appartenance tus refuse (AR-8, NFR-16)

### Story 2.4: Contrôle de mes rushes à réception

As a créatrice,
I want savoir tout de suite si un rush est horizontal, illisible ou sans voix,
So that je le retire ou le garde avant de perdre du temps de traitement.

**Acceptance Criteria:**

**Given** un rush entièrement reçu
**When** l'envoi se termine
**Then** une tâche `analyse_media` vérifie la signature magique puis mesure orientation, durée, son et lisibilité dans un conteneur sans réseau ; le cœur n'appelle jamais ffprobe (FR-11, AR-12)
**And** la durée réelle convertit la réservation de quota (AR-14)

**Given** un rush horizontal ou illisible
**When** l'analyse se termine
**Then** il est signalé avec la raison, et je choisis de le retirer ou de le garder (FR-11)

**Given** un rush sans voix détectée
**When** l'analyse se termine
**Then** regie le note seulement pour proposer plus tard une recette sans parole (FR-11)

**Given** un fichier piégé (lien symbolique, faux en-tête)
**When** il est traité
**Then** les services restent confinés à `taches/<id>/{entrees,sortie}` avec relecture `O_NOFOLLOW` (AR-12)

### Story 2.5: Suivre ma séance dans la file

As a créatrice,
I want voir dès la fin de l'envoi l'heure estimée de mes brouillons, ma position dans la file et l'étape en cours,
So that je sais quand revenir.

**Acceptance Criteria:**

**Given** l'envoi terminé
**When** j'ouvre la séance
**Then** je vois l'étape en cours, ma position et une heure estimée en clair (« vers 18 h 40 », heure de Paris) (FR-12, FR-31, NFR-25, UX-DR23)

**Given** l'estimation
**When** elle est calculée
**Then** elle simule l'ordre de prise sur les durées des 50 dernières tâches, et le temps restant reste à moins de 30 % d'écart dans 80 % des cas sur le jeu de recette (NFR-3, AR-15)

**Given** une séance ouverte dans l'interface
**When** l'étape change
**Then** l'affichage se met à jour par SSE, l'objet étant relu avec mes droits recalculés, et le flux se ferme sur 401 ou 403 (AR-8)

**Given** chaque îlot de la séance
**When** il charge, réussit ou échoue
**Then** il montre un état chargement, prêt ou erreur qui nomme la cause et l'action possible (UX-DR25)

### Story 2.6: Être prévenue et relancer une étape en échec

As a créatrice,
I want être prévenue dans l'interface et par courriel quand ma série est prête ou qu'une étape échoue, et relancer cette étape,
So that aucun échec ne passe inaperçu et que je ne renvoie jamais mes rushes.

**Acceptance Criteria:**

**Given** un événement de la liste des notifications (ici une étape en échec ; « série prête » l'emprunte dès l'histoire 2.12)
**When** l'événement survient
**Then** une notification d'interface et une ligne `courriels_sortants` sont créées dans la même transaction (FR-32, AR-25)
**And** un échec nomme l'étape, la cause et l'action possible (NFR-10)

**Given** une étape en échec
**When** rien n'est fait
**Then** regie ne la retente jamais automatiquement ; seuls les courriels ont 3 essais (FR-32)

**Given** une étape en échec et des rushes non purgés
**When** je clique « Relancer »
**Then** l'étape repart sans renvoi des rushes, l'historique des tentatives est visible, et la vidéo retrouve son statut après une relance réussie (FR-33)

**Given** une relance déclenchée par le MCP ou l'API
**When** elle arrive
**Then** elle suit le même service et les mêmes règles (FR-47)

### Story 2.7: Un gabarit de départ, des gardes et une mise en page communes

As a créatrice,
I want un gabarit prêt dès la création de mon espace, que je personnalise au téléphone en trois choix,
So that mes premiers brouillons ont déjà l'air de ma marque et restent lisibles.

**Acceptance Criteria:**

**Given** un nouvel espace
**When** il est créé
**Then** il reçoit le gabarit de départ, et je peux changer couleur principale, police et style des sous-titres en trois choix (FR-55)

**Given** le module pur `mise-en-page`
**When** il place textes et sous-titres
**Then** il est un module pur, sans dépendance au navigateur ni à FFmpeg, couvert par ses tests unitaires ; le test image rendu ⇔ lecteur arrive avec le lecteur (histoire 3.1) (AR-19)

**Given** le module pur de gardes `(montage, mesures, bornes) → violations[]` et `deploiement/bornes.json`
**When** un élément a un contraste sous 4,5:1, des capitales sous 48 px sur 1 920 ou sort de la zone sûre 880×1220 placée à (0, 220)
**Then** la violation nomme segment, code temporel, mesure et seuil, et l'erreur `GARDE_NON_RESPECTEE` répond 422 (FR-28, AR-18, NFR-27)
**And** aucune garde ne peut être forcée, par aucune porte

**Given** les polices proposées
**When** une police est ajoutée
**Then** elle porte une licence libre vérifiée par la suite « licences » (FR-6, AR-17)

### Story 2.8: Définir mon gabarit complet et le prévisualiser

As a créatrice,
I want définir logo, couleurs, polices, style des sous-titres, carte de fin, légende et hashtags par défaut, et les voir sur un brouillon d'exemple avant d'enregistrer,
So that chaque brouillon sort à l'image de ma marque.

**Acceptance Criteria:**

**Given** l'éditeur de gabarit
**When** je règle logo, 2 à 4 couleurs, polices des titres et des sous-titres, style des sous-titres, carte de fin, légende et hashtags par défaut
**Then** un aperçu sur un brouillon d'exemple se met à jour avant l'enregistrement (FR-6, FR-7)

**Given** un réglage qui viole une garde
**When** j'enregistre
**Then** l'enregistrement est refusé en nommant l'élément, la mesure et le seuil (FR-7)

**Given** un logo SVG importé
**When** il est reçu
**Then** il est rastérisé à l'import (AR-12)

**Given** un espace qui a déjà 3 gabarits
**When** j'en crée un quatrième
**Then** regie refuse ; avec plusieurs gabarits, je choisis lequel utiliser à l'envoi d'une séance (FR-6, AR-14)

### Story 2.9: Transcrire mes rushes sur le serveur, mot à mot

As a créatrice,
I want que mes rushes soient transcrits mot à mot sur le serveur de regie, sans IA en nuage,
So that les sous-titres et les coupes s'appuient sur ce que je dis vraiment.

**Acceptance Criteria:**

**Given** des rushes français fournis par Benjamin avec son consentement écrit (face caméra, lifestyle, voix off, environ 30 min au total)
**When** le jeu de référence est constitué
**Then** il est rangé hors du dépôt public, dans `RACINE_DONNEES/reference/` sur l'hôte et dans le LXC `regie-recette`, avec sa transcription exacte et les coupes attendues annotées par Benjamin (préalable de 2.10)
**And** ce même jeu sert au banc de transcription, au banc du modèle de langage, à l'estimation de 2.5, au chronométrage de 2.12 et au test image rendu ⇔ lecteur de 3.1

**Given** un rush avec voix
**When** la tâche `transcription` s'exécute
**Then** le service Python, sur un réseau sans sortie, transcrit avec OpenVINO GenAI et Whisper large-v3-turbo, avec un horodatage par mot (AR-20, NFR-35)
**And** la mémoire du GPU est libérée à la fin de la tâche, et le service bascule sur le processeur si le GPU manque

**Given** les modèles
**When** le service démarre
**Then** il ne lit que `/modeles`, vérifie chaque fichier contre `deploiement/modeles.lock` (licence, SHA-256) et refuse de démarrer en nommant le manquant (NFR-26, NFR-30)

**Given** le jeu de rushes français de référence
**When** le banc de transcription tourne
**Then** le taux d'erreur de mots est d'au plus 10 % (NFR-38)
**And** le banc mesure les horodatages au mot sur la B570 et l'indice de confiance par mot calculé par regie (probabilités des jetons si la version épinglée les expose, sinon heuristique : durée anormale, désaccord entre deux passes) ; il inscrit dans `deploiement/` si l'indice est validé (AR-17)

**Given** un indice de confiance non validé par le banc
**When** une transcription est produite
**Then** le champ de confiance reste absent du montage, aucun mot n'est marqué « peu sûr », et les écrans qui affichent les doutes montrent zéro zone douteuse sans erreur (AR-17)

**Given** les contrats de la tâche
**When** la CI tourne
**Then** les modèles pydantic générés depuis les schémas zod sont identiques à ceux du dépôt (test de dérive, AR-9)

### Story 2.10: Choisir le modèle de langage au banc

As a créatrice,
I want que regie utilise le modèle de langage local qui coupe le mieux mes rushes français dans le temps promis,
So that mes brouillons sont bons et arrivent à l'heure.

**Acceptance Criteria:**

**Given** les quatre candidats du socle (Ministral-3-8B-Instruct, granite-4.2-8b, Qwen3-8B, EuroLLM-9B, tous Apache-2.0) et les backends de llama.cpp (Vulkan, SYCL, OpenVINO)
**When** le banc tourne sur le jeu de rushes français de référence, dont les coupes attendues ont été annotées par Benjamin
**Then** il mesure pour chaque couple : sorties valides au schéma « compatible grammaire », accord des coupes avec l'annotation, durée de la tâche `langage` et tenue dans la VRAM à tour de rôle avec la transcription (AR-9, AR-20)

**Given** les mesures du banc
**When** le choix est fait
**Then** sont éliminés les couples qui ne tiennent pas dans la VRAM ou qui empêchent de tenir NFR-2 ; parmi les autres, le couple qui a le meilleur accord avec l'annotation est retenu (NFR-2)
**And** le modèle, sa quantification, le backend et le build épinglé sont inscrits dans `modeles.lock` (licence, SHA-256), avec le rapport du banc dans `deploiement/` (AR-20)

**Given** aucun couple qui tient NFR-2 sur le GPU
**When** le banc se termine
**Then** le meilleur couple est retenu en repli processeur, la version reste utilisable, et le rapport déclenche la décision « second hôte » du socle (NFS et WireGuard), à prendre par l'administrateur (socle « différés »)

**Given** le service `langage`
**When** il démarre
**Then** il ne charge que le modèle inscrit dans `modeles.lock` et refuse de démarrer en nommant le manquant (NFR-30)

### Story 2.11: Un premier brouillon coupé et sous-titré

As a créatrice,
I want que regie coupe mes silences, hésitations et faux départs et pose des sous-titres mot à mot à mon style,
So that j'obtiens un brouillon propre sans toucher à une timeline.

**Acceptance Criteria:**

**Given** une transcription terminée
**When** la tâche `langage` s'exécute
**Then** le modèle retenu au banc (histoire 2.10 ; llama.cpp, sortie contrainte par la variante « compatible grammaire » du schéma, température 0, graine fixe, `--parallel 1`) propose les coupes d'hésitations et de faux départs (FR-21, AR-9, AR-20)
**And** la même sortie propose trois accroches pour les deux premières secondes, que le montage range en variantes (FR-23)

**Given** la proposition et la transcription
**When** le cœur crée le montage
**Then** les silences de plus de 0,7 s sont coupés et le montage est une ligne JSON versionnée et immuable, créée par le cœur seul (FR-21, AR-17)
**And** les sous-titres sont mot à mot, animés au style du gabarit, et les mots peu sûrs sont marqués quand l'indice de confiance est validé (histoire 2.9) (FR-22)

**Given** un brouillon ou une vidéo
**When** je lis sa structure par l'interface, le MCP ou l'API
**Then** j'obtiens recette, segments, transcription, textes, musique, couverture et zones douteuses (FR-64)

**Given** un nombre de brouillons de la séance
**When** il dépasserait 5
**Then** regie s'arrête à 5 (AR-14)

### Story 2.12: Voir mon brouillon dans une page d'aperçu

As a créatrice,
I want regarder mon brouillon dans une version allégée qui démarre vite, et voir clairement s'il est bloqué par une garde,
So that je juge le résultat avant de le relire en détail.

**Acceptance Criteria:**

**Given** un montage créé
**When** la tâche `rendu_allege` s'exécute
**Then** FFmpeg en `h264_vaapi` (ou en `libx264`, dans son conteneur, si l'instance est en repli processeur, histoire 1.4) produit une version allégée de moins de 15 Mo pour 60 s, servie par une adresse signée HMAC de moins de 1 h, usage `session`, sur `fichiers.<domaine>` (NFR-33, NFR-18, AR-12)

**Given** la page d'aperçu en 4G (10 Mbit/s)
**When** je l'ouvre
**Then** la lecture démarre en moins de 2 s (NFR-5)

**Given** un brouillon qui viole une garde
**When** je l'ouvre
**Then** il est visible, marqué « bloqué », avec le segment fautif mis en avant, la mesure et le seuil (FR-28, UX-DR15)

**Given** deux rendus des mêmes entrées avec les mêmes versions, matériel, pilote et moteur
**When** la suite de reproductibilité les compare
**Then** les montages sont identiques à 40 ms près (FR-30, NFR-12, AR-17)

**Given** 10 min de rushes 1080p et une file vide sur la recette
**When** le chronométrage de la version tourne
**Then** la série est prête en moins de 15 min, sinon la version est refusée (NFR-2, AR-1)
**And** le résultat daté est inscrit comme dernier chronométrage de recette, que l'ouverture des inscriptions exige (histoire 1.7)

### Story 2.13: Changer de gabarit sans toucher au passé

As a créatrice,
I want qu'un nouveau gabarit s'applique aux brouillons suivants, et régénérer au besoin un brouillon en cours avec lui,
So that mes vidéos déjà prêtes ou publiées ne changent pas sans moi.

**Acceptance Criteria:**

**Given** un gabarit modifié
**When** une nouvelle séance est traitée
**Then** elle utilise le nouveau gabarit, et les vidéos prêtes, archivées ou publiées restent inchangées (FR-8)

**Given** un brouillon en relecture et des rushes non purgés
**When** je demande « Régénérer avec le gabarit actuel »
**Then** un nouveau montage est créé, l'ancien reste en historique (FR-8, AR-17)

**Given** des rushes purgés
**When** je demande la régénération
**Then** regie refuse avec `SEANCE_PURGEE` et la date de purge (FR-52, AR-7)

### Story 2.14: Purge de mes rushes à date annoncée

As a créatrice,
I want connaître la date de purge de mes rushes, être prévenue avant, et savoir ce qui reste possible ensuite,
So that le disque du serveur ne se remplit pas et que je ne suis jamais surprise.

**Acceptance Criteria:**

**Given** une séance dont la série a été livrée
**When** la série est livrée
**Then** des échéances de rappel à 30 jours et de purge à 60 jours après la livraison sont créées (histoire 2.2), et la date de purge est affichée sur la séance (FR-52, AR-22)

**Given** une séance jamais triée en entier
**When** 30 jours passent depuis la livraison de sa série
**Then** je reçois un rappel par courriel, et les rushes sont purgés 60 jours après la livraison ; les brouillons déjà rendus restent téléchargeables jusqu'à la purge (FR-52)

**Given** une purge à exécuter
**When** le rendu complet du montage en vigueur n'existe pas encore
**Then** la purge attend ; sinon elle passe `purge_en_cours`, et toute action qui lit les rushes est refusée sous `FOR SHARE` (AR-7, AR-12)

**Given** une séance purgée
**When** je tente refaire, corriger, changer de variante, régénérer, relancer une étape qui lit les rushes ou récupérer un brouillon jeté
**Then** regie refuse avec `SEANCE_PURGEE` ; l'export, la publication, la programmation et l'archivage restent possibles (FR-52)

## Epic 3: Relire, corriger, choisir et exporter

La créatrice parcourt sa série dans le fil « Relire » plein écran, garde ou jette d'un geste, corrige par le texte ou à la voix en commençant par les zones douteuses, choisit accroche, musique, couverture et prise, ajuste légende et hashtags, puis télécharge la vidéo prête sans filigrane et retrouve tout dans sa bibliothèque.

### Story 3.1: Parcourir ma série en plein écran

As a créatrice,
I want parcourir les brouillons d'une série en plein écran, avec le son, comme dans un fil,
So that je relis vite, au téléphone, comme je regarde mes réseaux.

**Acceptance Criteria:**

**Given** une série prête
**When** j'ouvre « Relire »
**Then** la carte vidéo occupe l'écran avec accroche, texte à l'écran, sous-titres au style du gabarit et signature ; le haut montre les segments de la série, « Brouillon 1 sur 3 », le titre, le retour aux séances et le bouton son (`aria-pressed`) (FR-34, UX-DR5)
**And** la lecture démarre automatiquement avec le son en moins de 2 s en 4G, sur la version allégée (FR-61, NFR-5)

**Given** l'écran de 360 px à l'ordinateur
**When** je l'affiche
**Then** la carte est plein écran sur téléphone et arrondie à partir de 700 px, sans défilement horizontal (UX-DR2, NFR-22)

**Given** la suite visuelle à 360, 768 et 1 280 px et la suite de contraste
**When** la CI tourne
**Then** les captures de référence et le contraste de 4,5:1 passent (NFR-22, NFR-23)

**Given** le lecteur du navigateur et le générateur ASS qui partagent le module `mise-en-page`
**When** le test image rendu ⇔ lecteur compare une image du rendu et la même image dessinée par le lecteur sur les montages du jeu de recette
**Then** textes et sous-titres tombent à la même place, et le test bloque la CI en cas d'écart (AR-19)

### Story 3.2: Garder ou jeter d'un geste

As a créatrice,
I want garder ou jeter un brouillon d'un glissement ou d'un bouton, et annuler juste après,
So that je trie ma série en quelques secondes sans peur de me tromper.

**Acceptance Criteria:**

**Given** un brouillon dans le fil
**When** je le glisse à droite ou à gauche au-delà de 30 % de la largeur
**Then** il est gardé ou jeté avec le tampon « Gardée » ou « Jetée », et le suivant s'affiche (FR-35, UX-DR6)
**And** les boutons « Jeter », « Lecture » et « Garder » font la même chose, ainsi que les flèches droite et gauche et la barre d'espace, inactives dans un champ (NFR-24)

**Given** un geste fait
**When** le toast `role="status"` s'affiche
**Then** il propose « Annuler » pendant 4 s (UX-DR7)

**Given** un brouillon bloqué par une garde
**When** je tente de le garder
**Then** « Garder » est désactivé avec la raison, le segment fautif nommé (FR-28, UX-DR15)

**Given** un brouillon gardé dans un espace sans validation
**When** il est gardé
**Then** il devient « prêt », et le rendu complet 1 080×1 920 tiré des rushes d'origine est lancé 10 min après la dernière correction ou à la demande (FR-4, FR-61, AR-19)

**Given** le dernier brouillon trié
**When** la série est relue en entier
**Then** l'écran « Série relue » montre gardées et jetées, l'heure où elles seront prêtes, « Revoir la série » et la date de récupération des jetées (UX-DR14)
**And** la date de purge passe à 30 jours après ce tri complet (FR-52)

**Given** un brouillon jeté et des rushes non purgés
**When** je le récupère
**Then** il revient dans la série (FR-35)

**Given** chaque geste, temps de relecture et correction
**When** il a lieu
**Then** il est inscrit dans `mesures_usage`, sans service tiers (NFR-37, AR-25)

### Story 3.3: Corriger par le texte, en commençant par les doutes

As a créatrice,
I want voir d'abord les passages douteux, barrer ou rétablir une phrase et corriger un mot ou un texte à l'écran,
So that je corrige en touchant du texte, sans timeline, et je vois le résultat en quelques secondes.

**Acceptance Criteria:**

**Given** le rail d'outils (Corriger avec la pastille du nombre de doutes, Dicter, Variantes, Légende)
**When** j'ouvre « Corriger »
**Then** une feuille du bas (panneau latéral à partir de 900 px) s'ouvre en `role="dialog"`, avec titre, poignée, bouton Fermer et Échap ; une seule feuille est ouverte à la fois (UX-DR8, UX-DR9)

**Given** les zones douteuses (mots peu sûrs, coupes et frontières d'idée incertaines)
**When** la feuille s'ouvre
**Then** elles sont proposées en premier, surlignées et marquées « réglée » une fois traitées (FR-60, UX-DR10)

**Given** la transcription par phrases
**When** je touche une phrase
**Then** elle est coupée ou remise, avec le libellé « Couper : … » ou « Remettre : … », barrée et pas seulement colorée (FR-36, UX-DR10, UX-DR24)
**And** je peux aussi corriger un mot de sous-titre ou un texte à l'écran

**Given** une correction
**When** elle est enregistrée
**Then** un nouveau montage est créé, l'aperçu l'applique tout de suite puis la version allégée arrive en classe interactive, avec l'état « Mise à jour de l'aperçu… » (`role="status"`), le tout en moins de 10 s (FR-36, NFR-6, UX-DR11, AR-19)

**Given** une vidéo prête corrigée
**When** la correction est enregistrée
**Then** elle repasse « gardée » (FR-36)

**Given** une publication programmée ou publiée, ou des rushes purgés
**When** je tente de corriger
**Then** regie refuse en disant pourquoi, et la feuille rappelle la date limite de correction (FR-36, FR-52, UX-DR10)

### Story 3.4: Corriger à la voix

As a créatrice,
I want dire « coupe la deuxième phrase » et voir la correction appliquée,
So that je corrige sans taper, le téléphone à la main.

**Acceptance Criteria:**

**Given** la feuille « Corriger » ou le bouton « Dicter »
**When** j'appuie sur le micro (`aria-pressed`)
**Then** une consigne `aria-live="polite"` m'indique quoi dire, et l'enregistrement part au serveur pour une transcription locale (FR-62, UX-DR10, NFR-35)

**Given** une consigne comprise
**When** elle est transcrite
**Then** elle est appliquée comme une correction par le texte, avec les mêmes règles et le même toast « Annuler » (FR-62)

**Given** une consigne non comprise
**When** la transcription se termine
**Then** regie dit ce qu'il a entendu et propose de reformuler, sans rien changer

### Story 3.5: Choisir mon accroche, ma couverture et ma prise

As a créatrice,
I want choisir entre trois accroches, trois couvertures et les autres prises, avec un aperçu immédiat,
So that je garde la meilleure version sans refaire de montage.

**Acceptance Criteria:**

**Given** un brouillon
**When** il est monté
**Then** il porte une accroche dans les deux premières secondes avec trois variantes, et trois variantes de couverture au style du gabarit (FR-23, FR-25)

**Given** la feuille « Variantes »
**When** je l'ouvre
**Then** les onglets `role="tablist"` Accroche, Musique, Couverture et Prise s'affichent (UX-DR12)

**Given** une variante choisie
**When** je la touche
**Then** l'aperçu l'applique en moins de 2 s et un nouveau montage est créé (FR-37)

**Given** des rushes purgés
**When** je change de variante
**Then** regie refuse avec `SEANCE_PURGEE` (FR-37, FR-52)

### Story 3.6: Une musique libre, sous ma voix

As a créatrice,
I want choisir entre trois musiques ou « sans musique », dans une bibliothèque de morceaux libres, selon mes ambiances préférées,
So that ma vidéo a du rythme sans risque de droits et sans couvrir ma voix.

**Acceptance Criteria:**

**Given** la bibliothèque musicale
**When** un morceau y entre
**Then** il porte source, licence et attribution, et seuls les morceaux d'usage commercial sans redevance sont acceptés ; la suite « licences » le vérifie (FR-49, AR-17)

**Given** un morceau proposé par une utilisatrice
**When** il est soumis
**Then** il reste invisible jusqu'à vérification par l'administrateur (FR-49, FR-70)

**Given** une instance neuve dont le catalogue est vide
**When** l'administrateur ajoute les premiers morceaux par l'écran d'administration du catalogue (fichier, source, licence, attribution, ambiance)
**Then** ils entrent sous les mêmes règles de licence (FR-49, FR-70)
**And** tant qu'une ambiance compte moins de trois morceaux, regie propose ceux qui existent plus « sans musique », sans erreur (FR-24)

**Given** les ambiances préférées du gabarit (énergique, calme, sans musique par défaut)
**When** regie propose des musiques
**Then** il en propose trois selon ces ambiances, plus « sans musique », dans l'onglet Musique (FR-24, FR-50, UX-DR12)

**Given** une musique sous une voix
**When** le rendu la mixe
**Then** la musique reste au moins 12 dB sous la voix (FR-24, NFR-39)

**Given** une vidéo avec musique
**When** sa légende est produite
**Then** l'attribution du morceau y est ajoutée (FR-49)

### Story 3.7: Ma légende et mes hashtags

As a créatrice,
I want lire et corriger la légende et les hashtags proposés pour le réseau visé,
So that ma publication respecte les règles du réseau.

**Acceptance Criteria:**

**Given** la feuille « Légende et hashtags »
**When** je l'ouvre
**Then** je choisis le réseau visé (`radiogroup`), je modifie la légende avec un compteur, je retire ou ajoute des puces de hashtags (FR-38, UX-DR13)

**Given** une légende ou un nombre de hashtags hors des bornes du réseau dans `bornes.json`
**When** je dépasse
**Then** une alerte `role="alert"` nomme la borne dépassée, et l'enregistrement est refusé (FR-38, UX-DR13)

### Story 3.8: Télécharger ma vidéo prête

As a créatrice,
I want télécharger une vidéo prête au format vertical, avec sa légende et sa couverture, sans filigrane,
So that je la publie moi-même où je veux.

**Acceptance Criteria:**

**Given** une vidéo prête dont le rendu complet est fait
**When** je clique « Télécharger »
**Then** j'obtiens la vidéo 1 080×1 920 sans filigrane, sa couverture et sa légende, par une adresse signée de moins de 1 h (FR-40, NFR-18)

**Given** une vidéo prête dont le rendu complet n'est pas encore fait
**When** je demande le téléchargement
**Then** regie lance le rendu et m'indique l'heure estimée

**Given** des rushes purgés
**When** je télécharge une vidéo prête
**Then** le téléchargement reste possible (FR-52)

### Story 3.9: Ma bibliothèque de vidéos

As a créatrice,
I want lister mes vidéos par espace, statut et période, puis supprimer ou archiver,
So that je retrouve tout et je fais le ménage.

**Acceptance Criteria:**

**Given** la bibliothèque de l'espace actif
**When** je filtre par statut et période
**Then** la liste se restreint, en heure de Paris (FR-45, NFR-25) ; le filtre par réseau arrive avec la publication (histoire 7.5)

**Given** une vidéo sans publication publiée
**When** je la supprime
**Then** elle est supprimée, en base puis en fichiers, et la suppression est inscrite dans `suppressions` (FR-45, AR-12)

**Given** une vidéo avec au moins une publication publiée
**When** je veux la supprimer
**Then** regie propose seulement de l'archiver (FR-45)

## Epic 4: Démos d'applis web filmées par script

Le propriétaire déclare une application, obtient un script par Claude, par l'enregistreur ou par import d'un test, le corrige, le joue et le filme dans une capture isolée, et le fait rejouer par sa chaîne de déploiement ; la démo est recadrée, zoomée sur les clics et commentée par une voix de synthèse locale.

### Story 4.1: Déclarer mon application et prouver mes hôtes

As a propriétaire d'un espace,
I want déclarer l'application à filmer et ses hôtes, en prouvant que je contrôle chaque domaine,
So that regie ne filme que des sites qui sont à moi.

**Acceptance Criteria:**

**Given** l'écran « Démos d'app »
**When** je déclare une application et un hôte
**Then** l'hôte apparaît « en attente de preuve », avec l'enregistrement DNS TXT ou le fichier `/.well-known/regie` à publier et un bouton « Revérifier » (FR-13, FR-17, UX-DR16)

**Given** une preuve publiée
**When** je clique « Revérifier »
**Then** l'hôte passe « vérifié » (AR-21)

**Given** un hôte qui résout vers une adresse privée
**When** je le déclare
**Then** il est refusé, sauf exception « hôte + IP privée » posée par l'administrateur (AR-21)

**Given** l'écran à 360 px, 900 px et 1 240 px
**When** je l'affiche
**Then** il s'organise en 1, 2 ou 3 colonnes avec un en-tête collant (UX-DR2)

### Story 4.2: Une capture enfermée, loin du reste de regie

As a administrateur de l'instance,
I want que chaque capture tourne dans un navigateur jetable, sur une machine isolée, qui ne joint que les hôtes prouvés,
So that une page hostile ne peut atteindre ni le réseau du foyer, ni les fichiers, ni les secrets d'autrui.

**Acceptance Criteria:**

**Given** le LXC `regie-capture` sur un VLAN isolé, avec Podman rootless d'un utilisateur dédié
**When** une tâche de capture démarre
**Then** un conteneur Chromium jetable (`cap-drop=ALL`, lecture seule, bac à sable actif) ne joint que `proxy-capture` par un réseau interne (AR-3, AR-21)

**Given** `proxy-capture`
**When** une requête vise une plage privée, l'IP du foyer, un hôte non prouvé ou un nom qui se résout autrement entre deux requêtes
**Then** elle est refusée, et chaque destination est tracée et conservée 1 an (AR-21, AR-24, NFR-19)

**Given** la suite d'évasion (script hostile : réseau interne, fichiers d'autrui, secrets étrangers, rebinding DNS)
**When** la CI tourne
**Then** chaque accès interdit est refusé (NFR-19, AR-21)

### Story 4.3: Un compte de démo au coffre et un test de connexion

As a propriétaire d'un espace,
I want déposer les identifiants d'un compte de démo et tester la connexion à mon application,
So that regie peut filmer les écrans connectés sans jamais voir ni montrer mon mot de passe.

**Acceptance Criteria:**

**Given** la carte « Application à filmer »
**When** je saisis identifiant et mot de passe du compte de démo dans l'interface
**Then** ils vont au coffre, ne sont jamais réaffichés, et je ne peux que les remplacer (FR-13, UX-DR16)
**And** aucun outil MCP ni point d'API ne peut les lire ou les déposer (FR-47)

**Given** un test de connexion lancé dans la capture isolée (histoire 4.2)
**When** il s'exécute
**Then** le service lit le secret par `/interne/secrets/lire` sous son identité et son bail, selon la matrice déclarée (AR-11)

**Given** un test réussi ou échoué
**When** il se termine
**Then** je vois une mini capture de la page d'accueil, ou l'étape fautive (FR-13, UX-DR16)

### Story 4.4: Lire et corriger les étapes d'un script

As a propriétaire d'un espace,
I want voir mes scripts et corriger leurs étapes une à une,
So that une démo cassée se répare sans tout refaire.

**Acceptance Criteria:**

**Given** la liste des scripts
**When** je l'ouvre
**Then** chaque script montre son origine (Claude, parcours enregistré, test importé) et l'état de son dernier jeu (réussi, échec à l'étape N, hôte refusé) (UX-DR17)

**Given** l'éditeur d'étapes déclaratives (`aller`, `cliquer`, `saisir`, `attendre`, `connexion`, `filmer`)
**When** je monte, descends, retire ou ajoute une étape (verbe en liste + cible)
**Then** le script est mis à jour ; un retrait affiche un toast « Annuler » de 4 s (FR-17, UX-DR18, UX-DR7)
**And** les mêmes actions sont possibles par le MCP et l'API (FR-47)

**Given** une étape qui vise un hôte non vérifié
**When** je l'enregistre
**Then** elle est refusée en nommant l'hôte (FR-17, UX-DR18)

**Given** une étape en panne au dernier jeu
**When** j'ouvre le script
**Then** elle est mise en avant avec sa capture d'écran et les actions « Viser le … » et « Retirer l'étape » (FR-19, UX-DR18)

### Story 4.5: Jouer et filmer mon script

As a propriétaire d'un espace,
I want jouer mon script dans un navigateur piloté et le filmer en vertical,
So that j'obtiens les images de ma démo sans manipuler moi-même.

**Acceptance Criteria:**

**Given** un script valide
**When** je clique « Jouer et filmer »
**Then** une tâche de capture joue les étapes, filme en vertical et produit un journal horodaté des saisies, choix et clics (FR-18)
**And** le panneau montre l'aperçu vertical avec curseur, onde de clic, zoom, la pastille « Capture » et le journal en direct, reçu par le flux SSE de la séance (AR-8, UX-DR21)

**Given** une navigation vers un hôte hors liste
**When** elle se produit pendant le jeu
**Then** la capture s'arrête et le refus est tracé (FR-18)

**Given** une capture terminée
**When** elle devient une séance
**Then** la séance suit la file avec son heure estimée, et la fin du jeu l'annonce (« brouillon prêt vers 18 h 52 dans Relire ») (UX-DR21, FR-12)

### Story 4.6: Une démo recadrée et zoomée sur chaque clic

As a propriétaire d'un espace,
I want que ma capture soit recadrée en 9:16 et zoomée sur chaque clic, avec le curseur visible,
So that on suit ma démo sur un téléphone.

**Acceptance Criteria:**

**Given** une capture et son journal
**When** la recette « démo d'app » monte le brouillon
**Then** le cadre suit chaque clic avec un zoom, d'après le journal horodaté, et le curseur reste visible (FR-26)
**And** le brouillon passe les gardes et arrive dans le fil « Relire » (FR-28)

### Story 4.7: Une voix de synthèse locale qui commente ma démo

As a propriétaire d'un espace,
I want une voix qui commente ma démo, avec un texte que je peux modifier avant le rendu,
So that ma démo s'explique sans que j'enregistre ma voix.

**Acceptance Criteria:**

**Given** un script joué
**When** la recette démo prépare le brouillon
**Then** un texte de voix est tiré du script et affiché dans une zone modifiable (FR-27, UX-DR19)

**Given** le texte validé
**When** la tâche `voix` s'exécute
**Then** une voix de synthèse locale sous licence libre commerciale le dit, sans IA en nuage (FR-27, NFR-26)
**And** la voix retenue figure dans `modeles.lock` (licence, SHA-256)

**Given** les voix candidates du socle : fr siwis ou mls (CC-BY, attribution ajoutée aux mentions), gilles (CC0) ; tom (AGPL) et upmc (CC-BY-SA) exclues
**When** Benjamin écoute deux vidéos test dites par chaque candidate avant la bêta
**Then** il retient une voix, consignée avec le rapport dans `deploiement/` ; à défaut de choix, gilles (CC0) est retenue (socle « différés »)

### Story 4.8: Demander un script à Claude

As a propriétaire d'un espace,
I want décrire ma démo en une phrase à Claude et obtenir un script,
So that je n'écris aucune étape à la main.

**Acceptance Criteria:**

**Given** la fenêtre « Demander à Claude »
**When** je l'ouvre
**Then** elle explique comment brancher Claude par le MCP (UX-DR22)

**Given** Claude connecté
**When** il demande pages, éléments cliquables et captures en mode exploration
**Then** regie les lui fournit dans des champs `non_fiable`, et chaque étape proposée est vérifiée contre les hôtes autorisés (FR-14, AR-21, AR-25)

**Given** la création d'un script depuis une phrase
**When** elle est demandée par l'interface ou l'API
**Then** elle n'existe que par le MCP, comme déclaré dans `exceptions-parite` (FR-47)

### Story 4.9: Faire le parcours une fois pour l'enregistrer

As a propriétaire d'un espace,
I want faire mon parcours une fois et que chaque clic, saisie et navigation devienne une étape,
So that je crée un script en montrant plutôt qu'en décrivant.

**Acceptance Criteria:**

**Given** la fenêtre « Faire le parcours une fois »
**When** je navigue dans le navigateur distant (screencast sur WebSocket terminé par le cœur)
**Then** chaque clic, saisie et navigation s'ajoute en direct comme étape (FR-15, UX-DR22, AR-21)

**Given** une saisie de mot de passe
**When** elle est enregistrée
**Then** elle est remplacée par l'étape `connexion`, et la valeur n'est jamais stockée (UX-DR22)

### Story 4.10: Importer un test existant

As a propriétaire d'un espace,
I want importer un test Playwright ou Cypress et le convertir en script,
So that je réutilise les parcours que mon équipe a déjà écrits.

**Acceptance Criteria:**

**Given** un fichier `.spec.ts` importé
**When** regie le lit
**Then** il est converti en étapes déclaratives sans jamais être exécuté (FR-16)

**Given** une étape non convertible
**When** la conversion se termine
**Then** elle est signalée par son numéro, et « Créer le script » reste bloqué tant qu'elle reste (FR-16, UX-DR22)

### Story 4.11: Rejouer ma démo à chaque mise en production

As a propriétaire d'un espace,
I want que ma chaîne de déploiement rejoue mon script avec un jeton limité,
So that ma démo reste à jour sans que j'y pense.

**Acceptance Criteria:**

**Given** l'interrupteur `role="switch"` « Rejouer à chaque mise en production »
**When** je l'active
**Then** regie crée un jeton limité au rejeu de ce script (1 an au plus), affiché une seule fois avec copie et avertissement (FR-19, UX-DR20, AR-13)

**Given** un appel authentifié de rejeu
**When** il arrive
**Then** une séance liée est créée et l'événement `montage_remplace` met à jour les brouillons concernés (FR-19, AR-21)

**Given** une étape en échec au rejeu
**When** le rejeu échoue
**Then** je suis prévenue avec le numéro de l'étape et sa capture d'écran ; je corrige puis je rejoue (FR-19, FR-32)

## Epic 5: Recettes face caméra en série et lifestyle

regie propose la recette adaptée aux rushes, découpe une prise parlée en une série d'idées avec la meilleure prise, monte un lifestyle au rythme de la musique avec textes à l'écran, et permet de refaire une série en disant ce qui ne va pas.

### Story 5.1: regie me propose la bonne recette

As a créatrice,
I want que regie choisisse la recette selon mes rushes, et pouvoir la changer avant le montage,
So that je n'ai rien à configurer dans le cas courant.

**Acceptance Criteria:**

**Given** une séance analysée
**When** regie propose une recette
**Then** une capture donne « démo d'app », des rushes avec voix « face caméra », sinon « lifestyle sur musique » (FR-56)
**And** je peux changer de recette avant le montage, et la recette est affichée sur chaque brouillon

**Given** une recette déclarée dans le graphe de tâches
**When** le brouillon est monté
**Then** un changement de plan, de zoom ou de texte a lieu au moins toutes les 3 s (FR-56, AR-16)

### Story 5.2: Une série d'idées tirée d'une prise parlée

As a créatrice,
I want qu'une longue prise face caméra devienne une série numérotée, un brouillon par idée,
So that une séance de tournage me donne plusieurs vidéos.

**Acceptance Criteria:**

**Given** une transcription face caméra
**When** la tâche `langage` découpe les idées
**Then** chaque idée qui passe les gardes donne un brouillon, 5 au plus, numérotés « 1/3 », avec la suite annoncée (FR-20)

**Given** aucune idée qui passe les gardes
**When** le montage se termine
**Then** regie l'annonce avec la raison et un conseil de tournage (FR-20)

**Given** le modèle retenu au banc (histoire 2.10)
**When** une prise parlée longue est découpée
**Then** le découpage tient dans le budget de NFR-2, sinon la séance suit le repli décidé par le banc (AR-20, NFR-2)

### Story 5.3: La meilleure prise, les autres en variantes

As a créatrice,
I want que regie retienne ma meilleure prise quand je répète une idée,
So that je n'ai pas à comparer mes essais moi-même.

**Acceptance Criteria:**

**Given** plusieurs prises de la même idée
**When** le brouillon est monté
**Then** regie retient la plus complète, sans hésitation, à la voix la plus nette (FR-59)
**And** les autres prises apparaissent dans l'onglet « Prise » des variantes (FR-37, UX-DR12)

### Story 5.4: Des textes à l'écran tirés de mon intention

As a créatrice,
I want des textes à l'écran tirés de mon intention ou de ma transcription, au style de mon gabarit,
So that ma vidéo se comprend même sans le son.

**Acceptance Criteria:**

**Given** une intention et une transcription
**When** le brouillon est monté
**Then** des textes à l'écran sont posés au style du gabarit et passent les gardes (FR-58, FR-28)

**Given** un texte à l'écran
**When** je le corrige dans la feuille « Corriger »
**Then** la correction suit les règles de FR-36 (FR-58)

### Story 5.5: Un lifestyle monté sur la musique

As a créatrice,
I want que mes plans sans parole soient montés au rythme d'un morceau, avec une accroche en texte,
So that mes vidéos d'ambiance sortent aussi vite que mes vidéos parlées.

**Acceptance Criteria:**

**Given** une séance en recette « lifestyle sur musique »
**When** le brouillon est monté
**Then** regie choisit les plans les plus nets et stables, les coupe au rythme du morceau et produit au moins un brouillon (FR-57)
**And** l'accroche est portée par un texte à l'écran (FR-57, FR-58)

### Story 5.6: Refaire une série en disant ce qui ne va pas

As a créatrice,
I want demander de refaire une série en expliquant ce qui ne va pas, et changer de recette au besoin,
So that je n'abandonne pas une séance ratée.

**Acceptance Criteria:**

**Given** une série et des rushes non purgés
**When** je demande « Refaire » avec un commentaire et, au besoin, une autre recette
**Then** une nouvelle série est montée, sans consommer de quota (FR-29, AR-14)

**Given** une version de modèle, de pilote ou de moteur changée depuis le premier montage
**When** je refais
**Then** regie le signale (FR-30)

**Given** des rushes purgés
**When** je demande « Refaire »
**Then** regie refuse avec `SEANCE_PURGEE` (FR-29, FR-52)

## Epic 6: Valider à plusieurs

Le propriétaire d'un espace à plusieurs active la validation ; un autre membre valide les vidéos ou les renvoie avec un commentaire à l'auteur.

### Story 6.1: Activer ou désactiver la validation

As a propriétaire d'un espace à plusieurs membres,
I want activer ou désactiver la validation avant qu'une vidéo soit prête,
So that rien ne sort sans un second regard quand je le décide.

**Acceptance Criteria:**

**Given** un espace d'au moins deux membres
**When** j'active la validation
**Then** une vidéo gardée passe « à valider » au lieu de « prête » (FR-4)

**Given** un espace qui retombe à un seul membre
**When** le dernier autre membre part
**Then** la validation est désactivée automatiquement, je suis prévenue, et les vidéos « à valider » passent « prêtes » par l'événement `validation_desactivee` (FR-4, AR-7)

**Given** la désactivation de la validation par le MCP ou l'API
**When** elle est demandée
**Then** elle est refusée : action « interface seule » (FR-47)

### Story 6.2: Valider ou renvoyer une vidéo

As a membre d'un espace avec validation,
I want voir les vidéos à valider des autres, les valider ou les renvoyer avec un commentaire,
So that l'équipe garde la main sur ce qui sort.

**Acceptance Criteria:**

**Given** des vidéos « à valider » dont je ne suis pas l'auteur
**When** j'ouvre la liste
**Then** je les vois ; les miennes n'y sont pas (FR-39)

**Given** une vidéo à valider
**When** je la valide
**Then** elle passe « prête » (FR-39)

**Given** une vidéo à valider
**When** je la renvoie avec un commentaire
**Then** elle repasse « gardée », l'auteur est prévenu avec le commentaire, et elle revient « à valider » à sa correction ou à sa nouvelle soumission (FR-39, FR-32)

**Given** une vidéo prête corrigée après validation
**When** la correction est enregistrée
**Then** elle repasse « à valider » (FR-39)

## Epic 7: Publier sur les réseaux

Le propriétaire autorisé connecte Instagram, Facebook, TikTok et YouTube, publie tout de suite ou à l'heure de Paris choisie, jamais deux fois, suit le résultat, rejoue un échec, annule ou déplace une publication programmée.

### Story 7.1: L'administrateur ouvre la publication

As a administrateur,
I want saisir et tester les clés d'application des réseaux et accorder le droit de publication à un espace,
So that la publication ne s'ouvre qu'aux espaces que je choisis.

**Acceptance Criteria:**

**Given** l'écran d'administration des réseaux
**When** je saisis, remplace ou teste la clé d'application d'un réseau
**Then** elle va au coffre, n'est jamais réaffichée, et seul son état est visible (FR-71)

**Given** un espace
**When** je lui accorde le droit de publication
**Then** son propriétaire peut connecter des comptes ; en V1, seuls mes propres espaces peuvent le recevoir (FR-41, FR-70)

**Given** `deploiement/reseaux.json`
**When** un connecteur est chargé
**Then** ses portées et son `redirect_uri` fixe viennent de ce fichier, et chaque réseau a son connecteur isolé dans le service `publication` (AR-22, NFR-27)

### Story 7.2: Connecter ma chaîne YouTube

As a propriétaire d'un espace autorisé,
I want connecter ma chaîne YouTube dans l'interface et voir quand la connexion expire,
So that regie peut publier pour moi sans connaître mon mot de passe.

**Acceptance Criteria:**

**Given** l'écran des comptes réseau
**When** je connecte YouTube
**Then** l'OAuth utilise un `state` lié à ma session et PKCE, et le jeton obtenu va au coffre (FR-41, AR-22)
**And** cette action est déclarée « interface seule » (FR-47)

**Given** une connexion qui expire
**When** l'échéance approche
**Then** je suis prévenue à J-7 et la veille, dans l'interface et par courriel, avec un bouton « Reconnecter » (FR-41, AR-22)

**Given** une application YouTube non encore vérifiée
**When** le compte est connecté
**Then** l'interface annonce que les vidéos partiront en privé, et le connecteur enregistre ce réglage pour les publications à venir (FR-41)

### Story 7.3: Publier une vidéo maintenant, jamais deux fois

As a propriétaire ou membre autorisé,
I want publier une vidéo prête vers un compte connecté, tout de suite,
So that ma vidéo sort sans passer par le téléphone.

**Acceptance Criteria:**

**Given** une vidéo prête et un compte connecté
**When** je publie maintenant
**Then** regie contrôle les gardes, les bornes et le quota du réseau, puis crée une publication qui fige `montage_id` et `rendu_id` (FR-42, AR-18, AR-22)
**And** une seule publication est possible par compte et par vidéo

**Given** une publication envoyée
**When** le connecteur franchit le point de non-retour
**Then** elle passe `envoi_en_cours`, porte une clé d'idempotence et sa reprise est `interdite` (AR-22)

**Given** une coupure pendant l'envoi
**When** le service redémarre
**Then** la publication n'est jamais renvoyée ; son état incertain est signalé avec la cause et l'action (NFR-9, NFR-10)

**Given** l'adresse de la vidéo transmise au réseau
**When** elle est créée
**Then** elle est signée pour l'usage `publication` et expire en moins de 1 h (NFR-18)

### Story 7.4: Programmer, déplacer ou annuler une publication

As a propriétaire ou membre autorisé,
I want programmer une publication à une heure de Paris, puis la déplacer ou l'annuler,
So that mes vidéos sortent au bon moment, même si le serveur redémarre.

**Acceptance Criteria:**

**Given** une vidéo prête
**When** je programme une publication à une heure de Paris
**Then** une échéance UTC est créée, et la publication part dans la minute qui suit l'heure dite (FR-42, FR-43, NFR-8, NFR-25)

**Given** un arrêt du serveur pendant l'heure prévue
**When** il redémarre
**Then** une publication en retard de moins de 2 h part, une plus ancienne passe en échec avec la cause ; jamais deux fois (FR-43, NFR-8)

**Given** les changements d'heure d'été et d'hiver
**When** la suite de tests tourne
**Then** l'heure affichée et l'heure de départ restent justes (NFR-8, NFR-25)

**Given** une publication programmée
**When** je la déplace ou l'annule
**Then** l'échéance est mise à jour ou supprimée (FR-44)

**Given** le montage d'une vidéo programmée qui change
**When** la correction arrive
**Then** la publication passe « à confirmer » (`en_attente_confirmation` dans le code) avec `MONTAGE_MODIFIE` et attend mon accord ; sans confirmation à l'heure dite, elle passe en échec (AR-22)

### Story 7.5: Suivre le résultat et rejouer un échec

As a propriétaire ou membre autorisé,
I want voir si ma publication est publiée ou en échec, et rejouer un échec,
So that je sais toujours où en est chaque vidéo.

**Acceptance Criteria:**

**Given** une publication terminée
**When** le réseau répond
**Then** elle passe « publiée » avec l'identifiant et le lien, ou « en échec » avec la cause, et je suis prévenue (FR-44, FR-32)
**And** le statut de la vidéo ne change pas

**Given** une publication en échec
**When** je la rejoue
**Then** une nouvelle tentative part, et l'historique des tentatives est visible (FR-44)

**Given** chaque tentative de publication
**When** elle a lieu
**Then** elle est inscrite au journal d'audit avec l'utilisateur, l'origine et le jeton (NFR-21)

**Given** la bibliothèque de l'espace actif
**When** je filtre par réseau
**Then** seules les vidéos qui ont une publication sur ce réseau s'affichent (FR-45)

### Story 7.6: Publier sur Instagram et Facebook

As a propriétaire d'un espace autorisé,
I want connecter mon compte Instagram professionnel et ma Page Facebook,
So that mes Reels sortent sur Meta depuis regie.

**Acceptance Criteria:**

**Given** les connecteurs Instagram Reels et Page Facebook
**When** je connecte mes comptes
**Then** le parcours OAuth, le coffre, les rappels d'échéance et la publication suivent les règles des histoires 7.2 à 7.5 (FR-41, FR-42)

**Given** les bornes Meta dans `bornes.json`
**When** une vidéo les dépasse
**Then** la publication est refusée avant l'envoi, en nommant la borne (FR-42)

### Story 7.7: Publier sur TikTok

As a propriétaire d'un espace autorisé,
I want envoyer ma vidéo vers TikTok en choisissant la confidentialité et en déclarant le contenu commercial,
So that je respecte les règles de TikTok.

**Acceptance Criteria:**

**Given** le connecteur TikTok
**When** je prépare une publication
**Then** je choisis un niveau de confidentialité parmi ceux que TikTok permet et je déclare le contenu commercial (FR-63)

**Given** une application TikTok non auditée
**When** la vidéo part
**Then** elle part en privé, ou en brouillon dans l'app TikTok avec l'état final « envoyée en brouillon » (FR-41, FR-63)

## Epic 8: Données personnelles et exploitation

L'inscrite exporte ses données ou supprime son compte ; tout le monde peut signaler un contenu illicite, que l'administrateur traite ; l'instance est sauvegardée, restaurable et surveillée.

### Story 8.1: Télécharger une archive de mes données

As a créatrice,
I want télécharger une archive de mes données,
So that je pars avec ce qui m'appartient quand je le veux.

**Acceptance Criteria:**

**Given** mon compte
**When** je demande l'export
**Then** une tâche `export_donnees` prépare une archive (compte, vidéos prêtes, montages, scripts, légendes), sans aucun secret (FR-68, AR-12)
**And** je suis prévenue quand elle est prête, avec un lien signé de moins de 1 h

### Story 8.2: Supprimer mon compte

As a créatrice,
I want supprimer mon compte et tout ce qu'il contient,
So that rien de moi ne reste sur le serveur.

**Acceptance Criteria:**

**Given** une demande de suppression, après réauthentification
**When** elle est confirmée dans l'interface
**Then** rushes, brouillons, vidéos, scripts et secrets sont effacés, en base puis en fichiers, et inscrits dans `suppressions` ; seul l'audit légal reste, avec des identifiants opaques (FR-53, AR-12, AR-13)
**And** cette action est déclarée « interface seule » (FR-47)

**Given** un espace partagé dont je suis membre
**When** je pars
**Then** mes vidéos restent au propriétaire (FR-53, AR-7)

**Given** un espace partagé dont je suis propriétaire
**When** je supprime mon compte
**Then** les membres sont avertis, et l'espace est supprimé à l'échéance annoncée (FR-53, AR-22)

### Story 8.3: Signaler un contenu et suspendre un espace

As a visiteuse ou administrateur,
I want signaler un contenu illicite ou exercer un droit par un point de contact public, et que l'administrateur traite le signalement,
So that regie respecte la loi.

**Acceptance Criteria:**

**Given** le point de contact public, sans connexion
**When** j'envoie un signalement
**Then** l'administrateur le reçoit dans son écran, avec son état (FR-69)

**Given** un signalement fondé
**When** l'administrateur suspend l'espace
**Then** l'espace passe `suspendu` par l'événement `espace_suspendu` : toute action y est refusée par les trois portes et ses tâches sont gelées (FR-69, AR-7, AR-10)

### Story 8.4: Des sauvegardes vérifiées chaque mois

As a administrateur,
I want une sauvegarde chaque nuit, hors site, et une restauration testée chaque mois,
So that une panne ne coûte jamais plus d'un jour de travail.

**Acceptance Criteria:**

**Given** la nuit
**When** la sauvegarde tourne
**Then** un dump chiffré par age et PBS sont faits, copiés hors site, rushes et clé maîtresse exclus, avec une rétention de 35 jours (NFR-13, AR-11, AR-24)

**Given** le LXC `regie-recette`
**When** la restauration mensuelle tourne
**Then** l'instance est restaurée en moins de 4 h en mode `restauration`, et `suppressions` est rejouée pour qu'aucune donnée supprimée ne revienne (NFR-13, AR-24)

### Story 8.5: Une instance surveillée et sobre

As a administrateur,
I want être prévenu d'une panne, d'un disque plein, d'une sauvegarde manquée ou d'une file bloquée,
So that je réagis avant les utilisatrices.

**Acceptance Criteria:**

**Given** Uptime Kuma
**When** il sonde `/sante` chaque minute
**Then** il alerte sur panne, disque sous 15 %, sauvegarde de plus de 26 h, file bloquée et certificat proche de l'expiration (NFR-34, AR-24)

**Given** les journaux et l'audit
**When** leur durée de conservation est atteinte
**Then** les journaux sont effacés à 30 jours, l'audit et les destinations de capture à 1 an (AR-24)

**Given** la recette à charge nominale (20 utilisateurs actifs, 3 séances de 10 min par semaine chacun)
**When** l'essai de charge tourne
**Then** les réponses restent sous 500 ms au 95e centile et aucune séance n'attend plus de 1 h (NFR-1, NFR-32)
