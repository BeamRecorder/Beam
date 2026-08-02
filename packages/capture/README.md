# capture

`capture` is Beam's native Rust capture engine. It discovers selectable media sources, validates requests, coordinates separately timestamped tracks and writes recoverable sidecars. The library never performs UI composition or sends media through stdout.

## Commands

```bash
cargo run -p capture --bin capture-probe -- discover
cargo run -p capture --bin capture-engine
cargo run -p capture --bin capture-smoke -- full
```

`capture-smoke full --duration 10 --output recordings-smoke` opens every available native track and produces a complete project containing screen, cursor, camera and audio data where the platform backend is available.

`capture-engine` reads JSONL on stdin and reserves stdout for JSONL responses. Logs and fatal diagnostics go to stderr. Hardware tests are ignored unless `hardware-tests` is explicitly enabled.

Windows recording uses WGC H.264 and Win32 cursor sampling, Nokhwa for camera frames and native preview, and CPAL for microphone plus render-loopback audio. macOS uses ScreenCaptureKit for display/window/application video plus CoreGraphics for cursor events, Nokhwa for native camera preview and CPAL for audio sources. The macOS camera recording writer remains an explicit unsupported optional track until its AVFoundation/VideoToolbox writer is added. Direct ScreenCaptureKit MP4 recording requires macOS 15 or newer.

Linux native recording is currently unavailable; Linux source discovery and permission metadata remain available for future native backend work.
