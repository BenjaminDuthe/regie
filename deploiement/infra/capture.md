# Installation de la capture (histoire 4.2) — à faire par l'administrateur

Rien de ce qui suit n'est appliqué par le dépôt. Capture et proxy tournent dans le LXC `regie` (adaptation V1 : pas de LXC ni de VLAN séparés).

1. Utilisateur Unix dédié `regie-capture` (sans shell, sans sudo, sans accès à `/run/secrets` du cœur) : `loginctl enable-linger regie-capture`, plages `subuid`/`subgid` propres. Son socket : `/run/user/<uid>/podman/podman.sock` (`systemctl --user enable --now podman.socket`). Le cœur reçoit ce chemin dans `REGIE_CAPTURE_SOCKET` ; ce socket ne montre que les conteneurs de cet utilisateur, aucun autre conteneur du LXC.
2. Copier `deploiement/quadlet/*.network` et `proxy-capture.container` dans `~regie-capture/.config/containers/systemd/`. Ne pas installer `capture.container` (modèle).
3. Construire en tant que `regie-capture` : `capture.Containerfile` (étiquette `localhost/regie-capture:local`) et `proxy-capture.Containerfile` (`localhost/regie-proxy-capture:local`).
4. Clé partagée : 32 octets aléatoires en base64url, créée comme secret Podman `regie_capture_cle` pour `regie-capture` ET déposée en fichier `regie_capture_cle` dans le dossier de secrets du cœur. Jamais dans le dépôt ni dans l'environnement.
5. `config.json` du proxy : `{"ecoute":{"hote":"10.89.77.2","port":3128},"fichierCle":"/run/secrets/regie_capture_cle","dossierTraces":"/var/traces-capture","foyer":["<adresse IP publique du foyer>"]}`. Les traces (destinations, jamais le contenu) sont conservées 1 an puis purgées.
6. Vérifier : depuis un conteneur du réseau `capture-interne`, rien d'autre que `10.89.77.2:3128` n'est joignable ; un `podman ps` par le socket du cœur ne liste aucun autre conteneur ; le bac à sable de Chromium s'ouvre (voir ARBITRAGES 4.2, profil seccomp).
