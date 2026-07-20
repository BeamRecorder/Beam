# Architecture

## Boundaries

The common model, session clock, state machine, storage and protocol contain no native API types. Native frames cross the backend boundary as opaque handles whenever an encoder can consume them without a CPU copy. `VideoTrackWriter` and `AudioTrackWriter` isolate capture from containers and codecs. Every high-rate producer uses a bounded queue.

OS APIs are confined to `win/`, `mac/` and `linux/` directories. The architecture tests enforce these imports and the 500-line source limit. Executables are thin JSON/JSONL adapters over the library.

## macOS crate decision

The selected crate is `screencapturekit 8.0.1`. Its cumulative `macos_15_0` feature includes the macOS 13 APIs while also exposing `SCRecordingOutput`, used for direct hardware H.264 MP4 recording on macOS 15 and newer. Screen, window, application and system-audio capture use ScreenCaptureKit directly; audio sample buffers are drained through a bounded queue into an independent WAV sidecar. The older `screen-capture-kit 0.7.1` lacks the direct recording surface and was therefore not selected. All native references remain under OS-specific `mac/` directories.

## Persistence and time

Projects, sessions, tracks and segments use UUID v7 newtypes. Session timestamps are monotonic nanoseconds. Native timestamps are mapped through explicit rate-aware mappers and periodic anchors are appended to `timing.jsonl`.

Recording checkpoints go to `manifest.partial.json`. Media is segmented and never rewritten. Clean finalization fsyncs a temporary manifest, atomically renames it to `manifest.json`, then removes the partial manifest. Recovery accepts a partial manifest and ignores only invalid trailing JSONL records.

Pause and resume close and create segments; they do not rewrite earlier media. Cursor movements may be coalesced, while clicks, visibility and shape events force the pending movement to flush first.

## Current backend strategy

Windows uses Windows Graphics Capture, the WGC hardware encoder, WASAPI loopback, CPAL, Nokhwa/Media Foundation and Win32 cursor sampling. macOS uses ScreenCaptureKit, its VideoToolbox-backed recording output, a separate ScreenCaptureKit audio stream, CPAL/Nokhwa discovery and CoreGraphics cursor events. Linux uses the XDG ScreenCast portal plus PipeWire, with X11/XFixes as an isolated fallback. FFmpeg, when used for Linux H.264, is an optional child process and does not appear in public types.
