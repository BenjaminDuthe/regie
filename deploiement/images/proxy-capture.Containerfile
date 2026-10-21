# regie — image du proxy de sortie de la capture (histoire 4.2, AD-10). Seul composant à joindre Internet pour la
# capture : liste blanche par laissez-passer, résolution DNS faite ici, plages privées et IP du foyer refusées.
# Contexte de construction : la racine du dépôt.

FROM docker.io/library/node:26.5.0-trixie-slim@sha256:715e55e4b84e4bb0ff48e49b398a848f08e55daed8eb6a0ea1839ae53bc57583

WORKDIR /regie
COPY paquets/contrats/ paquets/contrats/
COPY services/proxy-capture/ services/proxy-capture/
RUN mkdir -p node_modules/@regie && ln -s ../../paquets/contrats node_modules/@regie/contrats \
 && mkdir -p /var/traces-capture && chown node:node /var/traces-capture

USER node
# Configuration par fichier JSON (secret de clé monté en /run/secrets/regie_capture_cle), pas par l'environnement.
ENTRYPOINT ["node", "services/proxy-capture/src/principal.ts", "/etc/proxy-capture/config.json"]
