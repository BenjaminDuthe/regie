# Arbitrages en attente

Décisions que le codeur n'a pas à prendre seul (produit, accès, jeton tiers). Format : histoire, question, options, recommandation.

## 1.14 Se connecter par Authentik

1. **Application Authentik** — l'application OIDC « regie » n'existe pas encore. Benjamin la crée (redirection `<REGIE_URL_PUBLIQUE>/connexion/retour`, client confidentiel), dépose le secret dans `regie_oidc_client` et pose `REGIE_URL_PUBLIQUE`, `REGIE_OIDC_EMETTEUR`, `REGIE_OIDC_CLIENT_ID`, `REGIE_ADMIN_SUB`. Recommandation : désigner l'utilisateur par `REGIE_ADMIN_SUB` (stable) plutôt que par l'e-mail.
2. **Mentions légales** — `/confidentialite` et `/conditions` portent des repères `⟨À CONFIRMER⟩` : identité et adresse de l'éditeur, e-mail de contact, durées de conservation, lieu d'hébergement, avis de la CNIL, limites de responsabilité, tribunal compétent. Seul Benjamin les connaît.
3. **Durée de session** — 7 jours, révocable. Options : 24 h, 7 jours, 30 jours. Recommandation : 7 jours (outil personnel, actions sensibles protégées par la réauthentification de 10 minutes).
4. **Création de la marque** — la marque « Établia » est créée à la première connexion de l'utilisateur autorisé. Option : la créer à l'installation. Recommandation : garder la création à la première connexion (aucun geste de plus).
5. **E-mail comme identité** — accepté seulement si Authentik le déclare vérifié (`email_verified`). Recommandation : s'en tenir au `sub`.
6. **Échecs sans marque** — tant qu'aucune marque n'existe, un échec de connexion n'est pas écrit au journal (la table exige `marque_id`). Option : une marque « système ». Recommandation : attendre 1.13.
7. **Fin de session Authentik** — la déconnexion renvoie vers `end_session_endpoint` s'il est annoncé, sans `post_logout_redirect_uri` (à déclarer côté Authentik pour revenir sur regie). Recommandation : le déclarer quand l'application est créée.
8. **Réauthentification** — `max_age=600` seul peut être ignoré par un fournisseur ; regie contrôle donc `auth_time` au retour et refuse sinon. Aucune décision attendue, signalé pour mémoire.

## 1.12 Brancher son Claude sur regie

1. **CIMD (Client ID Metadata Documents)** — reporté : exige une requête sortante vers l'adresse fournie par le client, donc un nouveau domaine dans `sorties-autorisees.json` et une protection contre les requêtes serveur (SSRF). Seule l'inscription dynamique bornée (DCR) est livrée. Options : DCR seule, ajouter CIMD. Recommandation : DCR seule tant que Claude l'accepte.
2. **Redirections autorisées** — `https://claude.ai/…` et `https://claude.com/…`, plus les adresses locales (`localhost`, `127.0.0.1`) pour les clients de bureau. Option : liste réduite à Claude. Recommandation : garder cette liste.

## 1.13 Consulter le journal d'audit

1. **Périmètre « instance »** — en V1 il n'y a qu'une marque : l'administrateur (`REGIE_ADMIN_SUB`) voit tout son journal, avec le seul genre des objets des autres (jamais leur identifiant). Une vue inter-marques exige le rôle `regie_admin` et son SELECT interdit sur les contenus : reportée. Recommandation : la faire quand une deuxième marque existera.
2. **Rattachement à un espace** — le journal ne porte pas l'espace de chaque action : « mon espace » montre mes actions et les lignes dont l'objet est `espace:<mon espace>`. Option : ajouter une colonne `espace_id` au journal (migration, chaîne recalculée). Recommandation : l'ajouter avec la première action de contenu (V1 suivante).
