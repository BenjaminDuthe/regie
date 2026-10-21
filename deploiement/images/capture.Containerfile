# regie — image de l'exécutant de capture (histoire 4.2, AD-10). Chromium JETABLE : un conteneur par capture, lancé par
# le cœur via le socket Podman d'un utilisateur dédié, sans volume, racine en lecture seule, réseau interne.
# Playwright (version exacte, deploiement/versions.json) vit ICI, jamais dans le cœur.
# Contexte de construction : la racine du dépôt. Construire en tant qu'utilisateur dédié (podman rootless) :
#   podman build -f deploiement/images/capture.Containerfile -t localhost/regie-capture:local .

FROM docker.io/library/node:26.5.0-trixie-slim@sha256:715e55e4b84e4bb0ff48e49b398a848f08e55daed8eb6a0ea1839ae53bc57583

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/navigateurs
WORKDIR /app
RUN npm init -y >/dev/null \
 && npm install --ignore-scripts --no-audit --no-fund --save-exact playwright@1.63.0 \
 && npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm

COPY services/capture/src/ src/
# Sans clé ni jeton : la demande arrive sur l'entrée standard, le résultat part sur la sortie standard.
USER 1000:1000
ENTRYPOINT ["node", "/app/src/executer.ts"]
