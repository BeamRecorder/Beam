# Linux development

Beam records screens and windows on Linux through the XDG ScreenCast Portal, PipeWire and FFmpeg. Electron never enumerates desktop sources on Linux: the source selector represents the system picker, which opens once during preparation and remains attached across pause/resume.

Install the compiler and runtime packages for your distribution as documented in the [native Linux screen capture design](../linux/screen-native.md). FFmpeg is a runtime dependency and must provide:

- the `mp4` muxer;
- either the `libx264` or `libopenh264` H.264 encoder.

Beam checks these capabilities before opening the Portal picker. If FFmpeg is installed outside `PATH`, set `BEAM_FFMPEG_PATH` to its executable. A missing executable reports `ffmpeg-unavailable`; a build without either supported encoder reports `ffmpeg-encoder-unavailable`.

For local development, build both the capture engine and the filtered input helper:

```bash
cargo build -p capture --bin capture-engine --bin beam-input-helper
npm run electron:dev-norust
```

`npm run electron:dev` also rebuilds the engine before starting Electron. A prebuilt engine may be placed at `packages/native-recorder/linux/capture-engine`.

The deterministic FFmpeg tests use a fake child process. The opt-in synthetic runtime smoke uses the actual system executable without opening the Portal picker:

```bash
cargo test -p capture --lib \
  screen::linux::ffmpeg_process_tests::system_ffmpeg_encodes_a_playable_mp4_segment \
  -- --ignored --exact
```

A real monitor/window smoke remains interactive and must be run manually because the Portal requires explicit user consent.

Click and shortcut metadata also requires explicit Polkit consent. Use **Record keyboard shortcuts** in HUD preferences. On Linux, turning this setting off disables both keyboard shortcuts and click metadata. Do not add the developer account to the `input` group: that would grant the entire Electron process broad access to every raw input device. Development, AppImage, RPM and DEB use the same filtered helper protocol and write structured events to `cursor/input.json`.

Repository rules still apply to documentation and non-capture changes:

- [UI guidelines](../UI.md)
- [Architecture guidelines](../ARCHITECTURE.md)
- [Code quality guidelines](../CODE_QUALITY.md)
- [Electron window guidance](../electron_window.md)
