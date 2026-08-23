# Versioned native-engine cache

`bun run electron:dev` uses this ignored local cache only when Cargo is not installed. Every filename is tied to the version in the repository root `package.json` and to the current operating system and architecture:

```text
packages/native-recorder/win/x64/capture-engine-<version>.exe
packages/native-recorder/win/arm64/capture-engine-<version>.exe
packages/native-recorder/mac/arm64/capture-engine-<version>
packages/native-recorder/linux/x64/capture-engine-<version>
packages/native-recorder/linux/x64/beam-input-helper-<version>
```

When a required file is absent, an interactive terminal asks `Download capture-engine <version>? [Y/n]`. The download is installed only after its asset name and SHA-256 match `native-engines-<version>.json`; macOS and Linux files are then made executable. Non-interactive execution fails unless `BEAM_DOWNLOAD_CAPTURE_ENGINE=1` explicitly allows the same verified download.

Packaged applications use the corresponding versioned files under `resources/capture-engine/` and, on Linux, `resources/input-helper/`. Old unversioned binaries are never selected.

The Linux engine still requires the host Portal/PipeWire runtime and FFmpeg with the MP4 muxer and a supported encoder. See [the Linux development guide](../../docs/dev/linux.md).
