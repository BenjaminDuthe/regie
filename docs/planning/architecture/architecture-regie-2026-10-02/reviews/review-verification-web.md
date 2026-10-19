# Revue : vérification web du socle — regie

- **Fichier relu :** `ARCHITECTURE-SPINE.md` (draft du 2026-10-02)
- **Relecteur :** agent indépendant, vérification par registres (npm, PyPI, GitHub, Debian), documentation officielle et recherche web, le 2026-10-02.
- **Méthode :** chaque version de la section « Stack » a été comparée à son registre. Chaque technologie nommée dans les AD a été confrontée à sa documentation actuelle pour l'usage décrit.

## Verdict

La stack est récente et presque toutes les versions épinglées existent bien au 2026-10-02. Deux choix structurants sont pourtant **périmés ou introuvables** :

- le SDK MCP v1, passé en maintenance depuis la spécification MCP 2026-07-28 ;
- `drizzle-orm 1.0.0-rc.5`, qui n'est pas publié sous ce numéro.

Plusieurs promesses des AD ne sont pas tenues telles quelles par les outils :

- la confiance par mot de Whisper sous OpenVINO ;
- la reproductibilité de llama.cpp ;
- le JSON Schema contraint ;
- Podman 6 dans un LXC Debian ;
- la CSP avec Astro.

Il faut corriger le socle avant de passer aux epics.

## Tableau des versions (registre au 2026-10-02)

| Élément | Socle | Registre | Statut |
| --- | --- | --- | --- |
| Node.js | 26.x LTS (au 2026-10-28) | 26.10.0, LTS le 2026-10-28 | OK (encore « Current » aujourd'hui, comme le socle l'indique) |
| fastify / @fastify/middie | 5.12.5 / 9.3.4 | 5.12.5 / 9.3.4 | OK |
| astro / @astrojs/node | 7.3.5 / 11.1.6 | 7.3.5 / 11.1.6 (pair `astro ^7.2.1`) | OK |
| svelte / @astrojs/svelte | 5.57.1 / 9.0.1 | 5.57.1 / 9.0.1 | OK |
| zod | 4.6.5 | 4.6.5 | OK |
| @modelcontextprotocol/sdk | 1.31.0 | 1.31.0 (ligne v1 **en maintenance**) ; v2 : `@modelcontextprotocol/server` 2.2.0, `@modelcontextprotocol/fastify` 2.0.0 | **Voir C-1** |
| PostgreSQL | 18.6 | 18.6 | OK |
| drizzle-orm | 1.0.0-rc.5 | `latest` 0.45.3 ; `rc` 1.0.0-rc.4 ; rc.5 n'existe qu'en instantanés `1.0.0-rc.5-<sha>` | **Voir C-2** |
| pg | 8.23.1 | 8.23.1 | OK |
| @tus/server / @tus/file-store / tus-js-client | 2.4.5 / 2.1.1 / 4.3.1 | identiques | OK |
| playwright | 1.63.0 | 1.63.0 | OK |
| pino | 10.3.1 | 10.3.1 | OK |
| vitest | « dernière stable » | 5.0.3 | Bas (B-4) |
| Python / pydantic / datamodel-code-generator | 3.14.8 / 2.13.5 / 0.83.0 | identiques | OK |
| openvino-genai | 2026.4.1 | 2026.4.1.0 (wheels cp314 disponibles) | OK, mais voir H-1 |
| llama.cpp | b11349 | b11349, publiée le 2026-10-02 à 15:41 UTC | Existe (voir B-3) |
| FFmpeg | 9.0.2 | 9.0.2 « Lei », 2026-09-18 | OK |
| Podman / podman-compose | 6.1.3 / 1.6.0 | 6.1.3 (2026-09-29) / 1.6.0 | Existe, mais voir H-4 |
| Proxmox VE / PBS | 9.2 / 4.2 | 9.2 / 4.2 | OK |

---

## Critique

### C-1 — SDK MCP v1 en maintenance ; la spécification MCP 2026-07-28 change le transport et l'authentification

**Constat.**

- Le socle épingle `@modelcontextprotocol/sdk` 1.31.0, monté à la main sur `req.raw`/`res.raw`.
- Or la v2 du SDK TypeScript est la ligne stable, publiée avec la spécification 2026-07-28. La v1 ne reçoit plus que des correctifs, « pendant au moins 6 mois après la sortie de la v2 ».
- La v2 est découpée en paquets. `@modelcontextprotocol/server` est en 2.2.0. `@modelcontextprotocol/fastify` (2.0.0, pair `fastify ^5.2.0`) fournit l'adaptateur Fastify et la validation de l'en-tête Host (protection contre le DNS rebinding).
- La spécification 2026-07-28 rend MCP **sans état** : plus de poignée de main `initialize`, plus de `Mcp-Session-Id`, plus de reprise de flux. Les en-têtes `Mcp-Method` et `Mcp-Name` deviennent obligatoires. Le serveur MCP y est formalisé comme serveur de ressources OAuth 2.1.
- Démarrer en v1 revient à construire la façade MCP (FR-46 à FR-48, FR-64 à FR-66) sur une ligne en fin de vie, avant même la première mise en production.

**Correction proposée.**

- Stack : remplacer par `@modelcontextprotocol/server` 2.2.x et `@modelcontextprotocol/fastify` 2.0.x.
- AD-1 : préciser « Streamable HTTP sans état (spéc. 2026-07-28), via l'adaptateur Fastify officiel ».
- AD-12 : le suivi des tâches par interrogation de l'état reste compatible avec une spécification sans état. C'est un bon point, à conserver.

**Sources.**

- https://github.com/modelcontextprotocol/typescript-sdk (README : « v2 is the stable release line, released alongside the 2026-07-28 spec » ; « v1.x continues to receive bug fixes and security updates for at least 6 months after v2's release »)
- https://blog.modelcontextprotocol.io/posts/2026-07-28/
- https://workos.com/blog/mcp-stateless-spec-2026-07-28
- registre npm : `@modelcontextprotocol/fastify` 2.0.0, `@modelcontextprotocol/server` 2.2.0

### C-2 — `drizzle-orm 1.0.0-rc.5` n'est pas publié : l'installation échouera

**Constat.**

- Sur npm, la balise `rc` pointe vers `1.0.0-rc.4` (2026-06-27) et `latest` vers `0.45.3` (2026-09-21).
- « rc.5 » n'existe que sous forme d'instantanés de branche, comme `1.0.0-rc.5-5935859` (2026-09-09). La PR rc.5 est encore « en revue ». La 1.0 finale n'est pas sortie au 29 septembre 2026.
- Un `npm install drizzle-orm@1.0.0-rc.5` renvoie ETARGET.
- De plus, la ligne RC contient encore des changements cassants, par exemple sur l'API `casing`.

**Correction proposée.**

- Choisir l'une des deux versions :
  - `drizzle-orm 1.0.0-rc.4` (et `drizzle-kit 1.0.0-rc.4` si on l'utilise), en notant au memlog le risque de rupture jusqu'à la 1.0 ;
  - ou `0.45.3`, stable.
- Le socle n'utilise Drizzle que pour le typage, et ses migrations sont écrites à la main. La 0.45.x suffit donc, avec une montée planifiée vers 1.0.
- Ne jamais épingler un instantané `-<sha>`.

**Sources.**

- registre npm `drizzle-orm` (dist-tags et dates)
- https://github.com/drizzle-team/drizzle-orm/pull/5966
- https://x.com/DrizzleORM/status/2099079708897910880

---

## Haut

### H-1 — OpenVINO GenAI ne fournit pas d'indice de confiance par mot (AD-5, zones douteuses)

**Constat.**

- Les horodatages au mot existent bien. Ils ont été ajoutés en 2026.0, sur CPU, GPU et NPU.
- Ils exigent `word_timestamps=True` **dans le constructeur**, car le pipeline décompose la SDPA d'attention croisée.
- Le résultat ne contient que `start_ts`/`end_ts` par mot. La documentation ne mentionne **aucune** probabilité ni confiance par mot.
- AD-5 exige pourtant des « mots horodatés avec indice de confiance », et les « zones douteuses » en dépendent.
- Autres points :
  - la documentation présente désormais la classe générique `ASRPipeline` (Whisper et Qwen3-ASR) ;
  - le socle nomme `WhisperPipeline` ;
  - la validation n'a été faite que sur la B580 (même puce Xe2 que la B570) ;
  - aucune mention explicite de large-v3-turbo.

**Correction proposée.**

- AD-11 : remplacer « WhisperPipeline » par « ASRPipeline (ou WhisperPipeline), construit avec `word_timestamps=True` ».
- AD-5 : définir l'indice de confiance comme un champ calculé par regie, ou le déclarer optionnel. Pistes de calcul :
  - logprobs des jetons, si l'API les expose dans la version épinglée ;
  - à défaut, une heuristique : durée anormale du mot, réécoute, désaccord entre deux passes.
- Ajouter au premier banc (Différé) un test qui prouve l'existence d'une confiance par mot, ou d'un substitut.

**Sources.**

- https://openvinotoolkit.github.io/openvino.genai/docs/use-cases/speech-recognition/
- https://github.com/openvinotoolkit/openvino.genai/releases/tag/2026.4.0.0
- https://docs.openvino.ai/releasenotes

### H-2 — La reproductibilité de llama.cpp n'est pas garantie par « température 0 + graine » (AD-5, FR-30)

**Constat.**

- La documentation du serveur avertit que, selon le backend, les logits ne sont pas identiques bit à bit d'une taille de lot à l'autre. Le traitement continu par lots (actif par défaut), le cache de prompt et les slots `--parallel` rendent donc le résultat non déterministe.
- Sur Vulkan ou SYCL, aucune garantie n'est donnée.
- La sortie contrainte par JSON Schema a aussi des limites, et la grammaire **ignore en silence** les mots-clés non pris en charge :
  - `$ref` imbriqués cassés ;
  - `minimum`/`maximum` limités aux entiers ;
  - `patternProperties`, `uniqueItems`, `not`, `if/then/else` non pris en charge ;
  - `prefixItems` cassé ;
  - `pattern` doit commencer par `^` et finir par `$`.
- Or `z.toJSONSchema()` produit volontiers des `$defs`/`$ref` et des bornes décimales.

**Correction proposée.**

- AD-5 et FR-30 :
  - lancer `llama-server` avec `--parallel 1`, sans `cache_prompt` et sans traitement continu par lots, pour les tâches qui doivent être reproductibles ;
  - épingler backend, pilote et build dans `modeles.lock` ;
  - ramener la promesse à « reproductible à configuration matérielle et build identiques ».
- AD-4 : générer des schémas « compatibles grammaire » pour le langage :
  - option `zod` `reused: "inline"` ou `ref` désactivées ;
  - bornes entières ;
  - pas de `uniqueItems`.
- Valider **toujours** la sortie par zod/pydantic après génération, et ajouter un test de dérive qui passe chaque schéma dans `json_schema_to_grammar.py` sans avertissement.

**Sources.**

- https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md

### H-3 — Connexion de Claude par jeton fixe : non disponible pour tous sur claude.ai (FR-46, AD-15)

**Constat.**

- Le socle prévoit « Claude → MCP + jeton », avec des jetons statiques hachés.
- Sur claude.ai, un connecteur personnalisé s'authentifie par OAuth (« Sign in »). L'authentification par en-tête fixe (« Request headers ») est **en bêta, réservée à un ensemble limité d'organisations**.
- Elle est aussi décrite pour un identifiant **partagé** par toute une organisation. Pour des identifiants personnels, la documentation recommande OAuth.
- Claude Code accepte, lui, des en-têtes. Mais un studio multi-utilisateur hébergé dont les inscrits connectent leur Claude doit, en pratique, exposer un serveur d'autorisation OAuth 2.1, ce qu'exige aussi la spécification MCP 2026-07-28 (RFC 9207, CIMD et DCR).

**Correction proposée.**

- AD-15 : ajouter un flux OAuth 2.1 avec PKCE pour la façade MCP.
  - Le serveur d'autorisation est intégré au cœur. Il prend en charge le *Client ID Metadata Document* de Claude, ou l'enregistrement dynamique.
  - Les jetons délivrés gardent la portée « droits ∩ espace(s) ∩ actions ».
- Garder le jeton fixe pour l'API privée et pour Claude Code.
- Sinon, restreindre explicitement le PRD à Claude Code.

**Sources.**

- https://claude.com/docs/connectors/custom/remote-mcp (« Request header authentication is in beta and available to a limited set of organizations » ; « If each person needs to sign in with their own account, use OAuth instead »)
- https://blog.modelcontextprotocol.io/posts/2026-07-28/

### H-4 — Podman 6.1.3 dans un LXC : non empaqueté pour Debian 13, et contraintes rootless (AD-16)

**Constat.**

- Proxmox VE 9 repose sur Debian 13 (trixie), qui fournit Podman **5.4.2**. Podman 6.1.1 n'est que dans `experimental` ; 5.8.6 est dans forky/sid.
- Podman 6, sorti le 2026-06-24, retire cgroups v1, CNI, iptables, slirp4netns (remplacé par pasta) et BoltDB.
- Un LXC non privilégié n'offre par défaut que 65 536 UID/GID. Podman rootless à l'intérieur a besoin de plages `/etc/subuid` et `/etc/subgid` dans cet espace, plus `loginctl enable-linger`. Sinon les conteneurs s'arrêtent à la déconnexion.
- `/dev/dri` doit être transmis avec le bon GID `render` (option `devN: …,gid=` du LXC), puis `--group-add keep-groups` côté Podman.
- podman-compose ne gère pas le redémarrage au démarrage de l'hôte. Podman 6 met en avant Quadlet.

**Correction proposée.**

- AD-16 : choisir et écrire la distribution du LXC. Deux options :
  - un modèle Fedora 43+ ou équivalent, qui fournit Podman 6 ;
  - ou Debian 13 avec Podman 5.4.x / 5.8.x, en épinglant cette version à la place de 6.1.3.
- Ajouter à la tâche d'installation (Différé) :
  - agrandir le `lxc.idmap` et le `/etc/subuid` de l'hôte ;
  - fixer le `gid` du `render` ;
  - activer linger ;
  - vérifier cgroups v2 ;
  - choisir pasta ou netavark pour les réseaux `--internal` (AD-17).
- Envisager Quadlet (unités systemd) plutôt que podman-compose pour la reprise après redémarrage (NFR-7).

**Sources.**

- https://sources.debian.org/src/podman/ (5.4.2 trixie, 6.1.1 experimental)
- https://fedoraproject.org/wiki/Changes/Podman6
- https://linuxiac.com/podman-6-0-lands-with-breaking-changes-amd-gpus-support/
- https://forum.proxmox.com/threads/podman-in-rootless-mode-on-lxc-container.141790/
- https://proxmoxpulse.com/articles/podman-proxmox-lxc-rootless-containers/

### H-5 — Le service `capture` qui parle au socket Podman contrôle tous les conteneurs de regie (AD-10, AD-9)

**Constat.**

- AD-10 dit : « seul le service capture parle au moteur de conteneurs, sans privilège administrateur ». Mais la documentation Podman précise que l'API donne un accès complet, équivalent à l'exécution de code arbitraire en tant que l'utilisateur du service, sans pouvoir le limiter ni l'auditer.
- Si `capture` utilise le socket de l'utilisateur rootless qui fait tourner `coeur`, il peut lancer `exec` dans `coeur` et lire la clé maîtresse du coffre dans son environnement. AD-9 est alors annulé.

**Correction proposée.**

- Faire tourner les conteneurs Chromium jetables sous un **utilisateur Unix distinct**, avec sa propre instance Podman rootless et son propre socket.
- Le service `capture` n'accède qu'à ce socket-là.
- Écrire cette séparation dans AD-10, et ajouter un test qui vérifie que ce socket ne voit pas les conteneurs de regie.

**Source.**

- https://docs.podman.io/en/latest/markdown/podman-system-service.1.html

---

## Moyen

### M-1 — RLS avec `SET LOCAL` : passer par `set_config(…, true)` et forcer la RLS (AD-8)

**Constat.**

- Drizzle n'empêche ni l'une ni l'autre des pratiques du socle :
  - migrations écrites à la main (drizzle-kit est facultatif) ;
  - variable de session dans une transaction (la documentation Drizzle montre `tx.execute(sql\`select set_config(...)\`)`).
- En revanche, `SET LOCAL app.utilisateur_id = $1` n'accepte pas de paramètre lié (commande utilitaire). Il faut `select set_config('app.utilisateur_id', $1, true)`, l'équivalent transactionnel documenté. L'alternative serait d'interpoler une valeur, ce qui est dangereux.
- Une requête faite hors `db.transaction` n'aurait aucune valeur fixée.
- Par ailleurs, le propriétaire d'une table contourne la RLS sauf `FORCE ROW LEVEL SECURITY`.

**Correction proposée.**

- AD-8 :
  - écrire « `set_config('app.utilisateur_id', $1, true)` en tête de chaque transaction » ;
  - écrire les règles avec `current_setting('app.utilisateur_id', true)::uuid`, qui donne NULL donc aucune ligne si la variable manque (échec fermé) ;
  - `ALTER TABLE … FORCE ROW LEVEL SECURITY` ;
  - `regie_coeur` n'est ni propriétaire ni `BYPASSRLS`.
- Ajouter un test : une requête hors transaction ne rend aucune ligne.

**Sources.**

- https://www.postgresql.org/docs/18/functions-admin.html (set_config)
- https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- https://orm.drizzle.team/docs/rls

### M-2 — Sémaphore GPU par verrou consultatif : à aligner sur le bail ; il ne gère pas la VRAM (AD-3)

**Constat.**

- PostgreSQL 18 fournit bien `FOR UPDATE SKIP LOCKED`, les verrous consultatifs et `LISTEN/NOTIFY`.
- Mais un verrou consultatif **de session** n'est rendu qu'à la fin de la session ou sur `pg_advisory_unlock`. Un service bloqué, dont la connexion reste ouverte, garde le GPU même après l'expiration de son bail. Le bail et le verrou peuvent alors se contredire.
- Un verrou de transaction impose, lui, une transaction ouverte pendant toute la tâche.
- Enfin, le sémaphore limite le *calcul*, pas la *mémoire* : `llama-server` et le pipeline OpenVINO gardent leur modèle en VRAM entre deux tâches. Pour tenir dans les 10 Go, le service de langage doit décharger son modèle. Le mode routeur de llama-server offre `POST /models/unload` et `--models-max`.
- `LISTEN/NOTIFY` a ses propres contraintes :
  - charge utile limitée à 8 000 octets ;
  - livraison au commit seulement ;
  - connexion dédiée, hors pool ;
  - file de 8 Go bloquée par une transaction longue qui écoute.

**Correction proposée.**

- Exprimer le sémaphore par une contrainte : index unique partiel `ON taches ((true)) WHERE besoin_gpu AND etat = 'prise'`. Il devient atomique avec la prise, et libéré par la reprise du bail.
- Dans AD-11, exiger que chaque service GPU libère sa VRAM en fin de tâche (déchargement du modèle par le routeur llama.cpp, destruction du pipeline OpenVINO).
- Dans AD-12, écrire que la notification ne porte qu'un identifiant, et que l'écoute SSE se fait sur une connexion dédiée.

**Sources.**

- https://www.postgresql.org/docs/18/functions-admin.html (verrous consultatifs)
- https://www.postgresql.org/docs/18/sql-notify.html
- https://huggingface.co/blog/ggml-org/model-management-in-llamacpp

### M-3 — Repli `libopenh264` : risque de brevets et qualité faible ; `libx264` convient mieux (AD-16, rendu)

**Constat.**

- La licence de brevets H.264 payée par Cisco ne couvre **que les binaires téléchargés depuis Cisco**. Un FFmpeg compilé avec OpenH264 depuis les sources n'est pas couvert.
- OpenH264 vise surtout le profil Baseline contraint, d'où une qualité inférieure à débit égal.
- regie est sous AGPL-3.0 et FFmpeg tourne dans son propre conteneur. `libx264` (GPL-2.0+) est donc compatible, et nettement meilleur.
- La situation des brevets H.264 reste la même quel que soit l'encodeur logiciel. Pour un service hébergé, elle mérite une ligne dans les questions ouvertes.
- `h264_vaapi` sur Battlemage est confirmé par intel/media-driver : BMG listé, encodage AVC « D/E ». Il faut un `intel-media-driver` récent (trixie : 25.2.3 ; sid : 26.2.4) et le pilote noyau `xe`.

**Correction proposée.**

- Stack : remplacer le repli par `libx264`, en notant la licence GPL dans `LICENCES-TIERS`.
- Épingler la version d'`intel-media-driver` dans l'image de rendu.
- Ajouter la question des brevets H.264 (service hébergé) au Différé.

**Sources.**

- https://en.wikipedia.org/wiki/OpenH264
- https://fedoraproject.org/wiki/OpenH264
- https://github.com/intel/media-driver
- https://sources.debian.org/src/intel-media-driver/
- https://ffmpeg.org/download.html

### M-4 — Astro en middleware dans Fastify : il manque `@fastify/static`, la CSP et l'en-tête Host derrière le proxy

**Constat.**

- Le montage est bien documenté par Astro (`@fastify/middie` + `app.use(handler)`).
- Le gestionnaire appelle `next()` quand aucune route Astro ne correspond, ce qui a été vérifié dans `dist/serve-app.js` de `@astrojs/node` 11.1.6. Les routes `/api`, `/mcp` et tus passent donc à Fastify, **sauf si une route Astro attrape-tout (`[...slug]`) existe**.
- Le mode middleware ne sert pas les fichiers. La documentation utilise `@fastify/static`, absent de la Stack.
- middie appelle le gestionnaire avec `(req, res, next)`, sans `locals`. Il faut un enrobage pour transmettre l'`Acteur` (AD-8).
- CSP `default-src 'self'` (AD-17) : Astro émet des scripts en ligne pour l'hydratation des îlots. Sans l'option `security.csp` d'Astro, qui calcule des hashes SHA-256, les îlots seront bloqués. Les attributs `style` de Svelte demandent aussi `style-src` adapté.
- Derrière `proxy-tls`, Astro ne fait confiance à `X-Forwarded-Host` que pour les domaines listés dans `security.allowedDomains`.

**Correction proposée.**

- Ajouter `@fastify/static` à la Stack.
- Interdire les routes Astro attrape-tout, ou monter middie avec un préfixe.
- Écrire l'enrobage `(req, res, next) => handler(req, res, next, { acteur })`.
- AD-17 : activer `security.csp` d'Astro, et faire tester la CSP par la suite « visuel ».
- Fixer `security.allowedDomains`.

**Sources.**

- https://docs.astro.build/en/guides/integrations-guide/node/ (exemple Fastify ; « middleware mode does not do file serving »)
- https://docs.astro.build/en/reference/experimental-flags/csp/
- code de `@astrojs/node` 11.1.6, `dist/serve-app.js`

---

## Bas

### B-1 — @tus/server avec Fastify : refuser les envois sans `Upload-Length` (AD-18)

**Constat.**

- L'intégration documentée confirme l'usage prévu : `addContentTypeParser('application/offset+octet-stream', …)`, `app.all('/files', '/files/*')` et `tusServer.handle(req.raw, res.raw)`. Node ≥ 20.19 est requis.
- Le refus « avant transfert » d'AD-18 suppose une taille annoncée. Le protocole tus permet pourtant `Upload-Defer-Length`.
- Derrière le proxy, il faut `respectForwardedHeaders: true`.

**Correction proposée.**

- Dans `onUploadCreate`, refuser tout envoi sans taille et vérifier le quota. Régler `maxSize`.
- Utiliser l'expiration de `@tus/file-store` pour la purge à 24 h.

**Source.**

- https://github.com/tus/tus-node-server/tree/main/packages/server

### B-2 — Playwright : utiliser l'API officielle `page.screencast` (depuis 1.59) plutôt que le CDP brut (AD-10)

**Constat.**

- Playwright 1.63 expose la classe `Screencast`. `start({ onFrame, size, quality, path })` livre des images JPEG, ce qui couvre le mode enregistreur sans `CDPSession`.
- `showActions` et `showChapter` peuvent servir à la capture.
- Le CDP brut (`Page.startScreencast`) reste possible, mais lie le code à Chromium et aux détails internes.
- Si Chromium tourne dans un autre conteneur que le service `capture`, la connexion `browserType.connect` exige des versions client et serveur identiques. Il faut donc une image `mcr.microsoft.com/playwright:v1.63.0`.

**Correction proposée.**

- AD-10 : remplacer « screencast CDP » par « `page.screencast` (Playwright) ».
- Épingler l'image Chromium sur la même version que `playwright`.

**Sources.**

- https://playwright.dev/docs/api/class-screencast
- https://playwright.dev/docs/release-notes

### B-3 — Épinglage de llama.cpp sur un build du jour ; backend à valider sur la B570

**Constat.**

- `b11349` existe : publiée le 2026-10-02, avec binaires `ubuntu-vulkan-x64`, `ubuntu-sycl-fp16/fp32-x64` et `ubuntu-openvino-2026.4-x64`.
- Mais llama.cpp publie plusieurs builds par jour.
- Le backend SYCL n'est « vérifié » que sur la B580, avec oneAPI 2025.1 et le build b5377.
- Un backend **OpenVINO** existe désormais. Il permettrait de partager le même runtime que la transcription.

**Correction proposée.**

- Épingler le build retenu à l'issue du banc (Différé), et non une date.
- Ajouter le backend OpenVINO aux candidats du banc, avec Vulkan et SYCL.

**Sources.**

- https://github.com/ggml-org/llama.cpp/releases/tag/b11349
- https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/SYCL.md

### B-4 — vitest non épinglé

**Constat.** « Dernière stable au premier commit » contredit le principe d'épinglage d'AD-16. La version actuelle est vitest 5.0.3.

**Correction proposée.** Épingler 5.0.x.

**Source.** registre npm `vitest`.

### B-5 — Points vérifiés sans écart

- `zod` 4.6.5 fournit `z.toJSONSchema()`, et le SDK MCP accepte `zod ^3.25 || ^4.0`.
- `@astrojs/svelte` 9.0.1 demande Node ≥ 22.12 et `svelte ^5.43.6`, ce qui est compatible.
- `openvino-genai` 2026.4.1 publie des wheels pour Python 3.14.
- Whisper large-v3-turbo est bien sous licence MIT.
- PostgreSQL 18.6 est supporté jusqu'au 2030-11-14.
- Proxmox VE 9.2 et PBS 4.2 sont les versions courantes.
- FFmpeg 9.0.2 et libass sont disponibles (Debian sid : 9.0.2).
- Absence de SR-IOV sur la B570 grand public : cohérent, rien trouvé de contraire.
