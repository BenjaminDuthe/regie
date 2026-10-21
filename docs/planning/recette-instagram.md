# Recette sur le compte Instagram de test (histoire 9.3)

Trois cas, à jouer dans l'ordre sur un compte Instagram **de test** (professionnel, rattaché à une application Meta en mode
développement). Chaque cas existe aussi en test automatique contre le faux Meta : `coeur/test/recette-instagram.test.ts`
(lancé par `npm run ci`). Le test automatique prouve la logique ; seule la recette ci-dessous prouve le lien avec le vrai
Instagram. Elle n'a pas été jouée : elle exige un compte et une application Meta que seul Benjamin peut créer (voir ARBITRAGES 9.3).

## Avant de commencer

- Le compte de test est connecté dans Paramètres, réseau Instagram (état « connecté », échéance du jeton lue).
- regie est joignable depuis Internet par l'adresse publique configurée (`urlPublique`) : Meta va chercher la vidéo à une adresse signée.
- Une démo a été filmée, éditée, et son rendu complet est prêt. Durée entre 3 et 90 s, verticale.
- Noter l'heure de départ de chaque cas, le lien rendu, et les captures d'écran à garder dans la colonne « preuve ».

## Cas 1 : départ à l'heure, une seule fois

1. Programmer la démo à une heure proche (5 minutes dans le futur, heure de Paris) : `publication.programmer`, ou la bibliothèque.
2. Attendre. Rien ne doit partir avant l'heure.
3. À l'heure, dans la minute : la publication passe « en file » puis « publiée ».
4. Ouvrir le lien rendu : la vidéo est lisible, verticale, sans filigrane, avec sa légende.
5. Attendre deux minutes de plus : rien d'autre ne part. Le compte ne montre qu'une publication.

Attendu : une seule publication sur Instagram, le lien dans regie, une notification « publiée », une seule tentative dans l'historique.

## Cas 2 : un échec visible, puis « rejouer »

1. Provoquer un échec sûr : retirer l'accès de l'application dans les réglages du compte Instagram (jeton révoqué), puis publier maintenant.
2. regie refuse ou la publication passe « en échec » : la cause est lisible dans la bibliothèque et dans la notification, aucun jeton n'y figure.
3. Instagram ne montre rien de nouveau.
4. Reconnecter le compte dans Paramètres, puis `publication.rejouer`.
5. La publication part et passe « publiée » ; l'historique montre deux tentatives.

Variante : une vidéo hors bornes (plus de 90 s) est refusée avant tout envoi, avec la borne nommée.
Une publication « incertaine » (coupure après envoi) ne se rejoue pas : vérifier à la main sur le compte, puis décider.

## Cas 3 : redémarrage avec une publication programmée

1. Programmer une démo à une heure proche (10 minutes).
2. Redémarrer le conteneur du cœur (ou le CT), avant ou après l'heure dite, la première fois avant et la seconde pendant l'envoi.
3. regie revient : une échéance en retard de moins de 2 h part au redémarrage ; au-delà, elle échoue avec la cause `ECHEANCE_PERIMEE` et se rejoue à la main.
4. Contrôler le compte : une seule publication, jamais deux.

## Compte rendu

| Cas | Date | Lien obtenu | Résultat | Signature |
| --- | --- | --- | --- | --- |
| 1 départ à l'heure | | | | |
| 2 échec puis rejeu | | | | |
| 3 redémarrage | | | | |
