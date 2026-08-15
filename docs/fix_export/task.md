# Fixing Export — checklist exécutable

## Règles de gate

- [x] Aucun placeholder, fallback silencieux ou compatibility layer.
- [x] Aucun média obligatoire manquant ou invalide n’est ignoré.
- [x] Une migration unique est persistée ; seul le schéma canonique est ensuite
      accepté.
- [x] Sol écrit et relit tout le code produit. Les Luna sont limités aux audits,
      tests ciblés qui leur sont confiés et exécutions de tests.

## 1. Préparation

- [x] Lire `docs/UI.md`, `docs/ARCHITECTURE.md`, `docs/CODE_QUALITY.md` et
      `docs/electron_window.md`.
- [x] Vérifier le worktree, récupérer `origin/master` et le fusionner dans
      `rework/mediabunny`.
- [x] Créer ce plan et cette checklist avant le code produit.

## 2. Schéma et migration

- [x] Définir `ClipComposition` v2 et `ProjectEditorState` v3 stricts.
- [x] Rendre obligatoires appearance/miroirs, caption complet et présentation
      curseur complète.
- [x] Migrer v1/v2 une seule fois, y compris `showBackground`, champs `box*`,
      wrap, backdrop blur, miroir Y, curseur et presets de canvas.
- [x] Réécrire atomiquement avant utilisation puis supprimer les lectures legacy
      et defaults runtime.
- [x] Rejeter versions inconnues et données invalides.
- [x] Gate : tests Node/Vitest de migration, réécriture et presets.

## 3. Rendu partagé

- [x] Introduire le renderer de scène et l’ordre canonique.
- [x] Unifier matrice caméra et espace canvas des overlays.
- [x] Centraliser backgrounds et blur, y compris gradient.
- [x] Partager captions, backdrop blur, webcam et curseur.
- [x] Préserver shadows, frames, borders, crop, miroirs et `shadowScale`.
- [x] Gate : tests de géométrie et égalité des commandes preview/export.

## 4. Caméra et curseur

- [x] Remplacer l’horloge murale par un évaluateur déterministe.
- [x] Simuler à 120 Hz avec checkpoints 250 ms et invalidation explicite.
- [x] Rendre les ripples purs (0/250/500 ms) et préserver click spring/motion blur.
- [x] Gate : lecture, seeks et exports 30/60 FPS identiques à epsilon près.

## 5. Captions et UI

- [x] Ajouter `BackdropBlurControl.vue` (0–48 px) avec primitives existantes.
- [x] Appliquer le blur au rectangle de texte étendu avant le texte.
- [x] Garder les captions au premier plan avec et sans screen.
- [x] Ajouter les traductions dans toutes les locales.
- [x] Gate : wrap on/off, blur preview/export et taille de police identique.

## 6. Préflight, FPS et erreurs

- [x] Définir `ExportValidationError`, issues structurées et `PreparedExport`.
- [x] Valider uniquement les sources actives avant création du fichier.
- [x] Rejeter les GIF à l’import et au préflight avec `GIF not supported`.
- [x] Mesurer chaque vidéo active avec `computePacketStats(100)` ; prendre le
      maximum, ou 30 FPS si aucune vidéo.
- [x] Remplacer les skips silencieux de sources requises par des erreurs typées.
- [x] Garder Export visible et afficher l’erreur dans popover + toast copiable
      (icône Lucide), sans chemin absolu.
- [x] Gate : sources manquantes/inutilisées, codec, decode, FPS et durée A/V.

## 7. Validation finale

- [x] Relire tous les tests Luna et ajuster si nécessaire.
- [x] Exécuter uniquement les Vitest ciblés concernés.
- [x] Exécuter `node --test test/clip-composition.test.cjs`.
- [ ] Exécuter les deux typechecks via `powershell.exe`.
- [ ] Exécuter le plus petit build Vite pertinent via `powershell.exe` sous
      Fedora Linux.
- [ ] Réaliser si l’environnement le permet la validation Electron MP4/WebM et
      la matrice shadows, Safari/Win95, overlays, webcam, zoom, cursor, gradient
      blur, captions et audio ; documenter les contrôles indisponibles.
- [x] Vérifier le diff, la limite de 500 lignes et l’absence de patterns interdits.
- [x] Créer des commits propres par domaine avec un bilan gains/pertes. Ne pas
      push et ne pas ouvrir de PR sans demande explicite.

### Contraintes de validation de l’environnement

- `powershell.exe` est absent de ce WSL. Le typecheck TypeScript et le build Vite
  de développement ont donc été exécutés directement avec les binaires locaux ;
  ils réussissent.
- Le typecheck Vue global reste bloqué par des erreurs préexistantes hors du
  périmètre export dans HUD, Teleprompter, Gradient, ZoomPanel et TimelineTracks.
- Aucune session Electron graphique ni moteur Rust Windows n’est disponible ici ;
  la matrice manuelle MP4/WebM reste à exécuter sur Fedora/Windows.
