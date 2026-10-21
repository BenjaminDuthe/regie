# Choix de la voix de synthèse (histoire 4.7)

Exigence : voix française locale (FR-27), libre, sans IA en nuage (NFR-26), licence compatible avec une redistribution
commerciale d'une application AGPL-3.0.

| Voix Piper | Licence | Décision |
| --- | --- | --- |
| fr_FR-gilles-low | CC0-1.0 | **retenue** (aucune obligation, aucune attribution) |
| fr_FR-siwis, fr_FR-mls | CC-BY | écartées pour l'instant : attribution à afficher ; reprenables sur demande |
| fr_FR-tom | AGPL | exclue |
| fr_FR-upmc | CC-BY-SA | exclue (partage à l'identique) |

Faute de choix humain, la règle de repli des critères s'applique : `gilles`, CC0.

## Mise en place

- Le modèle (`fr_FR-gilles-low.onnx` et son `.json`) se pose à la main sur le volume `/modeles` du LXC, en lecture seule
  pour le conteneur. Il n'est PAS dans une image (AD-11).
- Son empreinte SHA-256 doit être inscrite dans `deploiement/modeles.lock` (champ `sha256`, `null` aujourd'hui car le
  téléchargement n'a pas été fait depuis ce poste). Tant qu'elle manque, le cœur refuse de démarrer avec `REGIE_MODELES`.
- Piper (MIT, avec espeak-ng en GPL-3.0) tourne dans l'image de rendu, en processus séparé, sans réseau. Construire
  l'image avec `--build-arg PIPER_SHA256=<empreinte de l'archive>`.
- Variables : `REGIE_MODELES` (dossier des modèles), `REGIE_MODELES_LOCK`, `REGIE_VOIX`.
