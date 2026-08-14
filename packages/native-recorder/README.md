# Prebuilt native recorder

This directory contains optional release builds of Beam's Rust capture engine for fast local Electron development.

Expected files:

```text
packages/native-recorder/win/capture-engine.exe
packages/native-recorder/mac/capture-engine
packages/native-recorder/linux/capture-engine
```

The binary must be built for the current operating system and must use the same capture-engine JSON-lines protocol as the Rust workspace. `npm run electron:dev-norust` selects the matching file automatically and does not run Cargo.

Keep `npm run electron:dev` for native development: it rebuilds the Rust capture engine from the current source before starting Electron.

The Linux binary requires the host PipeWire/Portal runtime and an `ffmpeg` executable with the MP4 muxer plus either `libx264` or `libopenh264`. Set `BEAM_FFMPEG_PATH` to an explicit executable when FFmpeg is not available on `PATH`.
