# Contrôle de préparation à l'implémentation — regie V1

Date : 2026-10-02. Méthode : `bmad-sprint-planning`, intention « readiness ». Relecture par un agent indépendant, puis nouveau contrôle après corrections.

**Documents contrôlés :**
- PRD : `prds/prd-regie-2026-10-02/prd.md`
- socle : `architecture/architecture-regie-2026-10-02/ARCHITECTURE-SPINE.md`
- maquettes : `maquette/public/relire.html`, `maquette/public/capture.html`
- épopées : `epics.md`

**Verdict final : PASS.** Le premier passage avait rendu CONCERNS, avec 14 constats. Tous sont corrigés.

## Décision du propriétaire

Le second facteur est obligatoire pour l'administrateur de l'instance seul. Il reste hors V1 pour les autres comptes.

Cette décision est reportée dans :
- le PRD §6 ;
- le socle (AD-15) ;
- AR-13 ;
- `MANDAT.md`.

## Constats et corrections

| Gravité | Constat | Correction |
|---|---|---|
| Critique | Le PRD et AD-15 se contredisaient sur le second facteur. | Décision du propriétaire, documents alignés. |
| Critique | Le banc du modèle de langage (5.2) arrivait après les histoires qui en dépendent. | Nouvelle histoire 2.10, avec une règle de choix (VRAM, NFR-2, accord avec l'annotation) et un repli processeur qui déclenche la décision « second hôte ». |
| Critique | Aucune histoire ne créait les échéances ni le planificateur. | Nouvelle histoire 2.2. L'histoire 1.4 ne démarre plus que ce qui existe déjà. |
| Majeur | La purge partait de la création de la séance. | 2.14 compte désormais depuis la livraison de la série. L'inventaire FR-52 est aligné. |
| Majeur | Plusieurs points différés n'avaient ni histoire ni repli. | Arc : 1.4 et 2.12. Confiance par mot : 2.9. Voix : 4.7, gilles par défaut. Brevets, débit et chronométrage conditionnent l'ouverture des inscriptions (1.7). |
| Majeur | Aucune histoire ne créait le LXC `regie-recette`. | Il est créé en 1.4. |
| Majeur | Le test image rendu ⇔ lecteur arrivait trop tôt (2.6). | Déplacé en 3.1. |
| Majeur | Les histoires 1.1 et 4.2 étaient trop grosses. | 1.1 est scindée en 1.1, 1.2 et 1.3 ; 4.2 en 4.2 et 4.3. |
| Mineur | L'accroche n'avait pas de producteur. | Elle est produite en 2.11. |
| Mineur | Aucune histoire n'amorçait le catalogue de musique. | Amorçage prévu en 3.6, avec un comportement défini quand il compte moins de trois morceaux. |
| Mineur | Le canal du journal en direct n'était pas précisé. | Flux SSE de la séance (4.5). |
| Mineur | L'état « à confirmer » ne portait pas le même nom partout. | 7.4 dit « à confirmer », avec `en_attente_confirmation` dans le code. |
| Mineur | FR-71 n'était rattaché qu'à l'épopée 1. | Il est rattaché aux épopées 1 et 7. |
| Mineur | Le filtre par réseau arrivait avant la publication (3.9). | Déplacé en 7.5. |
| Mineur (2e passage) | Le chronométrage n'était pas enregistré de la même façon en 1.7 et en 2.12. | 1.7 lit l'inscription faite par 2.12. |
| Mineur (2e passage) | Aucune histoire ne constituait le jeu de référence. | Ajouté en 2.9 : consentement, emplacement hors dépôt, annotation. |

## Résultat

- 8 épopées et 67 histoires.
- Couverture complète : 71 FR, 39 NFR, 25 AR et 25 UX-DR.
- Aucune dépendance vers l'avant bloquante.
