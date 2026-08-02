# Native Recorder

Ce document décrit l’architecture cible du recorder natif de Beam. Il sert de contrat avant toute implémentation : les modules, les responsabilités, les dépendances et les critères de validation doivent rester cohérents avec ce document.

## Décision en une phrase

Rust capture et écrit toutes les pistes avec une seule timeline de session. Electron ne transporte plus de média et ne fait plus de capture avec Chromium : il demande à Rust de lister les appareils, de préparer une session, puis de la démarrer, la mettre en pause ou l’arrêter.

Le mot **sidecar** désigne ici une piste séparée (`camera`, `microphone`, `system-audio`, `cursor`). Ces sidecars restent utiles, mais ils sont entièrement natifs et gérés par Rust. Les anciens sidecars Chromium/Electron doivent disparaître.

## 1. Contraintes non négociables

- Une seule `SessionClock` monotone, créée par session, est la référence de la timeline.
- Aucun timestamp de média ne vient de `Date.now()`, `performance.now()`, de l’heure UTC ou d’un appel IPC.
- Chaque producteur remet des paquets horodatés à Rust avant l’encodage et l’écriture.
- Les clocks matérielles différentes sont mesurées, mappées et disciplinées ; une clock commune ne supprime pas magiquement le drift matériel.
- Les callbacks audio/caméra/écran ne font ni I/O, ni encodage lourd, ni appel IPC. Ils déposent rapidement leurs données dans une file bornée.
- Une piste absente ou en erreur reste explicitement absente/en erreur. On ne crée jamais un fichier vide présenté comme valide.
- Le code générique ne connaît aucun type Windows, CoreAudio, ScreenCaptureKit, Media Foundation ou AVFoundation.
- Le protocole Electron/Rust transporte uniquement des commandes, des réponses, des événements de santé et des chemins de session contrôlés. Il ne transporte pas les frames ni les samples.
- Aucun fichier de production ne dépasse 500 lignes. Une abstraction n’est créée que si elle retire réellement du code ou permet un test déterministe.

## 2. Dépendances et état cross-platform

Versions de référence vérifiées le 2 août 2026. Le `Cargo.lock` reste l’autorité pour le build reproductible ; toute mise à jour de crate doit passer par les tests Windows et macOS.

| Crate | Version | Rôle | Cible |
| --- | --- | --- | --- |
| [`cpal`](https://crates.io/crates/cpal) | `0.18.1` | Entrées/sorties audio bas niveau, microphone et abstraction audio commune | Windows, macOS, Linux plus tard |
| [`nokhwa`](https://crates.io/crates/nokhwa) | `0.10.11` | Capture et découverte de webcams via les backends natifs | Windows, macOS, Linux plus tard |
| [`wasapi`](https://crates.io/crates/wasapi) | `0.23.0` | Accès Windows avancé uniquement si CPAL ne suffit pas : `AudioClock`, application loopback, notifications d’endpoint | Windows uniquement, optionnel |
| [`windows-capture`](https://crates.io/crates/windows-capture) | `2.0.0` | Windows Graphics Capture et encodage vidéo matériel déjà utilisés par Beam | Windows |
| [`screencapturekit`](https://crates.io/crates/screencapturekit) | `8.0.1` | Capture écran/fenêtre et audio système macOS | macOS |

Les dépendances natives restent dans des sections `target` de `Cargo.toml`. Elles ne doivent jamais remonter dans les modules génériques.

```toml
[target.'cfg(windows)'.dependencies]
cpal = "0.18.1"
nokhwa = { version = "0.10.11", default-features = false, features = ["input-native"] }
windows-capture = "2.0.0"

# À conserver uniquement si la preuve CPAL nécessite un accès WASAPI direct.
wasapi = "0.23.0"

[target.'cfg(target_os = "macos")'.dependencies]
cpal = "0.18.1"
nokhwa = { version = "0.10.11", default-features = false, features = ["input-native"] }
screencapturekit = { version = "8.0.1", features = ["macos_15_0"] }
```

### Choix par plateforme

| Piste | Windows | macOS | Linux plus tard |
| --- | --- | --- | --- |
| Écran, fenêtre, application | `windows-capture` / Windows Graphics Capture | ScreenCaptureKit | PipeWire/portal à définir |
| Curseur | Win32 | AppKit/CoreGraphics | backend à définir |
| Microphone | CPAL, backend WASAPI | CPAL, backend CoreAudio | CPAL avec le backend disponible |
| Audio système | CPAL sur l’endpoint de sortie en loopback WASAPI | ScreenCaptureKit, avec l’écran quand possible | PipeWire/portal |
| Webcam | Nokhwa, backend Media Foundation | Nokhwa, backend AVFoundation | Nokhwa avec le backend natif disponible |

CPAL peut capturer l’audio système Windows sans que le domaine Beam dépende directement de `wasapi` : son backend WASAPI active le loopback lorsqu’un endpoint de sortie est utilisé comme source. Le point important est de sélectionner un **output/render device**, pas le `default_input_device()` qui représente le microphone. `wasapi` reste une porte de sortie pour les fonctions Windows que CPAL n’expose pas suffisamment, pas une seconde architecture audio.

Sur macOS, CPAL peut aussi évoluer vers le loopback CoreAudio, mais Beam choisit d’abord ScreenCaptureKit pour l’audio système afin que l’écran et l’audio système proviennent du même mécanisme natif et de timestamps compatibles. Cela réduit les points de synchronisation à maintenir.

## 3. La clock et le drift

### 3.1 Timeline de session

La clock actuelle de Rust (`SessionClock`, basée sur `std::time::Instant`) devient la clock maître publique de la session :

```text
SessionClock
    ├── écran
    ├── curseur
    ├── microphone
    ├── audio système
    └── caméra
```

Le démarrage suit toujours ce protocole :

1. Rust prépare les périphériques sans encore accepter de média.
2. Rust ouvre les files et les writers.
3. Rust capture `t0` avec `SessionClock`.
4. Tous les producteurs reçoivent le même `StartGate`/`t0`.
5. Chaque paquet est converti en nanosecondes de session avant d’entrer dans le pipeline.

Les timestamps natifs ne sont jamais jetés. Ils sont conservés dans les anchors de `timing.jsonl` afin de diagnostiquer le drift et de reconstruire une session.

### 3.2 Contrat de timestamp

Le cœur ne manipule que des types portables :

```rust
pub struct MediaPacket {
    pub track_id: TrackId,
    pub pts_ns: u64,
    pub duration_ns: u64,
    pub payload: PacketPayload,
}
```

Les détails d’implémentation peuvent garder le timestamp natif dans un type privé :

```rust
pub trait TimestampMapper<NativeTimestamp> {
    fn to_session_ns(
        &mut self,
        native_timestamp: NativeTimestamp,
    ) -> Result<u64, CaptureError>;
}
```

Invariants obligatoires par piste :

- `pts_ns` est monotone ;
- la durée audio correspond exactement au nombre de samples ;
- un paquet en retard est compté, jamais repositionné silencieusement ;
- les gaps, drops, re-anchors et changements de fréquence apparaissent dans les métriques ;
- la validation finale vérifie les PTS réels du fichier, pas uniquement les métadonnées annoncées par le producteur.

### 3.3 Webcam avec Nokhwa

Oui, Nokhwa peut être utilisé avec la clock de Beam. Il faut distinguer deux choses :

- la clock Beam donne le repère commun et l’horodatage de secours ;
- elle ne change pas la fréquence physique de la caméra et ne supprime pas seule le drift du capteur.

À chaque frame :

1. utiliser `Buffer::capture_timestamp()` quand le backend le fournit ;
2. mapper ce timestamp natif vers `SessionClock` avec un `TimestampMapper` ;
3. sinon, horodater immédiatement à la réception avec la clock monotone injectée ;
4. déplacer la frame dans une file bornée ;
5. laisser un worker encoder et écrire avec ce `pts_ns`.

`CallbackCamera` ne doit faire qu’acquérir, timestamp-er et envoyer. Le callback doit rester court ; l’écriture disque et l’encodage sont interdits dans ce callback. Si une frame est perdue, `frames_dropped` est incrémenté et la raison est conservée.

Pour le drift long terme, le pipeline compare périodiquement le temps caméra, le nombre de frames et la timeline de session. À la normalisation/export, il peut alors supprimer une frame trop tardive ou dupliquer une frame manquante selon les PTS. On ne recale jamais une vidéo en se basant seulement sur l’heure d’arrivée d’un callback.

### 3.4 Audio avec CPAL/WASAPI

CPAL fournit les samples ; il ne promet pas que tous les périphériques ont la même oscillator clock. La stratégie est donc :

- choisir un format de travail explicite, par défaut PCM float32, 48 kHz, stéréo lorsque le périphérique le permet ;
- garder un `sample_index` par source audio ;
- calculer la durée exacte à partir de `sample_count / sample_rate` ;
- ancrer le premier buffer sur `SessionClock` et enregistrer les timestamps hôte/backend quand ils existent ;
- mesurer périodiquement l’écart entre sample clock et session clock ;
- corriger avec un resampling très léger et borné lorsque le seuil de drift est dépassé, en enregistrant le ratio appliqué.

Le callback CPAL dépose un bloc PCM et ses informations de timing dans une file. Il ne fait pas de resampling complexe ni d’écriture de fichier.

Sous Windows, la première implémentation doit utiliser CPAL avec l’endpoint de sortie en loopback pour l’audio système. Si les tests montrent qu’il faut un `AudioClock`, l’application loopback ou des notifications d’endpoint plus précises, un petit adaptateur `backends/windows/audio/wasapi.rs` utilise `wasapi 0.23.0`. Le reste du code ne voit toujours que `AudioPacket`.

### 3.5 Audio système macOS avec ScreenCaptureKit

ScreenCaptureKit fournit les sample buffers et leurs timestamps natifs. Le backend macOS les mappe vers la session et utilise le même mécanisme pour l’écran et l’audio système lorsque la configuration le permet. Il n’y a donc pas un recorder écran et un recorder système séparés qui démarrent à deux instants inconnus.

Le microphone reste une source CPAL distincte : il a sa propre clock matérielle, mais le même `SessionClock`, les mêmes anchors et la même discipline de drift.

## 4. Structure Rust cible

On conserve le crate `packages/capture`. On ne crée pas une seconde application Rust concurrente et on ne mélange pas les APIs natives avec le protocole JSONL.

```text
packages/capture/
├── src/
│   ├── lib.rs
│   ├── model/                 # types persistés et types de commande portables
│   ├── clock/                 # SessionClock, mapper, anchors, drift
│   ├── sources/               # contrats génériques et MediaPacket
│   │   ├── audio.rs
│   │   ├── video.rs
│   │   ├── cursor.rs
│   │   └── device.rs
│   ├── pipeline/              # files bornées, coordination, synchronisation
│   │   ├── coordinator.rs
│   │   ├── queue.rs
│   │   ├── synchronizer.rs
│   │   └── finalizer.rs
│   ├── backends/
│   │   ├── windows/
│   │   │   ├── screen.rs
│   │   │   ├── audio.rs       # CPAL/WASAPI loopback + microphone
│   │   │   ├── camera.rs      # Nokhwa/Media Foundation
│   │   │   ├── cursor.rs
│   │   │   └── permissions.rs
│   │   ├── macos/
│   │   │   ├── screen_audio.rs # ScreenCaptureKit écran + audio système
│   │   │   ├── audio.rs        # CPAL/CoreAudio microphone
│   │   │   ├── camera.rs       # Nokhwa/AVFoundation
│   │   │   ├── cursor.rs
│   │   │   └── permissions.rs
│   │   └── linux/
│   │       └── mod.rs          # capacités et implémentation future
│   ├── session/                # prepare/start/pause/resume/stop
│   ├── storage/                # segments, manifest, recovery, validation
│   ├── catalog/                # listDevices et permissions
│   └── protocol/               # adaptateur JSONL très mince
├── tests/                      # intégration Rust déterministe
│   ├── clock.rs
│   ├── packets.rs
│   ├── pipeline.rs
│   ├── lifecycle.rs
│   ├── storage.rs
│   └── hardware/
│       ├── windows.rs
│       └── macos.rs
```

Règles de dépendance :

```text
model / clock / sources
          ↓
       pipeline
          ↓
  backend + storage
          ↓
      session
          ↓
      protocol
```

`model`, `clock`, `sources` et `pipeline` ne peuvent importer aucun module de plateforme. Les modules `backends/windows`, `backends/macos` et `backends/linux` sont les seuls endroits autorisés à importer les crates natives. Il n’y aura pas de `BackendFactory` géante ni de trait avec vingt méthodes : chaque plateforme construit un petit `PlatformSources` concret, et le coordinator lui parle via les contrats audio/vidéo/curseur.

## 5. Contrats à implémenter

Les contrats doivent rester petits et être testables sans webcam ni carte son réelle.

```rust
pub trait DeviceCatalog {
    fn list_devices(&self, filter: DeviceFilter) -> Result<Vec<DeviceDescriptor>, CaptureError>;
}

pub trait TrackSource: Send {
    fn prepare(&mut self, context: &SourceContext) -> Result<(), CaptureError>;
    fn start(&mut self, start: StartAt) -> Result<(), CaptureError>;
    fn pause(&mut self, at: SessionNs) -> Result<(), CaptureError>;
    fn stop(&mut self, at: SessionNs) -> Result<SourceReport, CaptureError>;
}

pub trait PacketWriter {
    fn push(&mut self, packet: MediaPacket) -> Result<(), CaptureError>;
    fn finish(&mut self, end: SessionNs) -> Result<SegmentReport, CaptureError>;
}
```

Les sources concrètes peuvent partager de petits helpers internes, mais elles ne doivent pas partager des handles natifs entre Windows et macOS. La plateforme est sélectionnée par `cfg`, pas par une détection dynamique au milieu du pipeline.

## 6. Cycle de session

### Prepare

- Rust reçoit les IDs opaques des sources sélectionnées.
- Rust vérifie les permissions, les formats et l’espace disque.
- Rust ouvre les périphériques, crée les queues et les writers.
- Aucun fichier final n’est déclaré valide à cette étape.

### Start

- Tous les producteurs sont prêts avant `t0`.
- Le coordinator publie un seul `StartAt`.
- Les premiers PTS sont vérifiés par rapport à zéro.
- Le manifest passe à `Recording` seulement après le démarrage confirmé des sources requises.

### Pause / resume

- Le coordinator prend une seule valeur `session_ns`.
- Toutes les sources arrêtent d’accepter des paquets à cette frontière.
- Les queues sont drainées, les segments sont fermés et un nouveau segment est ouvert au resume.
- Les pistes optionnelles en échec restent marquées `Failed`, sans prolonger artificiellement leur ancien segment.

### Stop

1. Rust annonce la frontière `t_stop` à toutes les sources.
2. Les callbacks sont désarmés.
3. Les queues sont drainées jusqu’à `t_stop`.
4. Les périphériques sont fermés : audio système, microphone et caméra doivent être libérés avant la finalisation.
5. Chaque writer vérifie le fichier, sa taille, son conteneur et ses PTS.
6. Le manifest reçoit les métriques finales, les gaps, les drops et les anchors.
7. `manifest.partial.json` devient `manifest.json` atomiquement.

Le résultat d’un stop ne doit jamais dépendre d’un délai arbitraire ou d’un `setTimeout` Electron.

## 7. Protocole Electron minimal

Electron conserve uniquement une façade typée de contrôle. Les noms ci-dessous sont le contrat cible ; l’implémentation peut garder le transport JSONL actuel derrière cette façade.

```text
listDevices({ kinds: ["screen", "camera", "microphone", "system-audio"] })
prepareRecording({ projectId, sources, settings })
startRecording({ sessionId })
pauseRecording({ sessionId })
resumeRecording({ sessionId })
stopRecording({ sessionId })
cancelRecording({ sessionId })
getRecordingStatus({ sessionId })
```

Les sources retournent un `DeviceDescriptor` portable : `id`, `kind`, `label`, `isDefault`, capacités et état de permission. Les handles Windows/macOS restent dans Rust.

Le renderer ne reçoit pas de chemin arbitraire, de handle natif, de `MediaStream`, de `MediaRecorder` ou de buffer audio. Il reçoit l’état de session, le manifest et les événements de santé nécessaires à l’interface.

## 8. Fichiers et format des sidecars natifs

Rust reste propriétaire de la session :

```text
session-<id>/
├── manifest.partial.json
├── manifest.json
├── timing.jsonl
├── health.jsonl
├── screen/segment-0001.mp4
├── camera/segment-0001.<native-video>
├── microphone/segment-0001.<native-audio>
├── system-audio/segment-0001.<native-audio>
└── cursor/events-0001.jsonl
```

Le choix précis du conteneur/codec de caméra et d’audio est une décision de l’encoder Rust, pas du renderer. `cpal` et `nokhwa` sont des crates d’acquisition, pas des encodeurs : il ne faut pas leur attribuer cette responsabilité. L’encoder doit recevoir les PTS déjà normalisés et produire un segment lisible, non vide, avec une durée mesurable.

La première implémentation privilégie les encodeurs matériels et natifs déjà disponibles dans chaque OS. Une crate d’encodage supplémentaire ne sera ajoutée que si un test de vertical slice prouve qu’elle est nécessaire ; aucune dépendance FFmpeg lourde ne sera ajoutée par défaut.

## 9. Suppression des anciens chemins Chromium/Electron

Après le vertical slice natif validé sur Windows et macOS, supprimer les chemins de capture et de persistance suivants :

- `src/api/camera-recorder.ts` et ses tests ;
- `src/api/microphone-recorder.ts` et ses tests ;
- `src/api/system-audio-recorder.ts` et ses tests ;
- les types de segments et méthodes preload `begin/write/finalize/fail` pour caméra, microphone et audio système ;
- `electron/camera-ipc.cjs` et `electron/camera/` ;
- `electron/microphone/` et `electron/microphone/ipc.cjs` ;
- `electron/system-audio/` et `electron/system-audio/ipc.cjs` ;
- `electron/media-segment-storage.cjs` lorsqu’il n’a plus aucun consommateur ;
- les imports et le démarrage des `Browser*Recorder` dans le HUD ;
- l’usage d’`HTMLMediaElement`/`MediaRecorder` comme source de capture ;
- `getUserMedia` et `getDisplayMedia` pour la capture enregistrée.

Avant chaque suppression, `rg` doit confirmer les références restantes. Il ne doit pas rester de couche de compatibilité ou de fallback Chromium caché : le chemin natif devient le seul chemin de recording Windows/macOS. Une preview caméra éventuelle doit consommer une preview native contrôlée, sans écrire de piste et sans devenir une seconde source de vérité.

## 10. Tests et critères d’acceptation

### Tests déterministes sans matériel

Dans `packages/capture/tests/` :

- clock injectée : origine, monotonicité, mapping de rates, timestamp natif avant origine ;
- caméra : timestamp Nokhwa présent/absent, frame en retard, frame drop, ordre des PTS ;
- audio : sample index, durée exacte, changement de rate, drift positif/négatif, resampling borné ;
- pipeline : queue pleine, backpressure, arrêt, drain, pause/resume, piste optionnelle en échec ;
- session : start gate commun, arrêt idempotent, finalisation après erreur et recovery ;
- storage : segment non vide, JSON atomique, PTS invalides, manifest partiel et suppression des fichiers temporaires ;
- protocol : commandes invalides, source inconnue, permission refusée, transition d’état impossible.

La couverture des modules génériques doit rester au minimum à 90 % pour statements, branches, functions et lines. Les tests matériel sont séparés et ne masquent pas les tests déterministes.

### Tests matériels Windows/macOS

Sur chaque OS supporté, exécuter avec de vrais appareils :

1. découverte caméra, microphone, audio système et fenêtres ;
2. recording de 10 secondes avec écran + fenêtre + caméra + microphone + audio système ;
3. pause/resume puis stop ;
4. fermeture propre de tous les périphériques ;
5. lecture de chaque segment et inspection de ses PTS réels ;
6. recording de stabilité d’au moins 10 minutes pour mesurer le drift.

Un test est rejeté si :

- un segment attendu fait 0 octet ou n’est pas décodable ;
- un PTS recule ou sort de la durée de session ;
- l’audio contient un gap non déclaré ;
- une source reste ouverte après `stop` ;
- le delta audio/vidéo augmente sans être rapporté dans les anchors et métriques ;
- un échec optionnel est transformé en piste silencieuse ou en fichier fabriqué.

Commandes de validation :

```bash
powershell.exe -NoProfile -Command "cargo fmt --all --check"
powershell.exe -NoProfile -Command "cargo test --workspace --all-features"
powershell.exe -NoProfile -Command "cargo clippy --workspace --all-targets --all-features -- -D warnings"
```

Les tests hardware restent explicitement marqués et ne sont lancés que sur une machine Windows/macOS autorisée avec les permissions et appareils correspondants.

## 11. Ordre d’implémentation

1. **Geler le contrat** : `SessionClock`, `MediaPacket`, `DeviceDescriptor`, `TrackSource`, `PacketWriter` et les transitions de session.
2. **Finir la couche timing** : mapper, anchors, sample clocks, métriques de drift et tests déterministes.
3. **Faire le vertical slice Windows** : écran, caméra Nokhwa, microphone CPAL, audio système CPAL/WASAPI loopback, écriture native et validation des PTS.
4. **Faire le vertical slice macOS** : écran + audio système ScreenCaptureKit, caméra Nokhwa/AVFoundation, microphone CPAL/CoreAudio, mêmes contrats et mêmes tests.
5. **Brancher Electron** sur `listDevices` et les commandes de session, sans transfert média.
6. **Basculer l’éditeur** vers le manifest et les sidecars Rust natifs.
7. **Supprimer immédiatement les anciens sidecars Chromium/Electron** après validation des deux vertical slices.
8. **Ajouter Linux** uniquement en implémentant les backends derrière les mêmes contrats ; aucun changement dans `clock`, `pipeline`, `session`, `storage` ou le protocole public ne doit être nécessaire.

## 12. Definition of done

Le recorder natif est considéré terminé lorsque :

- Windows et macOS utilisent Rust pour les cinq types de pistes ;
- Electron ne capture ni n’écrit de microphone, caméra ou audio système ;
- toutes les pistes partagent la timeline de session et conservent leurs timestamps natifs ;
- les dérives sont mesurées, corrigées selon une politique explicite et visibles dans les métriques ;
- `pause`, `resume` et `stop` ferment tous les périphériques et segments dans le bon ordre ;
- aucun fichier attendu n’est vide ou invalide sans erreur explicite ;
- le code générique ne contient aucune importation de plateforme ;
- les tests déterministes passent avec au moins 90 % de couverture sur le cœur ;
- les smoke tests matériels passent sur une machine Windows et une machine macOS ;
- Linux pourra ajouter son backend sans fork du pipeline.

## Références techniques

- [CPAL](https://github.com/RustAudio/cpal) — I/O audio cross-platform ; [implémentation WASAPI](https://raw.githubusercontent.com/RustAudio/cpal/master/src/host/wasapi/device.rs).
- [Nokhwa](https://docs.rs/nokhwa/0.10.11/nokhwa/) — capture webcam ; [`Buffer::capture_timestamp`](https://docs.rs/nokhwa/0.10.11/nokhwa/struct.Buffer.html).
- [WASAPI crate](https://docs.rs/wasapi/0.23.0/wasapi/) — accès Windows avancé, loopback et `AudioClock`.
- [ScreenCaptureKit crate](https://docs.rs/screencapturekit/8.0.1/screencapturekit/) — capture écran, fenêtre et audio macOS.
- [windows-capture crate](https://docs.rs/windows-capture/2.0.0/windows_capture/) — capture Windows et encodage matériel.
