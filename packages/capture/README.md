# capture

`capture` is DemoRecorder's native Rust capture engine. It discovers selectable media sources, validates requests, coordinates separately timestamped tracks and writes recoverable sidecars. The library never performs UI composition or sends media through stdout.

## Commands

```bash
cargo run -p capture --bin capture-probe -- discover
cargo run -p capture --bin capture-engine
cargo run -p capture --bin capture-smoke -- full
```

`capture-smoke full --duration 10 --output recordings-smoke` opens every available track and produces a complete project containing independent screen, system-audio, microphone, camera and cursor sidecars. Individual modes (`screen`, `system-audio`, `mic`, `camera`, `cursor`) remain available for hardware diagnosis.

`capture-engine` reads JSONL on stdin and reserves stdout for JSONL responses. Logs and fatal diagnostics go to stderr. Hardware tests are ignored unless `hardware-tests` is explicitly enabled.

Windows recording uses WGC H.264, WASAPI loopback, CPAL, `cameras`/Media Foundation and Win32 cursor sampling. macOS uses ScreenCaptureKit for display/window/application video and system audio, CoreGraphics for cursor events, CPAL for microphones and AVFoundation camera frames through `cameras`. Direct ScreenCaptureKit MP4 recording requires macOS 15 or newer; source discovery and audio APIs remain based on the macOS 13 ScreenCaptureKit surface.

Linux builds with hardware features require ALSA, PipeWire, SPA and udev development packages. The CI workflow installs these packages.
