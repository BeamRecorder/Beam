# Architecture

## Boundaries

The common model, session clock, state machine, storage and protocol contain no native API types. Platform recorders own their native streams and persist segmented output through the session layer. Every high-rate producer uses a bounded queue, reports explicit loss, and rejects empty output instead of creating placeholder media.

OS APIs are confined to platform backend modules. Executables remain thin JSONL adapters over the library, while Electron only transports commands and renders native preview or telemetry results. Browser media capture APIs are not part of the recorder architecture.

## Native platform paths

### Windows

- Screen and window video use Windows Graphics Capture and the native H.264 encoder.
- Camera discovery and acquisition use Nokhwa 0.10.11 with Media Foundation; frames are converted to BGRA and encoded to MP4 through the Windows native encoder.
- Microphone discovery and capture use CPAL with exact endpoint identifiers.
- System audio uses event-driven WASAPI render-loopback capture for the selected output endpoint.
- Audio meters use the same native microphone or WASAPI endpoints and are closed before an armed recording opens its devices.

### macOS

- Screen, window, application and system-audio capture use ScreenCaptureKit directly.
- Camera discovery and acquisition use Nokhwa 0.10.11 with AVFoundation.
- Camera frames are converted to BGRA IOSurfaces, encoded as H.264 with VideoToolbox, and muxed into MP4 with AVAssetWriter.
- Microphone discovery and capture use CPAL with exact endpoint identifiers.
- System audio and its level meter use ScreenCaptureKit audio output and exclude Beam's own process audio to prevent feedback.

Camera, microphone and system-audio startup failures are surfaced as real track failures. No backend writes empty files, synthetic samples, or placeholder segments.

## Persistence and time

Projects, sessions, tracks and segments use UUID v7 newtypes. Every clone of the session clock shares one monotonic epoch and one atomically published last timestamp. Native timestamps are mapped through rate-aware mappers that re-anchor after discontinuities and never publish time that moves backwards.

Recording checkpoints go to `manifest.partial.json`. Media is segmented and never rewritten. Clean finalization fsyncs a temporary manifest, atomically renames it to `manifest.json`, then removes the partial manifest. Recovery accepts a partial manifest and ignores only invalid trailing JSONL records.

Pause and resume close and create segments; they do not rewrite earlier media. Cursor movements may be coalesced, while clicks, visibility and shape events force the pending movement to flush first.

## Preview and telemetry

The camera preview is produced once by Nokhwa in Rust and can be handed directly to recording when the selected source is unchanged. The current renderer transport is a bounded localhost multipart stream; publishing preview frames is best-effort and can never terminate camera recording. Audio levels are sampled by native CPAL, WASAPI or ScreenCaptureKit monitors and polled through the JSONL protocol. Electron does not call `MediaRecorder`, `getUserMedia`, or `getDisplayMedia`.

## Manual validation

Native capture must be validated on physical Windows and macOS machines because device drivers, permissions, endpoint formats and hardware encoders cannot be proven by cross-platform static review. The repository intentionally contains no CI workflow for this branch; builds and hardware tests are run manually by the project owner.
