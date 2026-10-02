# Experimental Linux GPU export

Linux desktop exports can opt into **FFmpeg GPU (experimental)** under Export → More options. Preview and capture keep their existing backends. The normal export option continues to use WebCodecs. The experimental path supports MP4/H.264 and WebM/VP9, with hardware VBR encoding, even dimensions from 2 to 8192, and integer frame rates from 1 to 120. Actual driver limits can be lower.

## Build and dependencies

Install a C++17 compiler, `pkg-config`, Node.js development headers, FFmpeg development libraries (`libavcodec`, `libavutil`, `libavfilter`, `libavformat`), libva and libdrm development packages. The runtime needs matching FFmpeg shared libraries and a functioning VA-API driver with the requested encoder and RGB DMA-BUF import support. `vainfo` reporting an encoding entrypoint is necessary but does not prove that import will work.

On Fedora, the development packages are typically `gcc-c++`, `pkgconf-pkg-config`, `ffmpeg-devel`, `libva-devel` and `libdrm-devel`. FFmpeg/Intel driver availability and patent-restricted codecs depend on the configured distribution repositories. Use the same repositories/versions for headers and runtime libraries. On Debian/Ubuntu the corresponding development packages are `g++`, `pkg-config`, `libavcodec-dev`, `libavutil-dev`, `libavfilter-dev`, `libavformat-dev`, `libva-dev` and `libdrm-dev`. Install the runtime `ffmpeg` command for AAC/Opus audio remuxing.

```sh
bun run build:ffmpeg-export
bun run electron:dev
```

The build creates `build/native/ffmpeg-export/beam-ffmpeg-export` and `beam-gpu-transport.node`. Linux packaging includes them only when both have already been built; this experiment does not bundle FFmpeg shared libraries. The transport uses stable Node-API v8 and links no FFmpeg libraries into Electron. Set `BEAM_NODE_INCLUDE` to the directory containing `node_api.h` if it is unavailable beside the active Node executable or in `/usr/include/node`. A build intended to ship this option must compile the encoder against the target distribution's ABI. Windows/macOS packaging does not include these files and their UI does not display the option.

`BEAM_FFMPEG_DRM_DEVICE` selects the render node, defaulting to `/dev/dri/renderD128`. The device must be compatible with Electron's rendering GPU. There is no automatic multi-GPU migration. `CXX` selects the compiler; `BEAM_FFMPEG_BUILD_FLAGS` can provide trusted local include/link flags instead of pkg-config for development.

## Frame ownership and transfer

1. A dedicated sandboxed, hidden offscreen Electron renderer uses the same encoder video/audio pipelines and runtime painters as normal export. It has no Vue UI or general desktop preload.
2. The host pauses offscreen capture before each render. After two compositor animation frames, it arms capture and resumes the GPU texture capturer. Static frames are captured too. The host validates order, dimensions, pixel format and plane bounds.
3. Electron owns the shared texture. A small asynchronous Node-API bridge duplicates its Linux native-pixmap DMA-BUF fd and transfers it with `SCM_RIGHTS` over a private UNIX socket. Socket waits run off the main thread; no process is launched per frame. IPC carries metadata and progress, never video pixel arrays or renderer-supplied fds.
4. A standalone FFmpeg library process imports the descriptor using `hwmap=mode=read+direct`, converts RGB to NV12 with `scale_vaapi`, and submits VA-API frames to `h264_vaapi` or `vp9_vaapi`. Direct import failure ends the job; there is no software encoding or CPU video readback fallback. Synchronization acknowledges the GPU read before Electron releases the texture.
5. Compressed VP9 packet metadata explicitly signals BT.709 limited-range color. Audio uses Beam's existing CPU mixer and temporary 48 kHz stereo float PCM. FFmpeg encodes AAC/Opus and remuxes with video stream copy. CPU orchestration, audio, compressed packets and file writes remain involved.
6. Only a completed native packet count and completed renderer permit publication. Existing staged-file sync/rename protects the destination. Cancellation and window teardown stop owned processes and release textures, PCM and socket directories.

FFmpeg runs separately to avoid symbol conflicts with Chromium's bundled codec libraries. See [Electron offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), [texture ownership](https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture), and [FFmpeg direct hardware mapping](https://ffmpeg.org/ffmpeg-filters.html#hwmap).

## Validation and limits

The opt-in hardware regression checks ordered and identical frames, decoded colors, MP4/AAC and WebM/Opus output, frame counts, duration, 4K resolution, decoded 4K video downscaled to 1080p, 1080p60 delivery and cancellation using real Electron and VA-API. Start a development Vite server, then point the test at its URL:

```sh
BEAM_TEST_FFMPEG_GPU=1 BEAM_TEST_RENDERER_URL=http://127.0.0.1:6500 \
  node --test --test-concurrency=1 test/ffmpeg-export-hardware.test.cjs
```

Validated locally on Intel Arc integrated graphics (i915), Intel media driver 26.1.5, FFmpeg 8.1.3 and Electron 44.5.1 on Linux/X11. This does not establish compatibility with all Linux GPUs. The desktop's existing X11 recorder remains unchanged. This path requires a functioning desktop display; it is not a new display-free CLI backend.

The hidden surface is explicitly resized to the requested output dimensions after construction, because Linux constrains initial window bounds to the display work area. Its offscreen pixel scale is fixed at 1 independently of desktop DPI. Shared-texture capture runs with a 1000 Hz scheduling ceiling, independently of the exported video's frame rate; presentation and texture ownership still serialize delivery. This scheduling rate is permitted by [Electron's shared-texture API](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), unlike the bitmap mode's 240 Hz limit. Unsupported native-pixmap layouts or unexpected surface dimensions fail explicitly; no bitmap path is substituted. Development renderer reloads and a renderer startup deadline terminate stalled jobs.

Reports separate Chromium presentation wait, native GPU import/conversion and native encode/mux time. Frame delivery also includes compositor capture and host IPC; the total backpressure measurement is not encoder utilization. Native setup and final flush are included in the native timings, so these are not additive pipeline stages. See [local before/after measurements](../performance/ffmpeg-gpu-export-2026-10-02.md); no speedup has been established on the 10,000-shape project.

GPU utilization diagnostics still measure **Electron GPU processes only**, excluding the separate native FFmpeg process. They therefore cannot establish native encoder utilization. The report identifies this scope and confirms the actual VA-API encoder and DMA-BUF transfer independently.
