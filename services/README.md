# Services techniques de regie

Chaque service est un conteneur qui prend ses tâches dans la file du cœur (fonctions SQL, AD-3) et ne travaille que dans le dossier de sa tâche (AD-7). Aucun n'arrive dans l'histoire 1.1 : ce dossier pose l'emplacement.

| Service | Langage | Rôle |
| --- | --- | --- |
| `rendu/` | TypeScript | rendu allégé et complet (FFmpeg + libass) |
| `capture/` | TypeScript | capture d'applis web, dans le LXC `regie-capture` |
| `publication/` | TypeScript | envoi vers les réseaux |
| `transcription/` | Python | transcription locale (Whisper sur OpenVINO) |
| `langage/` | Python | propositions de montage (llama.cpp) |
| `voix/` | Python | voix de synthèse locale |

Règles communes :

- Les services Python partagent les dépendances de `pyproject.toml` (racine), installées depuis le verrou haché : `pip install --require-hashes -r requirements.lock`.
- Aucun service ne lit l'environnement directement : la CI (`outils/ci/verifier-env.mjs`) refuse `os.environ`, `os.getenv` et `process.env` hors `coeur/src/env.ts`. Chaque service recevra son propre module de configuration validée quand il arrivera.
- Aucune IA en nuage : les modèles sont locaux, listés dans `deploiement/modeles.lock` (fichier créé par l'histoire qui introduit le premier modèle).
