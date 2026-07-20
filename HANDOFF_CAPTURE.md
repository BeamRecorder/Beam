# Handoff — moteur natif `packages/capture`

Dernière mise à jour : 20 juillet 2026  
Branche/commit observé : `bb1a7a3` (`add all rust things`)  
Document de référence : [`plan.md.txt`](plan.md.txt)

## 1. But du handoff

Ce document décrit l'état réel du moteur Rust, les parties déjà fonctionnelles, les défauts connus et l'ordre recommandé pour terminer intégralement le plan, avec une priorité forte sur Windows et macOS.

Ne considérer le plan comme terminé qu'après avoir validé chaque exigence de `plan.md.txt` sur les OS réels. Une compilation croisée ne remplace pas un test matériel macOS ou Windows.

## 2. État du dépôt

Le workspace Rust et le frontend sont maintenant réunis dans le même dépôt Git :

```text
Cargo.toml
Cargo.lock
plan.md.txt
.github/workflows/capture.yml
packages/capture/
demo-recorder frontend files...
```

Le moteur se trouve dans `packages/capture`. Les modifications utilisateur actuelles de `plan.md.txt` et `pormpt_ui.txt` ne doivent pas être écrasées.

Les commandes suivantes passent au moment de ce handoff :

```bash
cargo fmt --all --check
cargo test -p capture \
  --no-default-features \
  --features recording \
  --target-dir /tmp/demo-recorder-handoff-target
```

Les anciens médias de smoke ne sont plus présents dans `packages/capture/full-smoke-regions`; les validations matérielles citées ci-dessous doivent donc être reproduites pour constituer une preuve durable.

## 3. Ce qui est implémenté

### Modèle, protocole et stockage

- Identifiants UUID v7 typés pour projets, sessions, pistes et segments.
- Modèles sérialisables pour sources, capacités, permissions, requêtes, pistes, événements et manifestes.
- Validation d'une requête contre un snapshot de catalogue récent.
- Protocole JSONL pour `capture-engine`; stdout est réservé aux réponses structurées.
- `capture-probe` pour la découverte et `capture-smoke` pour les essais matériels.
- Création du layout explicite `project-<project-uuid>/session-<session-uuid>/` et des répertoires de pistes.
- `manifest.partial.json`, finalisation atomique vers `manifest.json`, `track.json`, `timing.jsonl` et `health.jsonl`.
- Suppression/récupération d'un fichier temporaire atomique obsolète.
- Vérification de l'espace disque avant la préparation.
- Pause/reprise par nouveaux segments, sans réécriture des segments précédents.
- Finalisation best-effort et comportement conditionné par `FailurePolicy`.

### API Electron/frontend

- `electron-main.cjs` supervise un unique processus `capture-engine` et corrèle les requêtes JSONL.
- `electron-preload.cjs` expose une surface restreinte avec isolation de contexte, sans accès Node dans le renderer.
- `src/capture-api.ts` fournit le contrat TypeScript public `window.capture`.
- `capture.start(config)` enchaîne préparation et démarrage en un seul appel frontend; le contrôle séparé `prepare`, `start`, `pause`, `resume`, `stop` et `status` reste disponible.
- Les méthodes de découverte `discover`, `capabilities`, `permissions` et `formats` sont exposées par la même façade.
- Le packaging construit et embarque `capture-engine`; `DEMO_RECORDER_CAPTURE_ENGINE` permet de choisir un binaire en développement.
- Le processus est fermé proprement à la sortie et les requêtes pendantes reçoivent les erreurs, sorties inattendues et timeouts du moteur.

L'utilisation complète et un exemple de configuration figurent dans [`README.md`](README.md).

Fichiers centraux :

- `packages/capture/src/session/recording.rs`
- `packages/capture/src/session/recording_active.rs`
- `packages/capture/src/session/recording_support.rs`
- `packages/capture/src/storage/`
- `packages/capture/src/protocol/`

### Windows

Implémenté :

- Découverte des écrans et fenêtres avec Windows Graphics Capture.
- IDs de fenêtres basés sur le HWND, plus stables que le titre.
- Enregistrement écran/fenêtre H.264 MP4 via `windows-capture`.
- Masquage du curseur dans la vidéo lorsque la piste séparée est demandée.
- Découverte des sorties audio et capture WASAPI loopback dans un WAV séparé.
- Découverte et capture microphone via CPAL dans un WAV séparé.
- Découverte des caméras et de leurs formats via Nokhwa/Media Foundation.
- Capture caméra vers un MP4 H.264 indépendant.
- Échantillonnage du curseur Win32, clics, visibilité, formes PNG dédupliquées et coordonnées relatives à la source.
- Gestion des écrans à origine négative et des régions de fenêtres.
- Session multipiste réelle, pause/reprise et manifeste final.

Backends :

- `packages/capture/src/screen/win/`
- `packages/capture/src/audio/system/win/`
- `packages/capture/src/cursor/win/`
- `packages/capture/src/camera/win/`

### macOS

Implémenté dans le code :

- Catalogue ScreenCaptureKit pour écrans, fenêtres et applications.
- Détection de l'écran principal.
- États de permission écran, microphone et caméra.
- Capture écran/fenêtre/application et écriture MP4 directe avec `SCRecordingOutput`.
- Capture audio système ScreenCaptureKit dans un WAV séparé avec channel borné.
- Capture microphone via CPAL.
- Curseur séparé via CoreGraphics : position, boutons, visibilité et région de source.
- Capture caméra Nokhwa dans un sidecar MP4 H.264 via `AVAssetWriter`.
- Acquisition caméra et encodage séparés par une queue bornée, avec timestamps par frame et compteurs acquis/encodés/droppés.
- Intégration de toutes ces pistes dans `RecordingSession`.

Backends :

- `packages/capture/src/screen/mac/`
- `packages/capture/src/audio/system/mac/`
- `packages/capture/src/cursor/mac/`
- `packages/capture/src/camera/mac/`

La partie ScreenCaptureKit minimale a déjà passé une compilation croisée avec :

```bash
DOCS_RS=1 cargo clippy -p capture \
  --no-default-features \
  --features screen,system-audio,cursor,recording \
  --target aarch64-apple-darwin \
  --target-dir /tmp/demo-recorder-macos-min-target \
  -- -D warnings
```

La compilation croisée de toutes les features reste insuffisante : plusieurs dépendances natives demandent Clang et le SDK Apple. Il faut compiler et tester sur un vrai Mac.

## 4. Défauts prioritaires à corriger

### P0 — Caméra Windows limitée à environ 1 FPS

État du correctif logiciel au 20 juillet 2026 :

- le format exact choisi dans `compatible_camera_formats` est maintenant conservé avant `open_stream`; le FPS rafraîchi et potentiellement corrompu par Nokhwa n'est plus utilisé pour configurer l'encodeur;
- l'acquisition et l'encodage sont séparés par un channel borné configuré avec `recording.queueCapacity`;
- la saturation incrémente les drops sans bloquer la boucle d'acquisition;
- les métriques distinguent désormais `framesAcquired` et `framesEncoded`, dans le smoke comme dans le manifeste;
- l'encodeur est armé avant que le backend caméra ne confirme son démarrage, et son thread est joint à l'arrêt, y compris après une erreur d'acquisition.

Le correctif reste à valider matériellement en 720p30 et 1080p30 sur Windows. Tant que ces smokes ne prouvent pas la cadence réelle, considérer le défaut matériel comme ouvert.

Symptômes observés lors des précédents smokes matériels :

- le catalogue annonce des formats jusqu'à 30 FPS;
- `camera.camera_format()` retourne parfois 1 FPS;
- une capture de deux secondes ne produit qu'environ une ou deux frames;
- la boucle caméra effectue acquisition, conversion RGBA/BGRA et encodage de façon synchrone.

Le code concerné est `packages/capture/src/camera/win/capture.rs` :

- négociation du format dans `open_camera`;
- FPS donné à `VideoSettingsBuilder` depuis `format.frame_rate()`;
- `write_frame_to_buffer`, conversion CPU et `send_frame_buffer` dans la même boucle.

Une anomalie a été identifiée dans `nokhwa-bindings-windows 0.4.6` : son rafraîchissement du format traite incorrectement la valeur Media Foundation packée de `MF_MT_FRAME_RATE`, ce qui peut exposer `1` au lieu du numérateur réel `30`.

Plan de correction recommandé :

1. Ajouter temporairement deux métriques distinctes : frames acquises et frames encodées.
2. Tester l'acquisition brute sans encodeur pendant cinq secondes.
3. Si l'acquisition est bien à 30 FPS, séparer producteur et encodeur par un channel borné; le callback/producteur ne doit plus encoder synchroniquement.
4. Ne pas utiliser le FPS erroné retourné après `refresh_camera_format`; conserver le format exact choisi dans la liste des formats compatibles.
5. Si Nokhwa configure réellement Media Foundation à 1 FPS, soit corriger proprement la dépendance via un fork/patch versionné, soit créer un backend Media Foundation direct sous `camera/win/`.
6. Vérifier 720p30 et 1080p30, durée, drops, arrêt et format écrit dans le manifeste.

Ne pas masquer le défaut en écrivant simplement `30` dans le manifeste : la cadence réelle doit être mesurée.

### P0 — Absence de vraie barrière de démarrage multipiste

État du correctif logiciel au 20 juillet 2026 :

- `StartGate` est un signal one-shot partagé qui transporte le même `t0` vers tous les waiters et possède un chemin d'annulation réveillant les threads armés;
- `RecordingSession::start` prépare désormais le segment et tous les backends avant de lire l'horloge, fixe ensuite `session_start_monotonic_ns`, puis libère le gate;
- écran, microphone, audio système, caméra et curseur utilisent ce même gate sous Windows et macOS;
- les writers asynchrones microphone/audio, les writers caméra et les fichiers curseur acquittent leur création avant que le backend soit considéré armé;
- les callbacks temps réel microphone et ScreenCaptureKit rejettent toute unité antérieure à la libération sans verrou dans le callback audio;
- les boucles caméra, WASAPI et curseur attendent le gate avant leur première unité et sont réveillées par l'annulation;
- un échec obligatoire pendant l'armement annule le gate avant le rollback et la jointure des backends déjà préparés;
- pause/reprise crée une nouvelle barrière par génération de segments;
- les tests prouvent que plusieurs waiters reçoivent exactement le même `t0`, qu'aucun n'est libéré avant le signal et que l'annulation les réveille.

Le sous-ensemble écran/audio système/curseur compile pour `x86_64-pc-windows-msvc` et `aarch64-apple-darwin`. Il reste obligatoire de mesurer sur les OS réels le premier timestamp natif de chaque piste, les offsets à `t0` et l'absence de thread après les scénarios d'échec matériel.

`RecordingSession::start` fixe actuellement `session_start_monotonic_ns`, puis `ActiveRecordings::open` démarre les backends l'un après l'autre. L'écran, le micro, l'audio système, la caméra et le curseur n'ont donc pas un armement commun avant `t0`.

Conséquences observées :

- une session demandée pour environ une seconde peut durer plusieurs secondes;
- les pistes commencent à des instants natifs différents mais leurs segments déclarent le même début;
- les coûts d'ouverture caméra/audio sont inclus dans la durée de session;
- `StartBarrier` et `PreparedTrack` existent, mais ne pilotent pas les backends natifs de `RecordingSession`.

Correction attendue :

1. Séparer chaque backend en `prepare/arm`, `start(t0)` et `stop`.
2. Créer les fichiers/writers avant `t0`.
3. Attendre l'acquittement d'armement de toutes les pistes obligatoires.
4. Annuler et joindre tous les threads si une piste obligatoire échoue avant `t0`.
5. Fixer `t0` seulement quand tous les backends sont prêts.
6. Déclencher les captures avec un signal/barrière partagé.
7. Écrire pour chaque piste son premier timestamp natif et son offset réel par rapport à `t0`.
8. Ajouter des fakes qui prouvent qu'aucun writer/backend ne démarre avant la barrière.

Fichiers à refactorer en premier :

- `packages/capture/src/session/recording.rs`
- `packages/capture/src/session/recording_active.rs`
- `packages/capture/src/session/preparation.rs`
- `packages/capture/src/session/start_barrier.rs`
- interfaces `start` des backends natifs.

### P0 — Validation macOS réelle manquante

Le code macOS n'a pas été exécuté sur une machine Apple dans l'état actuel. À vérifier sur macOS :

- compilation de `--all-targets --all-features`;
- permissions accordées, refusées et non déterminées;
- découverte écran/fenêtre/application;
- capture MP4 lisible;
- audio système aligné avec le filtre sélectionné;
- microphone et caméra;
- curseur séparé et coordonnées Retina/multi-écrans;
- session complète et pause/reprise;
- fermeture sans thread restant.

### P1 — Compatibilité macOS 13/14

L'écriture MP4 actuelle dépend de `SCRecordingOutput`, exposé avec la feature cumulative `macos_15_0` de `screencapturekit 8.0.1`. Elle exige donc macOS 15 pour ce chemin d'enregistrement.

Le plan original vise ScreenCaptureKit à partir de macOS 13. Pour couvrir 13/14, ajouter un chemin basé sur les `CMSampleBuffer`/pixel buffers et AVAssetWriter ou VideoToolbox, sélectionné au runtime. Ne pas retirer le chemin direct macOS 15.

### P1 — Caméra macOS H.264 implémentée, validation native manquante

Le backend a été remplacé par un pipeline acquisition → queue bornée → `AVAssetWriter`. Le thread Nokhwa ne fait plus d'encodage ni d'I/O disque : il horodate la frame, incrémente `frames_acquired` et tente un envoi non bloquant. La saturation incrémente `frames_dropped`. Le writer convertit RGBA vers un `CVPixelBuffer` BGRA, encode H.264 dans MP4 et incrémente `frames_encoded`.

L'ouverture caméra et l'initialisation complète de l'asset writer précèdent l'acquittement de préparation et le `StartGate`. La session et le manifeste annoncent désormais `h264`/`.mp4`.

Restent obligatoires avant clôture :

- compiler ce chemin dans une CI/macOS native avec le SDK Apple (le cross-check Linux local est arrêté dans les build scripts C de `objc_exception`/`mozjpeg-sys`, faute de SDK et toolchain macOS);
- vérifier sur matériel que les MP4 sont lisibles et que leur durée/cadence correspond aux timestamps;
- prouver 720p30 et 1080p30, saturation comprise;
- vérifier arrêt, annulation pendant la préparation et erreur encodeur sans thread restant.

### P1 — Santé, timestamps et hot-plug incomplets

État du reporter périodique au 20 juillet 2026 :

- chaque segment actif démarre un thread `capture-health-reporter` armé sur le même `StartGate` que les pistes;
- il écrit chaque seconde un `TrackHealth` par piste active dans `health.jsonl` et une `TimingAnchor` correspondante dans `timing.jsonl`;
- les snapshots proviennent directement des métriques atomiques des backends et couvrent frames acquises/encodées/droppées, samples reçus/droppés et interruptions;
- pause et stop ferment puis joignent le reporter avant de fermer les backends, ce qui évite les écritures concurrentes pendant la finalisation;
- un test accéléré vérifie plusieurs émissions, la monotonie de `sessionNs`, la progression de la position native et la cardinalité identique santé/timing;
- la compilation croisée du reporter intégré passe pour les sous-ensembles natifs Windows et macOS.

Les événements immédiats spécialisés de hot-unplug, changement du périphérique par défaut, changement de format, perte de source, erreur encodeur et disque plein doivent encore être reliés aux notifications natives; le snapshot périodique permet déjà d'observer drops, saturation et interruptions.

Le reporter couvre désormais la périodicité. Le plan exige encore des événements natifs immédiats spécialisés pour :

- drops/discontinuités;
- dérive;
- interruption;
- hot-unplug micro/caméra;
- changement du périphérique par défaut;
- changement de format/résolution;
- perte de source;
- saturation de queue;
- erreur encodeur et disque plein.

Ajouter un reporter périodique pendant `Recording`, puis tester la fréquence et la monotonie des événements.

### P1 — Tests obligatoires incomplets

Les tests actuels couvrent une partie du modèle, du catalogue, des horloges, du curseur, du stockage, du protocole et de la session. Ils sont encore plats dans `tests/`, alors que le plan demande une hiérarchie miroir de `src/`.

Il manque notamment des tests de logique avec faux backends pour :

- annulation pendant la préparation;
- barrière native et rollback complet;
- échec piste obligatoire/optionnelle selon policy;
- wrap ou retour de timestamp;
- aucun thread après shutdown;
- writer corrompu, segment incomplet et disque plein;
- collisions ProjectId/SessionId;
- labels avec caractères spéciaux;
- JSONL curseur tronqué;
- clicks conservés pendant coalescing;
- HiDPI, hotspot, invisibilité et changement de forme sans mouvement;
- hot-unplug micro/caméra;
- perte de source et erreur encodeur;
- tous les scénarios multipistes de la phase 11.

Le smoke générique `tests/hardware/full_session_smoke.rs` existe, est `#[ignore]`, dépend de la feature `hardware-tests` et vérifie la finalisation du manifeste et des segments. La matrice de smokes spécialisés par backend et par OS reste à compléter.

### P2 — Curseur macOS

La position, les boutons et la visibilité sont présents. L'accès aux formes/hotspots n'est pas implémenté; la capability doit rester `cursor_shapes: false` tant que ce n'est pas réellement disponible. Ajouter les formes seulement si une API native fiable est retenue.

### P2 — Linux

Linux n'est pas la priorité demandée, mais le plan global contient encore un backend largement incomplet : portail XDG, PipeWire vidéo/audio, X11/XFixes, encodage et reconnexion. Ne pas déclarer le plan global terminé sans traiter ou explicitement replanifier ce périmètre avec le propriétaire.

## 5. Ordre de reprise recommandé

1. Reproduire et corriger les 1 FPS caméra Windows.
2. Refactorer les backends vers `prepare/arm/start/stop` et brancher la vraie barrière.
3. Ajouter les tests fake de barrière, rollback, policy, timestamps et fermeture.
4. Refaire un smoke Windows complet avec pause/reprise et conserver les artefacts/mesures.
5. Compiler sur un vrai Mac et corriger toutes les erreurs natives.
6. Tester chaque piste macOS isolément.
7. Remplacer la caméra `.mjpeg` par un pipeline vidéo borné et timestampé.
8. Ajouter le fallback écran macOS 13/14.
9. Ajouter événements périodiques, hot-plug et discontinuités.
10. Compléter l'arborescence et la matrice de tests de `plan.md.txt`.
11. Exécuter les scénarios multipistes longs et les gates CI sur Windows/macOS/Linux.

## 6. Commandes utiles

### Gates générales

```bash
cargo fmt --all --check
cargo check -p capture --all-targets --all-features
cargo test -p capture --all-features
cargo clippy -p capture --all-targets --all-features -- -D warnings
cargo doc -p capture --all-features --no-deps
```

### Windows depuis WSL

Utiliser un target dir Windows distinct pour éviter les verrous de fichiers :

```powershell
$env:CARGO_TARGET_DIR = 'C:\Temp\demo-recorder-capture-target'
Set-Location 'C:\Users\binos\Documents\Personal_project\OSS\DemoRecorder\demo-recorder\demo-recorder'
cargo test -p capture --all-features
cargo clippy -p capture --all-targets --all-features -- -D warnings
cargo run -p capture --bin capture-probe -- discover
cargo run -p capture --bin capture-smoke -- full --duration 10 --output capture-smoke-windows
```

### macOS réel

```bash
cargo check -p capture --all-targets --all-features
cargo test -p capture --all-features
cargo clippy -p capture --all-targets --all-features -- -D warnings
cargo run -p capture --bin capture-probe -- discover
cargo run -p capture --bin capture-smoke -- full --duration 10 --output capture-smoke-macos
```

### Tests matériels prévus

```bash
cargo test -p capture \
  --features hardware-tests \
  --test full_session_smoke \
  -- --ignored --nocapture
```

Fournir `CAPTURE_HARDWARE_CONFIG` avec le chemin d'un `CaptureRequest` JSON construit à partir des IDs retournés par `capture-probe discover`. La durée se règle avec `CAPTURE_HARDWARE_DURATION_SECONDS` (10 secondes par défaut).

## 7. Critères de preuve avant clôture

Pour Windows et macOS, conserver pour chaque validation :

- commande exacte et commit testé;
- catalogue JSON des sources/formats/capabilities;
- manifeste final;
- `track.json`, `timing.jsonl` et `health.jsonl`;
- durée demandée et durée mesurée de chaque piste;
- FPS/images reçues et perdues;
- samples audio reçus/perdus;
- résultat `ffprobe` ou lecteur équivalent pour chaque média;
- mémoire au début et à la fin des tests longs;
- résultat des scénarios pause/reprise, perte de source et hot-unplug.

Minimum matériel attendu :

| Plateforme | Validation minimale |
| --- | --- |
| Windows | écran, fenêtre, audio système, micro, caméra 720p30/1080p30, curseur séparé, toutes pistes, pause/reprise |
| macOS | écran, fenêtre, application, audio système, micro, caméra, curseur séparé, toutes pistes, pause/reprise |
| Chaque OS | 1080p60 pendant 10 min, 4K60 pendant 5 min si compatible, mémoire stable, timestamps monotones, médias lisibles |

## 8. Conditions de fin

Le travail n'est terminé que lorsque :

- toutes les lignes applicables de `plan.md.txt` ont une implémentation et une preuve;
- la caméra Windows capture réellement à la cadence négociée;
- toutes les pistes partagent une vraie barrière et un référentiel monotone documenté;
- macOS est compilé et testé sur matériel réel, y compris les versions minimales annoncées;
- les callbacks haute fréquence n'encodent pas, n'écrivent pas sur disque et ne sérialisent pas directement;
- les queues sont bornées et leurs drops/discontinuités sont observables;
- les scénarios de panne et recovery sont testés;
- les tests obligatoires et matériels existent dans l'arborescence demandée;
- `fmt`, `check`, `test`, Clippy et la documentation passent sur la CI native des trois OS.

Ne pas clôturer le plan sur la seule base d'un smoke court ou d'une compilation croisée.
