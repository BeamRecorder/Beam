# Linux capture engine

Place an optional prebuilt Linux `capture-engine` binary in this directory for `npm run electron:dev-norust`.

The binary must be executable and built for the current architecture. Runtime recording also requires a working XDG ScreenCast Portal, PipeWire, and FFmpeg with the MP4 muxer plus `libx264` or `libopenh264`.
