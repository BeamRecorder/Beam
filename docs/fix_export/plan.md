# Fixing Export — plan d’architecture

## Objectif

Garantir qu’une composition rend exactement la même scène dans l’éditeur et dans
l’export, au même temps de composition, et qu’un export invalide échoue avant la
création du fichier avec une erreur exploitable.

## Règles absolues

- Aucun placeholder, fallback silencieux ou compatibility layer.
- Aucun média obligatoire manquant, illisible ou non décodable n’est ignoré.
- Les anciens projets sont migrés une seule fois puis réécrits atomiquement. Seul
  le schéma canonique est accepté après migration.
- Les timestamps restent exprimés en secondes. Le FPS change la densité des
  images, jamais la vitesse ou la durée de la composition.
- Le volume global du player reste un réglage de monitoring. Seuls les volumes
  des clips participent à l’export.
- La transition UI de background de 180 ms ne fait pas partie de la timeline.

## Architecture retenue

### Scène et géométrie

Un renderer partagé reçoit un snapshot strict, le temps de composition, les
ressources validées et une cible de rendu. Il applique cet ordre canonique :

1. background ;
2. screen et médias vidéo/image, dans l’espace caméra ;
3. webcam, avec compensation du zoom ;
4. captions, au-dessus de tous les visuels ;
5. curseur, dans l’espace caméra.

Les médias importés sont positionnés relativement au canvas complet. Screen,
overlays, frames, webcam et curseur utilisent une matrice caméra unique. Les
backgrounds couleur, gradient, image et vidéo passent par la même politique de
blur. `shadowScale` conserve sa sémantique : proportionnel dans la preview,
pixels de sortie dans l’export.

### Caméra et curseur

`CompositionCameraEvaluator` est une fonction du temps de composition et de ses
entrées uniquement. Le suivi automatique et le spring sont simulés à 120 Hz,
avec checkpoints tous les 250 ms. Son cache est invalidé quand zooms,
télémétrie, canvas ou screen changent.

Le ripple est pur : durée 500 ms, rayon de 2 px à `2 + rippleSize`, expansion
ease-out, opacité de 1 à 0 et trait de 3 px de sortie, réduit dans la preview.
Click spring et motion blur continuent d’utiliser leurs helpers partagés.

### Captions

Le style canonique requiert `wrap`, `backdropBlur`, `outlineColor`,
`outlineWidth` et `extrusionDepth`. Le backdrop blur (0–48 px, valeur initiale
0) s’applique au rectangle réellement mis en page, augmenté de l’outline et de
l’extrusion, avant le texte. Le même renderer de captions sert aux deux chemins.

La migration renomme `boxColor`, `boxPadding`, `boxRadius` et matérialise les
valeurs absentes. Les captions restent au premier plan, même sans screen et
indépendamment de leur ancien `order`.

### Préflight, sources et FPS

Le préflight construit la liste exacte des clips actifs. Avant toute création de
sortie, il valide asset, URL projet autorisée, fichier, format, pistes, codec et
décodabilité. Il charge uniquement les images référencées par des clips actifs.
Les GIF échouent avec `GIF not supported` à l’import et au préflight.

`PreparedExport` contient uniquement les sources validées, les ressources à
libérer et le FPS canonique. Celui-ci est le maximum réel des vidéos actives,
mesuré avec `computePacketStats(100)`. Une composition sans vidéo utilise 30
FPS. Un FPS indéterminable ou non encodable est une erreur.

Les erreurs sont des `ExportValidationError` discriminées : `missing-asset`,
`unsupported-format`, `invalid-source`, `unsupported-codec`, `decode-failure`,
`fps-unavailable`, `render-invariant`. Chaque issue contient asset ID, clip ID,
nom et chemin projet relatif attendu quand ils existent, jamais de chemin absolu
dans l’UI ou le presse-papiers.

### Schémas et migration

- `ClipComposition` passe en version 2.
- `ProjectEditorState` passe en version 3.
- `VisualClip.appearance`, `isMirrored`, `isMirroredY`, le style caption complet
  et toute la présentation curseur sont obligatoires.
- La migration matérialise l’apparence historique du screen à partir de
  `showBackground`, le miroir vertical, le style caption, la présentation
  curseur et préserve `3:4`, `4:3`, `21:9`.
- La réécriture du manifeste précède son utilisation. Toute version inconnue ou
  donnée invalide est rejetée ; elle n’est jamais remplacée par une composition
  vide.

## Invariants de rendu

- À timestamp identique, preview et export produisent la même caméra et les mêmes
  commandes de dessin, à l’échelle de sortie près.
- Seek direct, seek arrière, lecture séquentielle et export 30/60 FPS convergent
  vers le même échantillon caméra à epsilon près.
- Crop, mirroring, borders, frames, shadows, canvas size, backgrounds, webcam,
  curseur, captions et audio restent fonctionnels.
- Une source active erronée stoppe l’export ; une source inutilisée ou désactivée
  n’a aucun effet.
- Le bouton Export reste visible pour tout projet ouvert.

## Critères d’acceptation

- Parité visuelle démontrée par les tests de commandes de dessin et la matrice
  Electron MP4/WebM.
- Préflight complet avant écriture, erreurs structurées affichées dans le popover
  et dans un toast copiable via une icône Lucide.
- FPS 24/30/60 et multi-sources corrects, image-only à 30 FPS, durées inchangées.
- Migration réelle v1/v2 vers v2/v3 persistée atomiquement, versions inconnues
  refusées.
- Tests ciblés, deux typechecks et plus petit build pertinent réussis ; limites
  de 500 lignes et règles absolues vérifiées dans le diff final.
