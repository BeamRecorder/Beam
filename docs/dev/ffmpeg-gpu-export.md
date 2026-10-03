# Experimental Linux GPU export

Linux desktop exports can opt into **FFmpeg GPU (experimental)** under Export → More options. Preview and capture keep their existing backends. The normal export option continues to use WebCodecs. The experimental path supports MP4/H.264 and WebM/VP9, with hardware VBR encoding, even dimensions from 2 to 8192, and integer frame rates from 1 to 120. Actual driver limits can be lower.

This is an application preference, also available under Preferences → General on Linux. Enabling or disabling it is saved through the desktop preference service (`extras.videoExportBackend`) and synchronized between open windows. It survives restarting Beam and applies to subsequent editor and Quick Snip video exports. Screenshot exports keep their image backend. Existing installations default to WebCodecs until this option is explicitly enabled; Windows/macOS ignore the Linux-only selection.

## Build and dependencies

Development builds need a C++17 compiler, `pkg-config`, Node.js development headers, FFmpeg development libraries (`libavcodec`, `libavutil`, `libavfilter`, `libavformat`), libva and libdrm development packages. Runtime uses the host's matching FFmpeg shared libraries, libva/libdrm and a functioning VA-API driver with the requested encoder and RGB DMA-BUF import support. `vainfo` reporting an encoding entrypoint is necessary but does not prove that import will work.

On Fedora, the development packages are typically `gcc-c++`, `pkgconf-pkg-config`, `ffmpeg-devel`, `libva-devel` and `libdrm-devel`. FFmpeg/Intel driver availability and patent-restricted codecs depend on the configured distribution repositories. Use the same repositories/versions for headers and runtime libraries. On Debian/Ubuntu the corresponding development packages are `g++`, `pkg-config`, `libavcodec-dev`, `libavutil-dev`, `libavfilter-dev`, `libavformat-dev`, `libva-dev` and `libdrm-dev`. Install the runtime `ffmpeg` command for AAC/Opus audio remuxing.

```sh
bun run build:ffmpeg-export
bun run electron:dev
```

The build creates `build/native/ffmpeg-export/beam-ffmpeg-export` and `beam-gpu-transport.node`. Both Linux CI and release jobs compile them before packaging. Linux packaging fails if either artifact is missing. AppImage, deb and rpm include only those two Beam artifacts under `resources/ffmpeg-export/`: no FFmpeg executable, FFmpeg shared library or codec dependency is copied into the application. The extracted AppImage is checked for executable startup against the CI system libraries, addon loading and the absence of bundled FFmpeg files; deb/rpm contents are checked for the two artifacts.

`beam-ffmpeg-export` links dynamically to the host's FFmpeg, libva and libdrm. Its required shared-library ABI must be installed on the target machine; an AppImage does not make that dependency portable. The transport uses stable Node-API v8 and links no FFmpeg libraries into Electron. Set `BEAM_NODE_INCLUDE` to the directory containing `node_api.h` if it is unavailable beside the active Node executable or in `/usr/include/node`. Ubuntu CI installs `libnode-dev` for those headers. Local Linux packaging requires `bun run build:ffmpeg-export` before `bun run electron:build`. Windows/macOS packaging does not include these files and their UI does not display the option.

Using system libraries avoids distributing FFmpeg libraries with Beam; dynamic linking or running a separate process alone does not establish license compliance. FFmpeg's LGPL/GPL terms depend on its build configuration. See [FFmpeg's official licensing guidance](https://ffmpeg.org/legal.html) before distributing a backend linked against a particular build.

`BEAM_FFMPEG_DRM_DEVICE` selects the render node, defaulting to `/dev/dri/renderD128`. The device must be compatible with Electron's rendering GPU. There is no automatic multi-GPU migration. `CXX` selects the compiler; `BEAM_FFMPEG_BUILD_FLAGS` can provide trusted local include/link flags instead of pkg-config for development.

## CLI and agent use

The CLI selects its backend explicitly, independently of the desktop preference:

```sh
bun run beam export request.json output.mp4 --backend ffmpeg-vaapi
beam-cli export request.json output.webm --backend ffmpeg-vaapi
beam-cli export request.json output.mp4 --backend webcodecs
```

Use a portable, complete render snapshot as documented in [the CLI data contract](../ARCHITECTURE.md#cli-data-and-backend-contract). Both backends use Beam's common renderer. Chromium renders the frames; FFmpeg imports GPU textures, converts them and encodes the result. FFmpeg does not reinterpret the document or replace its visual effects with a filter graph. Successful results and timing diagnostics are JSON on stdout, with the common video metrics at `diagnostics.runtime`; the CLI FFmpeg host reports browser environment data as unavailable (`environment: null`). `--overwrite` is required to replace an existing destination.

The FFmpeg path requires Linux, an X11/XWayland `DISPLAY`, compatible VA-API drivers and the native artifacts above. It opens no editor and needs no running Beam application, but it requires a functioning display. The installed CLI reuses Beam's Electron executable; development uses workspace Electron. `BEAM_ELECTRON_EXECUTABLE` and `BEAM_FFMPEG_EXPORT_DIRECTORY` can override trusted executable/artifact locations. WebCodecs remains the default cross-platform, display-free Chromium backend. PNG/WebP and individual frame exports use that browser backend.

For the independent WebCodecs Chromium host, `BEAM_CHROMIUM_GPU=hardware` requests hardware rendering. If that Chromium/driver combination fails video decoding, `BEAM_CHROMIUM_VIDEO_DECODE=software` disables its accelerated decoder while retaining the selected renderer. The default is `auto`. This setting applies only to the independent Chromium host, including still/frame and HTML motion jobs; it does not change the experimental Electron/FFmpeg host or guarantee hardware encoding. Diagnostics identify the encoder actually selected.

`packages/electron-export` owns the reusable offscreen window, narrow IPC, GPU texture leases and native process lifecycle. `packages/encoder/src/gpu-export` owns browser rendering and frame submission. Desktop and CLI supply their own asset delivery, paths and staged files. The CLI denies permissions and terminates its owned process group on interruption; cancellation and errors preserve existing destinations and remove partial output.

The isolated CLI GPU host disables Chromium's display frame-rate limiter before startup; authored output FPS and frame ordering remain explicit. This switch is confined to the export process, since desktop shares its Chromium process with interactive windows. Local paired trials showed a modest, variable delivery improvement rather than encoder saturation; see [the CLI comparison](../performance/cli-4kexport-2026-10-03.md).

## Frame ownership and transfer

1. A dedicated sandboxed, hidden offscreen Electron renderer uses the same encoder video/audio pipelines and runtime painters as normal export. It has no Vue UI or general desktop preload.
2. Offscreen capture starts paused and is paused again as soon as each texture is retained. Chromium can render the next image during native processing. After an animation-frame boundary, one frame IPC waits for queue capacity and resumes the GPU capturer; there is no separate per-frame preparation IPC. Static frames are captured too. The host validates order, dimensions, pixel format and plane bounds.
3. Electron owns the shared texture. A small asynchronous Node-API bridge duplicates its Linux native-pixmap DMA-BUF fd and transfers it with `SCM_RIGHTS` over a private UNIX socket. Socket waits run off the main thread; no process is launched per frame. IPC carries metadata and progress, never video pixel arrays or renderer-supplied fds.
4. Captured textures enter a bounded FIFO: at most three leases, with a smaller capacity for large surfaces based on an estimated 128 MiB BGRA retention budget (at least one frame). Capture acknowledgement allows Chromium to prepare the next frame while the native process reads an earlier one. Native transfer remains ordered, and each texture stays retained until its native acknowledgement. This overlaps rendering with GPU conversion/encoding without copying video pixels to CPU memory.
5. A standalone FFmpeg library process imports the descriptor using `hwmap=mode=read+direct`, converts RGB to NV12 with `scale_vaapi`, and submits VA-API frames to `h264_vaapi` or `vp9_vaapi`. Direct import failure ends the job; there is no software encoding or CPU video readback fallback. Synchronization acknowledges the GPU read before Electron releases the texture.
6. Compressed VP9 packet metadata explicitly signals BT.709 limited-range color. Audio uses Beam's existing CPU mixer and temporary 48 kHz stereo float PCM. FFmpeg encodes AAC/Opus and remuxes with video stream copy. CPU orchestration, audio, compressed packets and file writes remain involved.
7. Queue draining, a completed native packet count and a completed renderer are required before publication. Existing staged-file sync/rename protects the destination. Cancellation and window teardown stop owned processes and release queued textures, PCM and socket directories; a texture being read remains retained until that transfer ends.

FFmpeg runs separately to avoid symbol conflicts with Chromium's bundled codec libraries. See [Electron offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), [texture ownership](https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture), and [FFmpeg direct hardware mapping](https://ffmpeg.org/ffmpeg-filters.html#hwmap).

## Validation and limits

The opt-in hardware regression checks ordered and identical frames, decoded colors, MP4/AAC and WebM/Opus output, frame counts, duration, 4K resolution, decoded 4K video downscaled to 1080p, 1080p60 delivery and cancellation using real Electron and VA-API. Start a development Vite server, then point the test at its URL:

```sh
BEAM_TEST_FFMPEG_GPU=1 BEAM_TEST_RENDERER_URL=http://127.0.0.1:6500 \
  node --test --test-concurrency=1 test/ffmpeg-export-hardware.test.cjs
```

Validated locally on Intel Arc integrated graphics (i915), Intel media driver 26.1.5, FFmpeg 8.1.3 and Electron 44.5.1 on Linux/X11. This does not establish compatibility with all Linux GPUs. The desktop's existing X11 recorder remains unchanged. Both desktop and experimental CLI GPU export require a functioning display.

The hidden surface is explicitly resized to the requested output dimensions after construction, because Linux constrains initial window bounds to the display work area. Its offscreen pixel scale is fixed at 1 independently of desktop DPI. Shared-texture capture runs with a 1000 Hz scheduling ceiling, independently of the exported video's frame rate; captures remain sequential while the bounded queue overlaps capture and native submission. This scheduling rate is permitted by [Electron's shared-texture API](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), unlike the bitmap mode's 240 Hz limit. Unsupported native-pixmap layouts or unexpected surface dimensions fail explicitly; no bitmap path is substituted. Development renderer reloads and a renderer startup deadline terminate stalled jobs.

Reports separate Chromium presentation, texture capture, transfer/acknowledgement, native GPU import/conversion and native encode/mux time, and include peak retained frames and queue capacity. Queue capacity waits and final draining count toward backpressure; that measurement is not encoder utilization. Capture and transfer can overlap, and native timings include setup and final flush, so these are not additive pipeline stages. See [CLI before/after measurements](../performance/cli-4kexport-2026-10-03.md) and [earlier desktop measurements](../performance/ffmpeg-gpu-export-2026-10-02.md); no speedup has been established on the 10,000-shape project.

GPU utilization diagnostics still measure **Electron GPU processes only**, excluding the separate native FFmpeg process. They therefore cannot establish native encoder utilization. The report identifies this scope and confirms the actual VA-API encoder and DMA-BUF transfer independently.
