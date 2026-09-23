# Native media engine

`beam-media-engine` is both a directly callable Rust library and a versioned
JSON-lines executable. Neither interface requires ARGUI. One controller owns one
worker, one active session and the four native producers. Electron uses that same
engine; Studio has no Chromium recording sidecars.

## Run without a UI framework

```sh
cargo run -p beam-media-engine --example record -- /private/application/projects
```

The example requests a screen, camera, microphone and system output, records five
seconds and returns the final manifest. Linux opens the system Portal picker.
Native permissions and actual devices are required. Building from source requires
the GStreamer SDK; distributed bundles include their private runtime.

## Rust host

Create the controller once, on the application's service layer:

```rust,no_run
use beam_media_engine::{RecordingController, RecordingConfig, ProjectId,
    ScreenRequest, ScreenSelection, PortalSourceKind, CursorSelection,
    CameraSelection, AudioSelection, OutputLocation};
# fn run() -> Result<(), Box<dyn std::error::Error>> {
let engine = RecordingController::new("/private/application/projects")?;
let sources = engine.list_sources(); // independent Result per device category
let prepared = engine.prepare(RecordingConfig {
    output: OutputLocation::ProjectRoot,
    project_id: ProjectId::new(),
    screen: Some(ScreenRequest {
        selection: ScreenSelection::Portal {
            kind: PortalSourceKind::Monitor, restore_token: None,
        }, // Linux; on macOS/Windows use Source with the discovered SourceId
        region: None, // or a rectangle normalized to the selected source
        cursor: CursorSelection::Disabled,
        fps: 30,
        excluded_window_handles: Vec::new(),
    }),
    camera: CameraSelection::FirstAvailable { width: 640, height: 480, fps: 30 },
    microphone: AudioSelection::Default,
    system_audio: AudioSelection::Default,
})?;
let id = prepared.session_id.ok_or("missing session ID")?;
engine.start(id)?;
let status = engine.status();
let events = engine.events(0); // retain events.cursor for the next read
let levels = engine.audio_levels(id)?;
let preview = engine.camera_preview(id)?; // existing source's latest-frame mailbox
engine.pause(id)?;
engine.resume(id)?;
let result = engine.stop(id)?;
// Inspect result.state and every result.manifest track before declaring success.
# Ok(())
# }
```

`prepare`, lifecycle methods and preview retrieval are synchronous. Call them
from a host task executor, outside rendering callbacks. `status` and `events`
remain readable during preparation/finalization. The worker polls independently;
the UI never calls `MediaSession::poll`. Clones share the same worker.

Use `capture_still` for PNG screenshots and `source_preview` for bounded JPEG
thumbnails. A camera preview and the meters reuse already-open recording sources.
An armed/paused camera still publishes previews, while the shared gate prevents
frames entering the recorded timeline. No microphone is opened just for a meter.

## Process boundary

Launch `beam-media-engine <projects-root>` or the bundle's `run-engine` launcher.
Send one UTF-8 JSON object per line, at most 1 MiB:

```json
{"version":1,"id":"host-1","command":{"type":"status"}}
```

Replies carry `version`, `requestId`, `ok`, and `result` or `error`. Commands are
`sources`, `capabilities`, `permissions`, `prepare`, `start`, `pause`, `resume`,
`stop`, `cancel`, `status`, `events`, `levels`, `camera-preview`, `screenshot`,
`screen-preview`, `source-preview`, `input-access`, `request-input-access`, and `resolve-display`
(the last is Windows-only). Lifecycle and stream queries carry `sessionId`.
`prepare` carries `config`; its schema is in `packages/media-engine/src/protocol.rs`.
Unknown fields, legacy commands and unsupported versions are rejected. The process
adapter delegates recording ownership to the same controller used by Rust hosts.
EOF interrupts/finalizes the active session. Native parent-death guards terminate
orphaned processes. macOS hosts must service system cursor refresh on their main
thread when using cursor shape telemetry; the executable already does this.

## Storage and failure contract

The application owns the root. Configurations provide typed project IDs and one
of `project-root`, `studio`, `instant`, never arbitrary output directories. Each
prepare reserves a unique session; project metadata preserves existing editor
fields. Symlinks and conflicting project IDs are rejected.

Screen and camera have separate VP8/WebM writers; microphone and system output
have separate PCM/WAV writers. Cursor/input data is a separate event track.
Pause closes segments; resume starts new segments on a shared timeline excluding
the paused interval. Manifest v2 paths and segment times are authoritative.
Failed tracks remain explicit and usable completed segments remain editable.
Legacy compatibility reads data only; it never launches the former engine.

All selections pass one start gate. Portal cancellation returns `cancelled`
before opening the other devices. Source failures stay local to their tracks.
The host checks final state and track errors: a partial recording is not reported
as wholly successful. Cancel and last-owner drop preserve recoverable artifacts.
Preparation itself is synchronous; cancellation while the OS picker is open is
performed in that picker. A host abandoning an in-flight preparation must cancel
the session when preparation returns. Electron enforces this with generations.

Commands are bounded to 16 pending requests; overload returns `Busy`. Events retain
64 changes and report gaps. Frame/audio queues, previews and diagnostic histories
are bounded independently. Slow UI reads cannot block writers. Stale session IDs
cannot mutate a newer session.

## Distribution and validation

The private bundle has an explicit plugin allowlist, hashes and license notices.
Linux supports RPM and Debian SDK installations for building bundles. Release
jobs build each supported CPU on a matching runner, then package the matching
runtime. Standalone development downloads verify both the archive and its file
inventory. macOS now requires 14.2 for native system audio; the real Electron host
and native executable both include privacy descriptions. A future ARGUI host
must carry equivalent usage descriptions in its own application bundle.

Synthetic tests cover four independent writers, shared start/pause timing,
malformed buffers, disconnection, writer failure, cancellation and recovery.
Cross-compilation is not a hardware gate. Full platform, installed-package and
5/30-minute hardware checks remain tracked in `native-media-argui-migration.md`;
they must not be inferred from Linux unit tests.
