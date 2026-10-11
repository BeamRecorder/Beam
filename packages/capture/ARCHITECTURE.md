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

Windows uses Windows Graphics Capture, Media Foundation H.264 encoding with hardware acceleration when available, and Win32 cursor sampling. macOS uses ScreenCaptureKit and its VideoToolbox-backed recording output plus CoreGraphics cursor events. Linux uses the XDG ScreenCast Portal for consent and source selection, PipeWire for owned BGRA frames and cursor metadata, and a checked external FFmpeg process for H.264 MP4 segments. The Linux sink writes partial media, waits for a successful non-empty output and atomically publishes each segment; pause/resume keeps the Portal session alive while rotating FFmpeg. Webcams, microphones, and system audio are captured by Chromium with `getUserMedia`/`getDisplayMedia` and `MediaRecorder`; Electron atomically persists their WebM segments beside native tracks.

## Windows recording reliability

WGC callbacks apply rational, phase-preserving cadence before copying. Both complete frames and regions are copied on the GPU into a bounded texture pool. The pool owns the queue budget plus one retained last image; samples release their leases on `MediaStreamSample.Processed`. An explicit D3D multithread lock protects the entire resize draw. A resized window uses aspect-fit scaling into the segment's original dimensions, and its cursor uses live physical DWM bounds and the same output mapping. Screenshots use an owned staging texture whose map is always unmapped before release.

A dedicated MTA health worker checks encoder progress and emits retained images for static WGC content. Status reads cached health and does not run COM or GPU operations. Acquired, submitted, consumed and successfully finalized frame counts are distinct. Backpressure only fails after thirty seconds without consumption progress; merely being slower than the producer does not stop recording.

Startup (15 seconds), encoder preparation (10 seconds), native screen shutdown (25 seconds), encoder finalization (15 seconds within screen shutdown) and polling worker joins (2 seconds) have explicit bounds. Timed-out native operations remain quarantined until their worker returns, preventing repeated retries from accumulating blocked drivers. Stop signals video and cursor producers before waiting. Capture/encoding failure never deletes existing media; successfully finalized interrupted media retains complete segment boundaries and the interruption reason.

Windows and macOS cursor workers only append/flush session journals across pauses. The final Stop publishes cursor arrays by streaming, caps telemetry at 216,000 samples and sorts shortcut events with bounded external merge runs. Publication failures retain journals for retry; final cursor JSON arrays never enter JSONL repair. Recovery rejects interior corruption and only truncates invalid trailing records after a complete bounded scan.
