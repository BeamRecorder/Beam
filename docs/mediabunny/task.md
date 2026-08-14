# Checklist du rework Mediabunny

Ce document est la checklist d'exécution et la définition de fini du plan décrit dans [`plan.md`](./plan.md).

## Règles d'exécution

- Sol est le seul agent autorisé à modifier le code produit, les plans et l'état Git.
- Les Luna peuvent effectuer des recherches, audits, revues, écrire uniquement les fichiers de tests explicitement confiés et exécuter des tests.
- Sol relit tout résultat ou test Luna, intègre les changements nécessaires et exécute lui-même les validations finales.
- Ne pas élargir le chantier au HUD, ProjectPicker ou à la webcam live/capture.
- Ne pas introduire de fallback HTML, couche de compatibilité, stub ou contenu média simulé.
- Exécuter `npm` et `cargo` directement dans l’environnement Fedora Linux du worktree.
- N'exécuter que les tests directement liés aux fichiers modifiés, sauf justification préalable d'un run plus large.

## 0. Préparation

- [x] Lire `docs/UI.md`.
- [x] Lire `docs/ARCHITECTURE.md`.
- [x] Lire `docs/CODE_QUALITY.md`.
- [x] Lire `docs/electron_window.md` et confirmer qu'aucun changement de fenêtre n'est nécessaire.
- [x] Vérifier que le worktree ne contient aucune modification utilisateur.
- [x] Actualiser `origin/master`.
- [x] Replacer `rework/mediabunny` sur `origin/master`.
- [x] Vérifier que le commit Linux reste protégé sur `feat/linux-recording` et sa PR #7.
- [x] Écrire le plan et la checklist sous `docs/mediabunny/`.
- [ ] Capturer la baseline actuelle : tests ciblés pertinents, comportement playback, mémoire et performance 1080p60.
- [ ] Inventorier une dernière fois les usages production de Mediabunny et `HTMLVideoElement` dans le périmètre.

## 1. Couche `media/shared`

- [ ] Créer `src/media/shared` avec des exports publics limités et documentés.
- [ ] Déplacer les types de composition média hors de `components`.
- [ ] Déplacer le mapping timeline/source et conserver toutes ses invariantes.
- [ ] Corriger les imports API afin qu'ils ne dépendent plus de types situés dans `components`.
- [ ] Définir `MediaSourceDescriptor`.
- [ ] Définir `MediaMetadata` et les métadonnées vidéo/audio utiles.
- [ ] Définir `MediaCapabilities`.
- [ ] Définir `MediaFrame` et son ownership explicite.
- [ ] Définir l'union discriminée `MediaError`.
- [ ] Implémenter la résolution des sources projet vers `project-media://`.
- [ ] Implémenter la factory `UrlSource` avec `SourceRef` et cache borné à 16 MiB.
- [ ] Limiter les demuxers aux formats actuellement importables.
- [ ] Implémenter `openMediaInput` et garantir son disposal sur tous les chemins.
- [ ] Implémenter `inspectMedia` : conteneur, durée, dimensions, rotation, codecs et pistes.
- [ ] Vérifier `canDecode`, la configuration concrète et le support WebCodecs.
- [ ] Remplacer les probes de durée/dimensions/pistes fondés sur `<video>/<audio>`.
- [ ] Corriger la fuite existante du probe de piste audio qui ne dispose pas son `Input`.
- [ ] Ajouter les tests success, empty, invalid, unsupported, failure et disposal.
- [ ] Atteindre au moins 90 % de couverture ciblée pour les nouveaux modules.

## 2. Protocole `project-media://`

- [ ] Extraire une unité testable pour le service de fichiers projet si nécessaire.
- [ ] Préserver la validation de chemin sous la racine projet.
- [ ] Implémenter une requête sans `Range` avec les bons headers.
- [ ] Implémenter une plage `bytes=start-end`.
- [ ] Implémenter une plage ouverte `bytes=start-`.
- [ ] Implémenter une plage suffixe `bytes=-length`.
- [ ] Retourner `206`, `Content-Range`, `Content-Length` et `Accept-Ranges`.
- [ ] Retourner `416` pour une plage hors limites, invalide ou multiple.
- [ ] Compléter les MIME types MP4, WebM, MOV, MKV et audio existants.
- [ ] Tester traversal simple et encodé, fichier absent, fichier vide et fichier hors projet.
- [ ] Vérifier qu'aucun chemin filesystem n'est ajouté à l'API renderer.

## 3. Moteur vidéo de playback

- [ ] Créer le protocole typé du worker playback.
- [ ] Valider chaque message entrant et sortant du worker.
- [ ] Ouvrir et réutiliser les sources par asset.
- [ ] Créer les consommateurs de décodage par `clipId`.
- [ ] Implémenter le mode séquentiel avec `CanvasSink.canvases(start)`.
- [ ] Configurer un pool de trois canvases.
- [ ] Limiter le préchargement à deux frames par clip actif.
- [ ] Transférer des `ImageBitmap` au renderer sans backlog.
- [ ] Fermer toute bitmap remplacée, obsolète ou évincée.
- [ ] Implémenter le seek/scrub avec génération et politique `latest-wins`.
- [ ] Coalescer les demandes de scrub afin de ne conserver que la plus récente.
- [ ] Garantir qu'une frame obsolète ne peut jamais peindre après une demande récente.
- [ ] Implémenter le LRU global de frames limité à 64 MiB.
- [ ] Gérer passage de clip, gap, trim, split et superposition.
- [ ] Gérer plusieurs occurrences simultanées d'un même asset.
- [ ] Gérer les vitesses `0.25x` à `4x`.
- [ ] Implémenter l'arrêt et le disposal complets du worker et des décodeurs.
- [ ] Ajouter les métriques de latence, frames, queues, cache et disposal en développement.
- [ ] Ajouter les tests du protocole, des races, des limites et des erreurs presque impossibles.

## 4. Horloge et playback audio

- [ ] Utiliser `AudioContext.currentTime` comme horloge maître de la composition.
- [ ] Remplacer le décodage intégral des longues sources par `AudioBufferSink` séquentiel.
- [ ] Planifier au plus une seconde de chunks audio à l'avance.
- [ ] Appliquer volume, trim, offset, durée et playback rate de chaque clip.
- [ ] Arrêter et déconnecter tous les nodes lors de pause, seek, erreur ou disposal.
- [ ] Invalider les tâches audio obsolètes avec la même génération que le playback.
- [ ] Gérer les clips sans audio et les pistes audio non décodables explicitement.
- [ ] Tester lecture, pause/reprise, seek, clip boundaries, gaps, overlaps et rates.
- [ ] Mesurer la dérive audio/vidéo sur une lecture longue.

## 5. Intégration du canvas et de Vue

- [ ] Créer un adaptateur Vue fin autour de `MediaPlaybackEngine`.
- [ ] Faire piloter `currentTime`, play, pause et seek par le moteur.
- [ ] Retirer le composable fondé sur un élément vidéo caché.
- [ ] Remplacer les maps de `HTMLVideoElement` des clips par les frames du moteur.
- [ ] Modifier les contrats de rendu pour accepter source et dimensions explicites.
- [ ] Retirer les branches `instanceof HTMLVideoElement` du périmètre.
- [ ] Préserver aspect ratio, rotation, crop, mirroring, DPR et image smoothing.
- [ ] Préserver zoom automatique, zoom manuel, curseur et sélection de clips.
- [ ] Présenter loading, missing, unsupported et decode failure distinctement.
- [ ] Tester fin de timeline, boucle, seek hors limites et changement de projet.
- [ ] Vérifier le disposal lors du démontage Vue.

## 6. Backgrounds, thumbnails et waveforms

- [ ] Migrer les backgrounds vidéo du canvas vers le moteur de frames.
- [ ] Préserver leur boucle et leur synchronisation avec play/pause.
- [ ] Remplacer le `<video>` ambiant par un poster canvas décodé.
- [ ] Migrer les previews vidéo du panneau de backgrounds vers Mediabunny.
- [ ] Déplacer le worker de thumbnails sous `src/media/playback`.
- [ ] Remplacer `BlobSource` par la source URL partielle partagée.
- [ ] Préserver génération, invalidation et cache borné des thumbnails.
- [ ] Faire agréger les waveforms progressivement sans buffer audio géant.
- [ ] Tester médias vides, très courts, très longs, invalides et non décodables.

## 7. Export Mediabunny

- [ ] Créer les primitives génériques sous `src/media/export`.
- [ ] Déplacer tous les imports directs de Mediabunny nécessaires à l'export sous `src/media`.
- [ ] Conserver la composition Beam dans la couche export applicative.
- [ ] Remplacer le frame provider basé sur `fetch -> Blob` par une source partielle.
- [ ] Garder un itérateur de décodage vivant pour les timestamps monotoniques.
- [ ] Indexer les frames de composition par `clipId`.
- [ ] Décoder les clips vidéo secondaires sans élément vidéo.
- [ ] Décoder les backgrounds vidéo sans élément vidéo.
- [ ] Supprimer la vidéo de secours de la piste screen.
- [ ] Supprimer les seeks `currentTime` et attentes `seeked`.
- [ ] Échouer explicitement sur toute source vidéo obligatoire non décodable.
- [ ] Préserver streaming des chunks, progression, finalisation et annulation.
- [ ] Fermer chaque frame après rendu et disposer toutes les ressources en `finally`.
- [ ] Tester MP4, WebM, audio présent/absent, annulation et échecs IPC.
- [ ] Vérifier les golden frames de la composition.

## 8. Gates fonctionnels

- [ ] MP4 H.264/AAC : lecture, seek, scrub et export validés.
- [ ] WebM VP8/Opus : lecture, seek, scrub et export validés.
- [ ] WebM VP9/Opus : lecture, seek et scrub validés.
- [ ] MOV H.264/AAC : lecture, seek et scrub validés.
- [ ] MKV VP9/Opus : lecture, seek et scrub validés.
- [ ] HEVC : lecture ou erreur unsupported explicite validée.
- [ ] AV1 : lecture ou erreur unsupported explicite validée.
- [ ] Crop, rotation, pixel aspect ratio et mirroring validés.
- [ ] Background, webcam enregistrée, curseur et zoom validés.
- [ ] Deux clips superposés du même asset à des temps différents validés.
- [ ] Aucun ancien résultat de seek ne remplace le résultat le plus récent.

## 9. Gates performance et mémoire

- [ ] Consigner OS, CPU, GPU, Electron, codec et stockage de la machine de référence.
- [ ] Utiliser une fixture locale longue 1080p60 compatible WebCodecs.
- [ ] Mesurer cinq minutes de lecture après warm-up.
- [ ] Vérifier moins de 1 % de frames perdues.
- [ ] Exécuter 100 seeks rapides représentatifs du scrub.
- [ ] Vérifier un p95 `seek -> frame` inférieur ou égal à 150 ms.
- [ ] Vérifier la dernière frame de scrub en moins de 150 ms.
- [ ] Mesurer dix minutes de lecture audio/vidéo.
- [ ] Vérifier une dérive audio/vidéo inférieure ou égale à 20 ms.
- [ ] Vérifier qu'aucun fichier entier n'est chargé pour le playback.
- [ ] Exécuter vingt cycles ouverture/seek/fermeture.
- [ ] Vérifier un retour mémoire à plus ou moins 10 % de la baseline stabilisée.
- [ ] Vérifier les limites du cache et des queues sous forte charge.

## 10. Validations finales par Sol

- [ ] Relire tous les tests écrits ou proposés par Luna.
- [ ] Relire le diff complet et exclure toute modification hors périmètre.
- [ ] Vérifier qu'aucun fichier de production ne dépasse 500 lignes.
- [ ] Vérifier types dédiés, absence de `any` et erreurs actionnables.
- [ ] Rechercher les imports directs de `mediabunny` hors de `src/media` dans le périmètre.
- [ ] Rechercher `<video>`, `HTMLVideoElement` et `createElement('video')` dans le video editor et l'export production.
- [ ] Exécuter les tests Vitest ciblés des modules modifiés sous Fedora Linux.
- [ ] Exécuter les tests Node ciblés Electron sous Fedora Linux.
- [ ] Exécuter la couverture ciblée et vérifier les quatre seuils à 90 %.
- [ ] Exécuter `npm run typecheck` sous Fedora Linux.
- [ ] Exécuter `npm run typecheck:vue` sous Fedora Linux.
- [ ] Exécuter le plus petit build Vite pertinent sous Fedora Linux.
- [ ] Exécuter les validations Electron réelles sur Windows.
- [ ] Documenter toute validation indisponible avec sa raison.
- [ ] Confirmer qu'aucun test complet inutile n'a été lancé.

## 11. Commits et PR

- [ ] Vérifier `git status -sb` et l'intégralité du diff avant staging.
- [ ] Confirmer que seuls le rework Mediabunny et sa documentation sont présents.
- [ ] Créer des commits intentionnels par couche : shared/input, playback, export/intégration, tests/gates.
- [ ] Vérifier une dernière fois les gates après le dernier commit.
- [ ] Pousser `rework/mediabunny` avec son upstream.
- [ ] Ouvrir une draft PR vers `master`.
- [ ] Utiliser le titre `refactor(media): unify editor playback and export on Mediabunny`.
- [ ] Décrire motivation, changements, impact utilisateur et limites matérielles.
- [ ] Inclure les commandes et résultats des validations.
- [ ] Inclure la matrice de formats et les métriques 1080p60.
- [ ] Vérifier que la PR n'inclut aucun changement de `feat/linux-recording`.

## Définition de fini

Le chantier n'est terminé que lorsque toutes les conditions suivantes sont satisfaites :

- [ ] Tous les items applicables ci-dessus sont cochés.
- [ ] Aucun élément vidéo HTML ne subsiste dans le video editor ou l'export production.
- [ ] Le playback, le scrub et l'export utilisent les abstractions de `src/media`.
- [ ] Les formats actuellement acceptés ont un comportement testé et explicite.
- [ ] Les gates 1080p60, latence, dérive et mémoire sont réussis sur la machine de référence.
- [ ] Les tests ciblés, typechecks, couverture et build sont verts.
- [ ] Le diff final respecte les contrats UI, architecture, qualité et sécurité Electron.
- [ ] La draft PR propre vers `master` est ouverte et documentée.
