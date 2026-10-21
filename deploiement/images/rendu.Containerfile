# regie — image de l'exécutant de rendu (histoires 4.6, 4.7, AD-10). FFmpeg (libx264, libass) et, pour la voix, Piper.
# Un conteneur JETABLE par rendu : `--network none`, sans volume, racine en lecture seule, entrée et sortie standard.
#
# Licences : FFmpeg de Debian est construit en GPL (libx264) ; Piper (MIT) embarque espeak-ng (GPL-3.0-or-later). regie (AGPL-3.0) ne les lie
# pas : ils tournent dans un PROCESSUS SÉPARÉ, dans cette image, et ne communiquent avec le cœur que par des fichiers
# passés sur l'entrée standard (agrégation, pas œuvre dérivée). Le code source correspondant est celui des paquets
# Debian (`apt-get source ffmpeg`), cité dans deploiement/licences-tiers.json. Les polices sont celles de Debian (OFL-1.1).
# Contexte de construction : la racine du dépôt.
#   podman build -f deploiement/images/rendu.Containerfile -t localhost/regie-rendu:local .

FROM docker.io/library/node:26.5.0-trixie-slim@sha256:715e55e4b84e4bb0ff48e49b398a848f08e55daed8eb6a0ea1839ae53bc57583

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-inter fonts-montserrat fonts-bebas-neue fonts-playfair-display fontconfig \
 && ln -s /usr/share/fonts/truetype /opt/polices \
 && rm -rf /var/lib/apt/lists/*

# Piper (synthèse vocale locale, histoire 4.7) : version épinglée, empreinte exigée (`--build-arg PIPER_SHA256=...`, à
# relever sur la page de la version). Le MODÈLE de voix n'est PAS dans l'image : il vit sur le volume /modeles, monté
# en lecture seule, et son empreinte est vérifiée à chaque synthèse (deploiement/modeles.lock, NFR-30).
ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_SHA256=
ADD --checksum=sha256:${PIPER_SHA256} https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz /tmp/piper.tar.gz
RUN tar -xzf /tmp/piper.tar.gz -C /opt && ln -s /opt/piper/piper /usr/local/bin/piper && rm /tmp/piper.tar.gz

WORKDIR /app
COPY services/rendu/src/ src/
USER 1000:1000
ENTRYPOINT ["node", "/app/src/executer.ts"]
