# regie — image du cœur (développement et, plus tard, production).
# Image de base épinglée par empreinte (deploiement/versions.json).
# Contexte de construction : la racine du dépôt.

FROM docker.io/library/node:26.5.0-trixie-slim@sha256:715e55e4b84e4bb0ff48e49b398a848f08e55daed8eb6a0ea1839ae53bc57583

WORKDIR /regie
COPY package.json package-lock.json .npmrc .node-version ./
COPY paquets/contrats/package.json paquets/contrats/
COPY coeur/package.json coeur/
RUN npm ci --ignore-scripts

COPY tsconfig.base.json tsconfig.json ./
COPY paquets/ paquets/
COPY coeur/ coeur/
RUN npm run build

USER node
ENV NODE_ENV=production HOTE=0.0.0.0 PORT=4321
EXPOSE 4321
CMD ["node", "coeur/src/serveur.ts"]
