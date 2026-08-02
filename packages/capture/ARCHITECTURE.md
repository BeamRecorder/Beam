# Architecture

## Boundaries

The common model, session clock, state machine, storage and protocol contain no native API types. Platform recorders own their native streams and persist segmented output through the session layer. Every high-rate producer reports bounded metrics and explicit loss.

OS APIs are confined to `win/`, `mac/` and `linux/` directories. The architecture tests enforce these imports and the 500-line source limit. Executables are thin JSON/JSONL adapters over the library.

## macOS crate decision

The selected crate is `screencapturekit 8.0.1`. Its cumulative `macos_15_0` feature includes the macOS 13 APIs while also exposing `SCRecordingOutput`, used for direct hardware H.264 MP4 recording on macOS 15 and newer. Screen, window and application video use ScreenCaptureKit directly. Camera discovery and live preview use Nokhwa; microphone and system audio use CPAL. The macOS camera writer is still an explicit optional-track failure until an AVFoundation/VideoToolbox writer is added; it never creates an empty placeholder segment. The older `screen-capture-kit 0.7.1` lacks the direct recording surface and was therefore not selected. All native references remain under OS-specific directories.

## Persistence and time

Projects, sessions, tracks and segments use UUID v7 newtypes. Session timestamps are monotonic nanoseconds. Native timestamps are mapped through explicit rate-aware mappers and periodic anchors are appended to `timing.jsonl`.

Recording checkpoints go to `manifest.partial.json`. Media is segmented and never rewritten. Clean finalization fsyncs a temporary manifest, atomically renames it to `manifest.json`, then removes the partial manifest. Recovery accepts a partial manifest and ignores only invalid trailing JSONL records.

Pause and resume close and create segments; they do not rewrite earlier media. Cursor movements may be coalesced, while clicks, visibility and shape events force the pending movement to flush first.

## Current backend strategy

Windows uses Windows Graphics Capture, the WGC hardware encoder and Win32 cursor sampling. Nokhwa supplies camera frames, CPAL supplies microphone input and Windows render-loopback audio, and bounded queues feed native writers. The camera preview is also produced by Nokhwa/Rust and exposed as a localhost multipart image stream; Electron only renders its URL. macOS uses ScreenCaptureKit and its VideoToolbox-backed recording output plus CoreGraphics cursor events; CPAL supplies microphone and system-audio sources, while Nokhwa supplies the native camera preview. Linux currently exposes source and permission metadata only; native session recording is unavailable. Browser media APIs are not used for camera preview or recording.
