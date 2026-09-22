# Native media platform smoke runs

Run these checks on a native machine after installing the pinned Rust 1.92 toolchain and the GStreamer 1.28.7 runtime and SDK. The CI workflow checks compilation and synthetic tests on macOS, Windows and Linux; these runs cover permissions, real devices, runtime loading and unplug behavior that cross-compilation cannot prove.

## Shared sequence

1. Run `cargo +1.92.0 run --release -p beam-media-probe -- devices` and save the JSON. Check the per-category `errors` object, then select one camera, one microphone and one system output by their reported IDs. Use a fresh output directory for every run.
2. Run `cargo +1.92.0 run --release -p beam-media-probe -- record --output <directory> --duration 5 --camera <camera-id> --microphone <microphone-id> --system-output <output-id>`.
3. Run `cargo +1.92.0 run --release -p beam-media-probe -- report --output <directory>`. Check that `completed` is true, all three tracks are `Completed`, and `previewError` is null. Independently open `camera.webm`, `microphone.wav` and `system-audio.wav`; check picture and sound in the intended tracks. The manifest's selected source IDs must match the choice from step 1.
4. Repeat for `--duration 1800` on the same device set. Compare acquired, encoded and preview frame counts, drops, process-tree RSS, CPU, optional wgpu allocator bytes, CPU color-conversion bytes, CPU row-padding copy bytes and GPU upload bytes per preview frame, and file durations. Use `processSamples[].previewFramesUploaded` to compare preview cadence with RSS and CPU over time. A null initial A/V offset means no synchronized reference signal was supplied; do not infer one from first packet arrival.
5. In separate short recordings, deny each relevant permission, select a nonexistent camera or audio ID, disconnect one selected device after media arrives, switch the default output, and stop with Ctrl+C. Each failure should leave an accurate per-track status and any finalized media readable. Do not use the long run's output directory for destructive tests.

For preview isolation, record the same camera twice for eight seconds with audio disabled. Add `--preview-delay-ms 500` only to the second run. Compare `framesAcquired`, `framesEncoded`, `framesDropped`, `preview.framesUploaded`, `preview.cpuBufferReallocations`, `preview.cpuBufferGrowthBytes`, `preview.cpuColorConversionBytes`, `preview.cpuPaddingCopyBytes`, and `preview.bytesUploaded`. The delayed run should upload far fewer preview frames while camera acquisition and encoding remain comparable and the WebM remains readable. Record both reports; do not treat a single camera's observed fps as a universal threshold.

`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 <media-file>` is one independent duration check when FFmpeg tools are installed. The three separate files must never be treated as a single mixed track. Save the device JSON, manifests, measurements, probe reports and the exact runtime/plugin inventory with each result.

## Platform cases

| Host | Required cases | Runtime/privacy check |
| --- | --- | --- |
| Linux | Native Wayland and X11 sessions when available; an integrated and an external USB camera; named and default PipeWire sinks; real microphone and a virtual sink with an audible test tone in the system track only | Run with the seven-plugin allowlist from `scripts/ci/check_gstreamer_profile.py`; then test the eventual private runtime without system plugin paths. |
| macOS 14.2+ | Integrated and USB cameras; output-only and duplex Core Audio devices; Bluetooth output; camera, microphone and audio-capture permission decisions | Test from the packaged host app as well as the CLI. Verify the probe's embedded privacy descriptions and include `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` and `NSAudioCaptureUsageDescription` in the host app; confirm the private tap and aggregate disappear after stop. |
| Windows 10/11 | Integrated and USB cameras; WASAPI loopback from internal, USB and Bluetooth outputs; camera/microphone privacy denial; unplug during an asynchronous Media Foundation read | Load only Beam's bundled GStreamer DLLs and plugins on a clean machine. Verify the Source Reader stops and the session still finalizes independent tracks. |

Run the macOS and Windows cases on their own machines before replacing Beam's current Electron capture paths. The Linux run and cross-target Clippy checks do not close those hardware gates.
