# capture

`capture` is Beam's native Rust capture engine. It discovers selectable media sources, validates requests, coordinates separately timestamped tracks and writes recoverable sidecars. The library never performs UI composition or sends media through stdout.

## Commands

```bash
cargo run -p capture --bin capture-probe -- discover
cargo run -p capture --bin capture-engine
cargo run -p capture --bin capture-smoke -- full
```

`capture-smoke full --duration 10 --output recordings-smoke` opens every available native track and produces a complete project containing screen and cursor data. Browser-owned camera, microphone, and system-audio sidecars are exercised through Electron rather than this native smoke binary.

`capture-engine` reads JSONL on stdin and reserves stdout for JSONL responses. Logs and fatal diagnostics go to stderr. Hardware tests are ignored unless `hardware-tests` is explicitly enabled.

Windows recording uses WGC H.264 and Win32 cursor sampling. macOS uses ScreenCaptureKit for display/window/application video plus CoreGraphics for cursor events. Webcams, microphones, and system audio are captured by Chromium and stored by Electron as WebM Opus/VP8 sidecars. Electron desktop loopback supplies system audio through `getDisplayMedia`; macOS 14.2+ requires `NSAudioCaptureUsageDescription`, and macOS 13+ is required for browser desktop audio capture. Direct ScreenCaptureKit MP4 recording requires macOS 15 or newer.

Linux records through the XDG ScreenCast Portal and PipeWire, with FFmpeg providing the MP4 encoder. Recording is advertised only when the Portal, PipeWire connection, and a supported FFmpeg encoder are all available. Separate cursor shapes are exposed when the Portal provides cursor metadata; click and shortcut capture additionally uses Beam's filtered input helper.
