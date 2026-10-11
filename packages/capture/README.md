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

### Recording stress and Windows media verification

Run focused shared regressions with `cargo test -p capture --lib screen::`, `cargo test -p capture --lib cursor::recording_support`, `cargo test -p capture --lib session::`, and `cargo test -p capture --test input --test storage --test architecture`.

On Windows, install FFmpeg (6 or newer), put it on PATH or set `BEAM_CAPTURE_TEST_FFMPEG` to its executable, and run `cargo test -p capture --all-features --lib screen::win -- --test-threads=1`. These tests use a real D3D11 WARP device and MediaTranscoder, then decode the MP4 to check pixels, orientation, timestamps, static intervals, GPU surface reuse, 1080p overload and handle cleanup across 64 consecutive native encoder sessions. CI runs them serially so unrelated simultaneous codec instances do not consume a driver's session limit. Shared stress tests exercise a simulated full day at several refresh rates, forty-eight hours of encoder pressure, a million surface leases, concurrent lease returns, a thousand cursor segments, multi-hour cursor journals, shuffled shortcut journals and corruption/publication failures. Simulated duration does not substitute for an overnight recording on actual Windows hardware.

For the real eight-hour endurance test, run `cargo test -p capture --all-features --test windows_recording_soak -- --ignored --test-threads=1` on a dedicated, unlocked Windows desktop with enough free storage. It captures the primary display and cursor, checks health every second, limits private-memory growth to 512 MiB and handle growth to 64 after a 60-second warmup, compares each MP4 duration to its segment timeline and decodes every frame. Artifacts survive success and failure under a unique `beam-recording-soak-*` temporary directory, or `BEAM_CAPTURE_SOAK_OUTPUT` if set. `BEAM_CAPTURE_SOAK_SECONDS` changes the default 28,800-second duration; `BEAM_CAPTURE_SOAK_PAUSE_SECONDS=600` adds pauses/resumes every ten minutes; `BEAM_CAPTURE_SOAK_REGION=1` captures the middle 80% of a display; `BEAM_CAPTURE_SOAK_SOURCE` selects a catalog source ID, including a window. Run separate continuous and pause/resume trials, with the Chrome/application load from the reported failure, on Intel/AMD/NVIDIA machines and supported Windows versions. The endurance test is deliberately ignored in routine CI; its compilation is checked there.
