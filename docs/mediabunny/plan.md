# Rework Mediabunny unifié pour le video editor

## Décision

Centraliser les médias fichier du video editor sous `src/media/{shared,playback,export}` et supprimer les usages de `HTMLVideoElement` dans le video editor et l'export.

Le rework est limité aux médias fichier de l'éditeur. Le HUD, le ProjectPicker, la preview caméra live et la capture webcam restent hors périmètre. Ces derniers consomment des `MediaStream` et relèvent d'une pipeline distincte.

La cible de performance est une lecture locale 1080p60 fluide sur les codecs pris en charge par WebCodecs. Le système doit être frame-accurate et optimisé pour le seek et le scrubbing, sans promettre un seek instantané sur tout codec, résolution ou matériel.

## Pourquoi effectuer ce rework

- Remplacer les seeks asynchrones concurrents des éléments `<video>` par une politique `latest-wins` déterministe.
- Utiliser une horloge `AudioContext` unique pour réduire la dérive audio/vidéo.
- Lire les longues vidéos par plages avec `UrlSource`, sans `fetch -> Blob` du fichier entier.
- Partager les règles de timing, de décodage et d'erreur entre preview, timeline et export.
- Centraliser la détection des formats/codecs, le cache, les erreurs et le cycle de vie des ressources.
- Supprimer les fallbacks HTML silencieux qui rendent les bugs difficiles à reproduire.

L'architecture suit les principes du [player officiel Mediabunny](https://mediabunny.dev/examples/media-player/) : `CanvasSink` pour la vidéo, `AudioBufferSink` pour l'audio, pré-décodage séquentiel, invalidation des opérations obsolètes et horloge Web Audio.

## Périmètre

### Inclus

- Playback du canvas principal.
- Seeking et scrubbing de la timeline.
- Clips vidéo secondaires et webcam enregistrée.
- Backgrounds vidéo et poster du background ambiant.
- Thumbnails et waveforms du video editor.
- Lecture des métadonnées média : durée, dimensions, rotation, codecs et présence de pistes.
- Export MP4/WebM et lecture de toutes les sources vidéo utilisées par l'export.
- Accès sécurisé et partiel aux fichiers via `project-media://`.
- Formats vidéo actuellement importables : MP4, WebM, MOV et MKV.

### Exclus

- ProjectPicker et previews du HUD.
- Preview caméra live.
- Capture caméra et compteur de frames basé sur un `MediaStream`.
- Nouveaux formats d'import.
- Extensions ProRes/AC-3, NodeAV, `@mediabunny/server` ou fallback FFmpeg.
- WebGPU et changement de moteur de composition Canvas 2D.
- Changement des fenêtres Electron ou de leur comportement natif.

## Architecture cible

### `src/media/shared`

- Devenir la source canonique des types de composition et du mapping timeline/source, afin que les APIs et l'export ne dépendent plus de `components`.
- Définir les contrats `MediaSourceDescriptor`, `MediaMetadata`, `MediaCapabilities`, `MediaFrame` et une union discriminée `MediaError`.
- Exposer `inspectMedia(source)` et `openMediaInput(source)`.
- Résoudre les fichiers projet vers des URLs opaques `project-media://` avant de les transmettre aux workers.
- Utiliser un `UrlSource` partagé par asset avec `SourceRef`, un cache maximum de 16 MiB et un disposal explicite.
- Limiter les formats d'entrée aux conteneurs nécessaires aux formats actuellement acceptés, plutôt que d'inclure tous les demuxers sans besoin.
- Vérifier `track.canDecode()`, la configuration du décodeur et le support WebCodecs avant toute lecture.
- Retourner une erreur explicite pour un conteneur invalide, une piste absente ou un codec non décodable.

### `src/media/playback`

- Fournir un `MediaPlaybackEngine` indépendant de Vue avec les opérations suivantes :
  - `loadComposition(composition)` ;
  - `play(timelineSeconds)` ;
  - `pause()` ;
  - `seek(timelineSeconds, mode)` ;
  - `frameFor(clipId)` ;
  - abonnement aux événements `time`, `frame`, `state` et `error` ;
  - lecture des métriques de développement ;
  - `dispose()`.
- Faire retourner à `seek` un résultat `presented | superseded`. Une demande obsolète ne doit jamais remplacer une frame plus récente.
- Décoder la vidéo dans un worker dédié avec `CanvasSink` :
  - pool de trois canvases ;
  - au plus deux frames préchargées par clip actif ;
  - transfert d'`ImageBitmap` vers le renderer ;
  - fermeture immédiate des bitmaps remplacées ou évincées.
- Utiliser deux chemins distincts :
  - itérateur séquentiel `canvases(start)` pendant la lecture ;
  - demandes coalescées, générationnelles et `latest-wins` pendant le seek/scrub.
- Maintenir un LRU global de frames limité à 64 MiB.
- Identifier les consommateurs par `clipId`, pas uniquement par asset, pour permettre deux occurrences simultanées d'un même fichier à des source-times différents.
- Planifier l'audio par chunks `AudioBufferSink`, au plus une seconde à l'avance.
- Utiliser `AudioContext.currentTime` comme horloge maître. Pause et seek doivent arrêter les nodes planifiés, incrémenter la génération et reconstruire le planning depuis la nouvelle position.
- Appliquer précisément trims, offsets, volumes et vitesses `0.25x` à `4x`.

### `src/media/export`

- Contenir tous les imports directs de Mediabunny nécessaires à la lecture et à l'encodage d'export.
- Exposer des primitives de lecture séquentielle de frames, de sélection des codecs de sortie et de sortie MP4/WebM streamée.
- Conserver l'orchestration et le rendu de la composition Beam dans `src/components/export`, sans import direct de `mediabunny` depuis cette couche.
- Lire les frames par `clipId`, y compris les backgrounds vidéo et les occurrences superposées d'un même asset.
- Supprimer les vidéos de secours, les mutations de `currentTime` et l'attente des événements `seeked`.
- Échouer explicitement si une source requise ne peut pas être décodée.
- Fermer les frames et disposer inputs, sinks et sortie lors de la réussite, de l'annulation ou d'une erreur.

## Intégration du video editor

- Remplacer le composable fondé sur un élément vidéo et les maps de vidéos par un adaptateur Vue unique autour de `MediaPlaybackEngine`.
- Faire consommer aux renderers des `CanvasImageSource` accompagnées de dimensions explicites.
- Retirer les branches `instanceof HTMLVideoElement` du rendu, du zoom et des overlays concernés.
- Laisser le moteur piloter le temps courant ; Vue ne fait que refléter cet état et transmettre les intentions play/pause/seek.
- Maintenir l'actualisation visuelle de la timeline via `requestAnimationFrame`, indépendamment du débit réel de décodage.
- Migrer les thumbnails et previews vidéo vers les APIs de frames Mediabunny.
- Produire les waveforms progressivement depuis les buffers audio au lieu de concaténer un long fichier en mémoire.
- Afficher le background ambiant vidéo à partir d'un poster décodé dans un canvas, conformément à son comportement actuellement inerte.

## Accès fichier Electron

- Étendre `project-media://` pour prendre en charge une seule plage `bytes` par requête.
- Retourner correctement `206`, `Content-Range`, `Content-Length` et `Accept-Ranges`.
- Retourner `416` pour une plage invalide ou multiple.
- Compléter les MIME types vidéo et audio utilisés par l'éditeur.
- Continuer à valider que chaque fichier résolu appartient à la racine projet.
- Ne jamais exposer de chemin arbitraire, `FilePathSource`, API Node ou accès filesystem au renderer.

## Erreurs et observabilité

- Présenter des états distincts pour chargement, média absent, conteneur invalide, codec non supporté et échec de décodage.
- Ne jamais remplacer silencieusement une piste indisponible par du contenu fabriqué ou un fallback HTML.
- Collecter en développement : latence de seek, frames décodées/affichées/perdues, demandes obsolètes, taille des queues/caches, dérive audio et compteurs de disposal.
- Ne jamais journaliser les chemins complets ou le contenu des médias utilisateur.

## Gates d'acceptation

### Fonctionnel

- Lecture, pause, reprise, seek et scrub frame-accurate pour MP4 H.264/AAC, WebM VP8/Opus, WebM VP9/Opus, MOV H.264/AAC et MKV VP9/Opus.
- HEVC et AV1 produisent soit une lecture valide, soit un état `unsupported` explicite selon le matériel.
- Parité du rendu pour crop, rotation, pixel aspect ratio, mirroring, backgrounds, webcam enregistrée, curseur et zoom.
- Deux clips superposés issus du même asset peuvent afficher des source-times différents.
- Export MP4 et WebM sans `HTMLVideoElement` ni fallback vidéo.

### Performance 1080p60

- Moins de 1 % de frames perdues sur cinq minutes après warm-up.
- Sur 100 seeks rapides, p95 `seek -> frame` inférieur ou égal à 150 ms.
- Après la fin d'un scrub, la dernière frame demandée apparaît en moins de 150 ms.
- Dérive audio/vidéo inférieure ou égale à 20 ms sur dix minutes.
- Aucun fichier complet chargé en `Blob` ou `ArrayBuffer` pour le playback.

Ces mesures s'appliquent à un fichier local sur SSD, dans Electron avec accélération matérielle disponible, sur une fixture 1080p60 décodable par la machine de test. Les caractéristiques du matériel doivent être consignées dans la PR.

### Mémoire et lifecycle

- Après vingt cycles ouverture/seek/fermeture, la mémoire revient à plus ou moins 10 % de la baseline stabilisée.
- Aucun `Input`, sink, worker, `VideoFrame` ou `ImageBitmap` ne reste actif après disposal.
- Les caches et queues respectent leurs limites même pendant un scrub rapide ou avec plusieurs clips actifs.

### Sécurité et qualité

- Tests des ranges début/fin/suffixe, des ranges invalides, du traversal encodé et des fichiers hors projet.
- Aucun usage production de `<video>`, `HTMLVideoElement` ou `createElement('video')` dans le video editor ou l'export.
- Aucun import direct de `mediabunny` hors de `src/media` pour le périmètre migré.
- Fichiers de production sous 500 lignes, types dédiés et couverture ciblée supérieure ou égale à 90 %.

## Livraison

- Une seule PR finale depuis `rework/mediabunny` vers `master`.
- Commits séparés par couche : shared/input, playback, export/intégration, tests/gates.
- Titre prévu : `refactor(media): unify editor playback and export on Mediabunny`.
- La PR est ouverte en draft après revue du diff et réussite des validations automatisées.
- La description contient les changements, la motivation, l'impact utilisateur, les validations, la matrice de formats et les résultats de performance.

## Sources techniques

- [Exemple officiel de media player](https://mediabunny.dev/examples/media-player/)
- [Media sinks](https://mediabunny.dev/guide/media-sinks)
- [CanvasSink](https://mediabunny.dev/api/CanvasSink)
- [UrlSource](https://mediabunny.dev/api/UrlSource)
- [Formats et codecs supportés](https://mediabunny.dev/guide/supported-formats-and-codecs)
- [Packets et samples](https://mediabunny.dev/guide/packets-and-samples)
