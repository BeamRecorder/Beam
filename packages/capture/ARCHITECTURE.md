# Architecture

## Boundaries

The common model, session clock, state machine, storage and protocol contain no native API types. Platform recorders own their native streams and persist segmented output through the session layer. Every high-rate producer reports bounded metrics and explicit loss.

OS APIs are confined to `win/`, `mac/` and `linux/` directories. The architecture tests enforce these imports and the 500-line source limit. Executables are thin JSON/JSONL adapters over the library.

## macOS crate decision

The selected crate is `screencapturekit 8.0.1`. Its cumulative `macos_15_0` feature includes the macOS 13 APIs while also exposing `SCRecordingOutput`, used for direct hardware H.264 MP4 recording on macOS 15 and newer. Screen, window and application video use ScreenCaptureKit directly. Camera, microphone, and system audio are browser-owned Chromium sidecars persisted atomically by Electron; system audio uses Electron desktop loopback with `getDisplayMedia`. The older `screen-capture-kit 0.7.1` lacks the direct recording surface and was therefore not selected. All native references remain under OS-specific `mac/` directories.

## Persistence and time

Projects, sessions, tracks and segments use UUID v7 newtypes. Session timestamps are monotonic nanoseconds. Native timestamps are mapped through explicit rate-aware mappers and periodic anchors are appended to `timing.jsonl`.

Recording checkpoints go to `manifest.partial.json`. Media is segmented and never rewritten. Clean finalization fsyncs a temporary manifest, atomically renames it to `manifest.json`, then removes the partial manifest. Recovery accepts a partial manifest and ignores only invalid trailing JSONL records.

Pause and resume close and create segments; they do not rewrite earlier media. Cursor movements may be coalesced, while clicks, visibility and shape events force the pending movement to flush first.

## Current backend strategy

Windows uses Windows Graphics Capture, the WGC hardware encoder and Win32 cursor sampling. macOS uses ScreenCaptureKit and its VideoToolbox-backed recording output plus CoreGraphics cursor events. Linux uses the XDG ScreenCast Portal for consent and source selection, PipeWire for owned BGRA frames and cursor metadata, and a checked external FFmpeg process for H.264 MP4 segments. The Linux sink writes partial media, waits for a successful non-empty output and atomically publishes each segment; pause/resume keeps the Portal session alive while rotating FFmpeg. Webcams, microphones, and system audio are captured by Chromium with `getUserMedia`/`getDisplayMedia` and `MediaRecorder`; Electron atomically persists their WebM segments beside native tracks.
