# Beam : plan du prototype média entièrement natif

Statut au 21 septembre 2026 : plan d'implémentation. Seule `beam-media-core` et son raccordement initial à `capture` existent ; aucune des captures micro/caméra ni aucun writer GStreamer décrits ci-dessous ne sont encore livrés.

## 1. Résultat attendu et limites du premier goal

Un programme Rust sans UI démarre une webcam, un micro et l'audio système, enregistre trois pistes séparées, publie chaque nouvelle image caméra sur une texture utilisable par un `wgpu::Device` et une `wgpu::Queue` fournis par l'appelant, puis écrit un manifeste horodaté. Il doit terminer proprement si une source est débranchée, qu'une permission est refusée, que l'encodeur manque ou que le disque échoue. La même API doit être exercée sur Linux, macOS et Windows avant de remplacer les sidecars Chromium ou de reprendre la capture d'écran.

La cible est une timeline commune *mesurable*. Plusieurs périphériques ont des horloges physiques qui dérivent ; aucune `SessionClock` ne peut garantir à elle seule « jamais de décalage ». Le prototype conserve les positions d'échantillons, les timestamps natifs et leurs ancres, mesure les écarts, et laisse une correction explicite au muxage/export quand elle est nécessaire.

Hors du premier goal : ARGUI, refonte de l'écran, export final du Studio, effets webcam, accélération GPU universelle et remplacement d'Electron. X11 ne modifie pas le choix micro/caméra sous Linux ; il deviendra pertinent pour la fenêtre et la capture d'écran. Le test Linux doit couvrir X11 et Wayland lorsque les deux sessions sont disponibles.

## 2. Constat dans Beam et dans les sources étudiées

- Beam possède déjà `packages/capture`, une horloge/start gate, un modèle de pistes et un manifeste v2. Son audio système Linux utilise PipeWire ; webcam et micro passent encore par Chromium. Les chemins écran macOS/Windows encodent actuellement dans leurs backends. Le prototype natif doit donc s'intégrer au schéma existant sans le dupliquer.
- [Cap sépare sa caméra en façade et modules Linux/macOS/Windows](https://github.com/CapSoftware/Cap/blob/main/crates/camera/src/lib.rs), emploie des formats/timestamps natifs et [rattache des horloges audio à la timeline](https://github.com/CapSoftware/Cap/blob/main/crates/timestamp/src/lib.rs). Son [aperçu macOS importe des plans IOSurface/Metal dans wgpu](https://github.com/CapSoftware/Cap/blob/main/apps/desktop/src-tauri/src/camera_native.rs). Nous reprenons ces *idées*, sans crate, fork, code ou binaire Cap. Cap utilise par ailleurs des forks de CPAL et FFmpeg : aucune dépendance de ce type n'entre dans Beam.
- [Nokhwa 0.10.11 `frame_texture`](https://github.com/l1npengtul/nokhwa/blob/0.10.11/nokhwa-core/src/traits.rs#L164-L214) décode en RGBA sur CPU puis crée une texture à chaque frame. Cela peut servir de comparaison, pas de contrat principal pour l'aperçu à allocations bornées.
- [CPAL 0.18.2](https://github.com/RustAudio/cpal) offre micro sur les trois OS et loopback de sortie sur [Windows](https://github.com/RustAudio/cpal/blob/v0.18.2/src/host/wasapi/mod.rs#L18-L22). Il possède aussi un [chemin loopback macOS à base de Core Audio taps](https://github.com/RustAudio/cpal/blob/v0.18.2/src/host/coreaudio/macos/loopback.rs). Ce dernier doit être testé sur de vrais périphériques, notamment ceux qui annoncent entrée et sortie ; [son choix de voie dépend de `supports_input()`](https://github.com/RustAudio/cpal/blob/v0.18.2/src/host/coreaudio/macos/device.rs). Un tap Core Audio Beam direct serait la solution de remplacement locale si les mesures échouent. Apple exige macOS 14.2+ et `NSAudioCaptureUsageDescription` pour [les taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps).
- Côté caméra, le premier chemin ciblé est [V4L2 mmap](https://cdn.kernel.org/doc/html/latest/userspace-api/media/v4l/mmap.html), [AVCaptureVideoDataOutput](https://developer.apple.com/documentation/avfoundation/avcapturevideodataoutput) et [Media Foundation Source Reader](https://learn.microsoft.com/en-us/windows/win32/medfound/processing-media-data-with-the-source-reader). La conservation trop longue d'un buffer caméra macOS peut bloquer le pool natif : les files doivent être petites et la propriété du buffer explicite.

## 3. Décision GStreamer et licences

**GStreamer est le choix principal, avec `gstreamer-rs`, pour l'encodage et le muxage.** La capture reste dans les crates natives : elle peut alimenter à la fois l'encodeur et wgpu sans dépendre d'un plugin de découverte/capture propre à chaque OS. Les `appsrc` reçoivent des buffers avec PTS et durée calculés depuis la session ; [l'horodatage à l'arrivée dans `appsrc` ne remplace pas le temps de capture](https://gstreamer.freedesktop.org/documentation/application-development/advanced/pipeline-manipulation.html).

Premier format mesurable et simple à distribuer : caméra `VP8/WebM` (`videoconvert ! vp8enc ! webmmux`), micro et système `PCM/WAV` (`audioconvert ! wavenc`). Trois fichiers restent séparés, avec leurs ancres dans le manifeste. WAV facilite la mesure des échantillons sans délai de codec audio ; Opus est candidat après le gate de synchronisation. Ce profil n'est pas le choix de codec final du produit. [GStreamer documente `vp8enc` + `webmmux`](https://gstreamer.freedesktop.org/documentation/vpx/vp8enc.html) ; les plugins `appsrc`, `vp8enc`, `webmmux` et `wavenc` sont présents dans le runtime Fedora observé ici, mais doivent être vérifiés dans les bundles macOS/Windows.

Le bundle privé dynamique est accepté : bibliothèques, seuls plugins autorisés, dépendances natives, registre/plugin scanner si requis, licences, notices et sources correspondantes. [GStreamer décrit ce mode de déploiement](https://gstreamer.freedesktop.org/documentation/deploying/index.html). Les bindings Rust sont MIT/Apache ; le runtime est LGPL et les licences effectives des plugins doivent être contrôlées (`gst-inspect-1.0`). Exclure `gst-libav`, `x264enc` et les ensembles « GPL/nonfree » du bundle initial. GStreamer ne fait pas disparaître les obligations d'un codec ou d'un plugin. [FFmpeg est LGPL dans sa configuration de base, avec des options qui changent le régime de licence](https://www.ffmpeg.org/legal.html) : son usage dans le nouveau pipeline reste un recours uniquement après un échec matériel ou de packaging documenté de GStreamer. Cela ne supprime pas l'usage FFmpeg de l'enregistreur écran actuel pendant la transition.

Les licences du logiciel et la vente sont deux décisions distinctes. [Beam est MIT](../LICENSE) ; [Cap est majoritairement AGPLv3, avec certaines familles caméra MIT](https://github.com/CapSoftware/Cap#license). La commercialisation future ne demande aucun code Cap. Un changement éventuel de licence Beam est une décision produit séparée, à traiter avec les droits des contributeurs.

## 4. Graphe des crates et contrats

```text
beam-media-core ───────────────┬──> beam-audio ─────────┐
                               ├──> beam-camera ────────┤
                               └──> beam-media-encode ──┤
beam-media-manifest ────────────────────────────────────┤
beam-camera ──> beam-camera-wgpu                         ├──> beam-media-session
                                                        │            │
beam-camera-wgpu + beam-media-session ───────────────────┘            └──> beam-media-probe

capture existant ──> beam-media-core, beam-media-manifest ; après les gates,
                    capture ──> beam-media-session et les nouveaux backends.
```

| Crate | API publique visée | Ce qu'elle possède | Ce qu'elle ne possède pas |
| --- | --- | --- | --- |
| `beam-media-core` **existe** | `SessionClock`, `NativeTimestampMapper`, `AudioSampleClock`, `VideoFrame<T>`, `AudioPacket<T>`, aperçu dernière frame | Temps et contrats sans I/O | OS, GStreamer, wgpu |
| `beam-media-manifest` | Modèles v2, `ManifestWriter`, écriture atomique, lecture/validation | Schéma de session et fichiers de métadonnées | Capture/encodeur |
| `beam-audio` | `list_inputs`, `open_microphone`, `open_system_audio`, `stop`, événements d'état | Flux PCM horodatés, autorisations et métriques | Écriture disque, GStreamer |
| `beam-camera` | `list_cameras`, `formats`, `open`, `stop`, frames natives | Périphérique, format et durée de vie des buffers | Texture, encodeur, manifeste |
| `beam-camera-wgpu` | `CameraPreview::update(&Device, &Queue)` donnant vue/PTS/dimensions | Texture réutilisée, conversion ou import GPU | Capture périphérique, muxage |
| `beam-media-encode` | `open_track`, `push_video/audio`, `finish_track` | GStreamer, files bornées, EOS, fichiers partiels | Permissions, choix des sources |
| `beam-media-session` | `prepare`, `start`, `stop -> SessionManifest`, événements | Start gate, orchestration, reprise/échec indépendant des pistes | UI, API Electron |
| `beam-media-probe` | CLI `devices`, `record`, `report` | Scénario matériel, métriques, Device wgpu pour le test | Code produit réutilisable |

Les types CPAL, `gst::*` et V4L2/AVFoundation/Media Foundation restent privés aux crates adaptées. La seule dépendance GPU publique est `wgpu` dans `beam-camera-wgpu` : sa version devra coïncider avec celle qu'utilisera ARGUI. Une première texture avec un upload CPU borné satisfait « disponible en wgpu en temps réel » ; l'import IOSurface/D3D11/DMA-BUF n'est ajouté que s'il améliore la mesure sans complexifier la durée de vie des buffers.

Pour préserver le manifeste v2 existant, déplacer d'abord ses IDs, pistes, permissions, modèle, `SessionLayout`, écriture atomique et writer de `capture` vers `beam-media-manifest`, puis les réexporter depuis `capture` le temps de migrer les appels existants. La récupération spécifique aux fichiers curseur reste dans `capture` jusqu'à son propre refactor. Le prototype réutilise ce manifeste pour les pistes et écrit un `measurements.json` propre au banc d'essai pour les ancres détaillées. Une évolution du schéma produit n'est décidée qu'après les essais, avec tests de lecture des anciennes sessions.

Arborescence obligatoire pour les backends matériels :

```text
packages/audio/src/{lib.rs,linux/,macos/,windows/}
packages/camera/src/{lib.rs,linux/,macos/,windows/}
packages/camera-wgpu/src/{lib.rs,upload.rs,macos/,windows/,linux/}  # dossiers créés quand un chemin natif existe
packages/*/test/{lib.rs,linux/,macos/,windows/}              # miroir des chemins de src/
packages/*/test/hardware/                                   # tests matériels conditionnels par OS
```

Les dossiers d'OS contiennent uniquement du code réel ; pas de stubs ni de fallback silencieux. Les fichiers de production restent sous 500 lignes. Le point d'entrée UI futur ne reçoit que des états/événements typés et une vue de texture ; le domaine de capture demeure en Rust.

## 5. `Cargo.toml` proposés

Les versions ci-dessous sont des **candidats vérifiés dans le registre le 21 septembre 2026**, pas des dépendances déjà ajoutées. `cpal 0.18.2` demande Rust 1.85, `wgpu 30.0.1` Rust 1.87 et la branche stable `gstreamer-rs 0.25` Rust 1.92. L'accord pour relever le MSRV de Beam est acquis : passer les crates concernées à Rust 1.92 avant d'intégrer GStreamer, puis valider le lockfile et ses dépendances transitives sur cette version. Le runtime GStreamer choisi pour les bundles doit être au moins 1.24 ; figer la même version mineure et les mêmes plugins sur les trois OS à l'étape packaging.

Racine, quand toutes les crates seront créées :

```toml
[workspace]
members = [
  "packages/capture", "packages/media-core", "packages/media-manifest",
  "packages/audio", "packages/camera", "packages/camera-wgpu",
  "packages/media-encode", "packages/media-session", "packages/media-probe",
]
resolver = "2"
```

Toutes les nouvelles crates gardent `edition = "2024"`, `publish = false` et les lints Rust/Clippy du dépôt. Leur `rust-version` passe à `1.92` avec l'intégration de GStreamer ; le socle déjà créé reste à `1.88` jusqu'à ce gate. Ne déclarer les dépendances conditionnelles que lorsque leur backend est implémenté.

### `beam-media-core` : `packages/media-core/Cargo.toml`

```toml
[dependencies]
# Aucune : horloge et types std seulement.
```

### `beam-media-manifest` : `packages/media-manifest/Cargo.toml`

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["serde", "v7"] }
time = { version = "0.3", features = ["formatting"] }
thiserror = "2"

[dev-dependencies]
tempfile = "3"
```

Le déplacement du modèle peut supprimer certaines dépendances proposées si elles restent inutiles ; le code existant tranchera. `capture` remplacera ses définitions locales par cette crate, sans cycle de dépendance.

### `beam-audio` : `packages/audio/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
cpal = "=0.18.2"
crossbeam-channel = "0.5"
thiserror = "2"

[target.'cfg(target_os = "linux")'.dependencies]
pipewire = { version = "=0.10.0", features = ["v0_3_65"] }
```

Linux réutilise puis extrait le backend PipeWire système de `capture`. CPAL est tenté pour le micro sur Linux/macOS/Windows et pour le loopback macOS/Windows. Si le gate Mac révèle un défaut du loopback CPAL, ajouter **seulement alors** `objc2-core-audio = "0.3.2"` et `objc2-foundation = "0.3.2"` sous `cfg(target_os = "macos")` pour un tap Beam direct. [ScreenCaptureKit audio](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos) reste une seconde option mesurée, avec une permission et un couplage à la capture écran différents.

### `beam-camera` : `packages/camera/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
crossbeam-channel = "0.5"
thiserror = "2"

[target.'cfg(target_os = "linux")'.dependencies]
v4l = "=0.14.0"

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6.4"
objc2-av-foundation = "0.3.2"
objc2-core-media = "0.3.2"
objc2-core-video = "0.3.2"
objc2-foundation = "0.3.2"

[target.'cfg(windows)'.dependencies]
windows = { version = "0.62", features = [
  "Win32_Foundation", "Win32_System_Com", "Win32_Media_MediaFoundation",
] }
```

Media Foundation est le premier backend Windows. Ajouter `Win32_Media_DirectShow` uniquement si un test sur un appareil réel démontre son besoin. Tester NV12/YUYV/BGRA et MJPEG ; la crate expose le format natif au lieu de convertir toute frame en RGBA. Le décodage MJPEG éventuel pour l'aperçu est décidé après l'inventaire des caméras du banc d'essai.

### `beam-camera-wgpu` : `packages/camera-wgpu/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
beam-camera = { path = "../camera" }
wgpu = "=30.0.1"
thiserror = "2"
```

`wgpu` n'apparaît pas dans `beam-camera` ou `beam-audio`. Le prototype crée un `Device` dans son binaire, mais la crate reçoit toujours celui de l'appelant. Des dépendances `objc2-metal`/IOSurface, D3D11 ou DMA-BUF sont réservées au gate d'import natif après mesure. Le `wgpu` 30 choisi pour le prototype devra être aligné avec ARGUI avant le branchement UI.

### `beam-media-encode` : `packages/media-encode/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
gst = { package = "gstreamer", version = "0.25", features = ["v1_24"] }
gst_app = { package = "gstreamer-app", version = "0.25", features = ["v1_24"] }
gst_audio = { package = "gstreamer-audio", version = "0.25", features = ["v1_24"] }
gst_video = { package = "gstreamer-video", version = "0.25", features = ["v1_24"] }
crossbeam-channel = "0.5"
thiserror = "2"
```

Garder `gst_audio` et `gst_video` uniquement si leurs types de format/caps sont utilisés dans le writer réel. Une implémentation FFmpeg de remplacement, si elle devient nécessaire, doit rester derrière cette frontière et passer le même banc de PTS/EOS/manifest ; elle n'est pas ajoutée au graphe aujourd'hui.

### `beam-media-session` : `packages/media-session/Cargo.toml`

```toml
[dependencies]
beam-media-core = { path = "../media-core" }
beam-media-manifest = { path = "../media-manifest" }
beam-audio = { path = "../audio" }
beam-camera = { path = "../camera" }
beam-media-encode = { path = "../media-encode" }
crossbeam-channel = "0.5"
thiserror = "2"
```

### `beam-media-probe` : `packages/media-probe/Cargo.toml`

```toml
[dependencies]
beam-media-session = { path = "../media-session" }
beam-camera-wgpu = { path = "../camera-wgpu" }
wgpu = "=30.0.1"
pollster = "0.4"
serde_json = "1"
```

Le binaire parse une petite liste d'arguments sans framework CLI tant que trois commandes suffisent. Il expose `--camera`, `--microphone`, `--system-output`, `--duration`, `--output` et produit `manifest.json`, `measurements.json`, `camera.webm`, `microphone.wav`, `system-audio.wav`. Il ne crée pas de fausses données lorsqu'une source manque.

### `capture` existant, au moment de l'intégration

```toml
[dependencies]
beam-media-core = { path = "../media-core" }       # déjà présent
beam-media-manifest = { path = "../media-manifest" } # après extraction v2
beam-media-session = { path = "../media-session" }   # après G6
```

`capture` ne dépend directement ni de CPAL, ni de GStreamer, ni de wgpu pour ces nouveaux flux. Supprimer ses anciennes implémentations seulement lorsque les sessions existantes et le protocole de l'engine passent leurs tests de compatibilité.

## 6. Flux, horloges et comportement d'échec

```text
backend OS -> frame/paquet + timestamp natif -> ancre SessionClock -> PTS ns
                                                   ├─> file bornée encodeur -> appsrc -> piste
                                                   └─> dernière frame caméra -> texture wgpu
```

1. `prepare` découvre et vérifie les trois sources et plugins, réserve les fichiers `.part`, crée la clock, puis les streams ; `start` ouvre simultanément le start gate. Une piste absente ou refusée apparaît comme telle dans le manifeste. Le programme ne crée pas de piste vide qui ressemble à une capture réussie.
2. Un adaptateur d'horloge par source traduit les timestamps du périphérique vers `session_ns`. CPAL fournit `capture` et `callback` ; utiliser `capture` lorsque vérifié. Le compteur d'échantillons fixe les frontières successives des paquets audio. Enregistrer les ancres et discontinuités pour distinguer latence fixe et dérive progressive.
3. Les callbacks matériels ne bloquent ni sur le GPU, ni sur le disque, ni sur GStreamer. Chaque transfert a une capacité explicite en frames **et en octets** ; un plein provoque un événement et des métriques. L'aperçu remplace son ancienne frame. L'enregistrement ne suit pas la cadence de l'UI.
4. `appsrc` annonce `is-live=true`, `format=time`, des caps exactes et des PTS issus de la session. Une file et un worker par piste isolent les encodeurs. `stop` ferme les producteurs, pousse EOS, attend le bus/les fichiers, `fsync` et renomme les `.part`, puis finalise le manifeste. Erreur d'EOS, fichier ou plugin : état `failed`/`interrupted` avec chemin et cause, jamais `completed`.
5. La texture wgpu est recréée seulement si dimensions/format changent ; la conversion YUV->RGB par shader et la réutilisation des buffers sont privilégiées. La première implémentation peut copier les plans natifs vers le GPU. Les options IOSurface/Metal, D3D11 et DMA-BUF ne sont retenues que si la latence, les copies et la mémoire le justifient sur chaque OS.

## 7. Checklist et gates de livraison

### G0 — Socle et frontières

- [x] Lire `docs/UI.md`, `docs/ARCHITECTURE.md`, `docs/CODE_QUALITY.md` ; étudier Cap sans reprendre ses crates ou son code.
- [x] Créer `beam-media-core`, raccorder l'horloge et le mapper existants ; tests et Clippy ciblés Linux réussis.
- [ ] Relever les versions minimales macOS/Windows et les distributions Linux réellement visées par Beam ; le tap Core Audio impose au moins macOS 14.2.
- [ ] Fixer les états de piste, erreurs, événements et ownership des buffers dans une revue d'API d'une page.
- [ ] Extraire le manifeste v2 et l'écriture atomique de `capture` vers `beam-media-manifest`, avec tests de lecture d'anciennes sessions et de reprise d'écriture interrompue.

**Gate :** mêmes JSON v2 avant/après extraction, aucun cycle Cargo, tous les fichiers source <500 lignes.

### G1 — Writer GStreamer avant les périphériques

- [ ] Relever le MSRV à Rust 1.92, installer les SDK GStreamer/ALSA et compiler `gstreamer-rs 0.25` sur les trois OS.
- [ ] Implémenter trois `appsrc` avec données synthétiques déterministes, PTS/durées, EOS et fichiers `.part`.
- [ ] Vérifier `camera.webm` VP8 et deux WAV par lecture indépendante ; tester timestamps non monotones, file pleine, plugin absent, disque plein et arrêt pendant l'initialisation.
- [ ] Inventorier les bibliothèques/plugins du bundle et leurs licences ; exclure `gst-libav` et les plugins GPL du profil initial.

**Gate :** PTS caméra monotones, nombres d'échantillons WAV exacts, erreurs attribuées à la bonne piste, ressources libérées après arrêt.

### G2 — Deux captures audio

- [ ] CPAL micro : découverte, sélection, F32/I16, permission, timestamp, débranchement et changement de périphérique sur chaque OS.
- [ ] Extraire l'audio système PipeWire Linux existant, en conservant ses tests et son comportement de récupération.
- [ ] CPAL WASAPI loopback Windows : sélectionner le périphérique de sortie, tester silence, haut-parleurs USB/Bluetooth et changement de sortie.
- [ ] CPAL Core Audio tap macOS : tester sortie simple et périphérique duplex, permission, arrêt/redémarrage, sortie Bluetooth et absence de modification audible du format de sortie ; si ce gate échoue, implémenter le tap Core Audio directement dans `src/macos/` et mesurer ScreenCaptureKit en comparaison.
- [ ] Enregistrer les positions d'échantillons et les ancres ; deux WAV réellement distincts, y compris quand seul l'un des flux échoue.

**Gate :** micro et audio système audibles dans leurs pistes respectives, aucun blocage de callback, horodatages et pertes observables.

### G3 — Webcam native

- [ ] Linux V4L2 mmap ; macOS AVFoundation ; Windows Media Foundation, chacun dans son dossier OS.
- [ ] Découverte stable, négociation résolution/fps/format, permissions, frames timestampées et arrêt/déconnexion.
- [ ] Mesurer YUYV/NV12/BGRA/MJPEG sur au moins une caméra intégrée et une USB ; n'ajouter DirectShow ou un décodeur MJPEG supplémentaire que pour un appareil démontré.
- [ ] Envoyer la même capture vers la file d'enregistrement et la boîte « dernière frame » de l'aperçu, sans garder les buffers natifs trop longtemps.

**Gate :** une seule ouverture du périphérique, frames réelles et monotonie contrôlée, aucune rétention non bornée.

### G4 — Texture wgpu sur Device appelant

- [ ] Créer l'aperçu avec Device/Queue fournis, texture réutilisée et PTS associé ; gérer redimensionnement, arrêt et destruction du Device.
- [ ] Mesurer fps, latence, copies CPU, octets alloués par frame et mémoire GPU ; comparer upload réutilisé et import natif seulement si utile.
- [ ] Vérifier que ralentir l'appelant wgpu ne réduit pas le débit de la piste enregistrée.

**Gate :** preview temps réel pendant l'enregistrement, sans allocation de texture par frame à format constant.

### G5 — Session complète sans UI

- [ ] Relier les trois sources, les trois writers, le start gate et le manifeste via `beam-media-session`.
- [ ] CLI `beam-media-probe` avec `devices`, `record`, `report` ; produire les cinq artefacts annoncés.
- [ ] Tester arrêt normal, arrêt forcé, permission refusée, source manquante, hot-unplug, disque plein et sortie qui change.
- [ ] Mesurer avec un clap ou signal de référence pour distinguer offset initial et dérive ; conserver les données brutes de mesure.

**Gate :** trois pistes lisibles, états/erreurs fidèles au manifeste, offsets et dérive rapportés sans valeur inventée.

### G6 — Compatibilité, bundle et performance

- [ ] Exécuter le même scénario 5 puis 30 minutes sur macOS, Windows et Linux X11/Wayland ; au moins une caméra USB et les cas de sortie audio ci-dessus.
- [ ] Publier dans le rapport RSS de tout l'arbre de processus, CPU, mémoire GPU, cadence acquise/encodée/affichée, profondeur des files, drops, latence preview, offset initial et pente de dérive.
- [ ] Comparer au Beam Electron actuel sous la même résolution, durée et matériel ; vérifier que la mémoire se stabilise après démarrage et que les fichiers restent récupérables après erreur.
- [ ] Bundler la même version de GStreamer et l'allowlist de plugins sur les trois OS ; tester des machines propres sans GStreamer préinstallé, licences/notices incluses.
- [ ] Si GStreamer échoue sur un gate bloquant, écrire les mesures, examiner le packaging ou le plugin en cause, puis seulement évaluer un backend FFmpeg LGPL isolé dans `beam-media-encode`.

**Gate :** compilation et essai matériel sur chaque OS, aucune dérive croissante non expliquée, mémoire bornée, bundle autonome et inventaire de licences revu. Les seuils chiffrés de latence et de RSS seront fixés après la mesure de référence, avant les optimisations.

Avant de déclarer ce goal terminé, migrer les tests Rust existants vers le miroir `test/`, enregistrer les cibles `[[test]]`, puis exécuter Nextest et les gates stricts : au moins 85 % de couverture des lignes source du workspace et de chaque crate, y compris les chemins d'erreur. Utiliser le `target-dir` partagé configuré, sans créer de répertoire de build dans la worktree.

### G7 — Intégration produit ultérieure

- [ ] Brancher les APIs du prototype à l'engine Rust, retirer les sidecars Chromium correspondants et migrer le modèle/éditeur sans perdre la lecture des anciennes sessions.
- [ ] Reprendre ensuite seulement la capture écran pour donner ses frames au même temps/encodeur ; les chemins écran actuels peuvent rester en service jusqu'à leur gate.
- [ ] Brancher ARGUI sur les commandes/états et la texture wgpu, sans déplacer la logique média dans l'UI.
- [ ] Mettre à jour `docs/ARCHITECTURE.md`, les tests d'intégration et `CHANGELOG.md` au moment du changement utilisateur réel.

Ce plan est documentaire : il n'ajoute aujourd'hui aucune dépendance Cargo au-delà de `beam-media-core`. Sur la machine Linux actuelle, le runtime GStreamer 1.28.7 et les plugins du profil initial sont présents, mais les fichiers de développement `gstreamer-1.0.pc`, `gstreamer-app-1.0.pc` et `alsa.pc` manquent. Les gates matériels macOS/Windows ne peuvent pas être déclarés réussis depuis Linux.
