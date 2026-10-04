# Investigating WebCodecs image buffers on Linux

This investigation concerns Fedora 44, Intel Arc MTL, Mesa 26.2.3, the full Intel media driver 26.1.5, and Electron 44.5.1 / Chromium 152 on 2026-10-02. It does not establish a hardware export fix or Windows/macOS results.

## Reproduce without the editor

```bash
bun run diagnose:webcodecs > webcodecs-avc.json
bun run diagnose:webcodecs --codec=vp9 --bitrate-mode=constant > webcodecs-vp9.json
```

The default profile matches the reported export: AVC High, 1920 × 1080, 30 fps, 5.91 Mbps, constant bitrate and quality latency. `--width=3840 --height=2160` checks a 4K image path; the AVC codec string retains its original profile/level, so an unsupported result is possible. Dimensions are bounded to 4096 and must be even. This is a functional check, not a representative export benchmark.

Each of four cases runs in its own hidden, sandboxed Electron application: CPU Canvas2D and GPU WebGL2 inputs, each with explicit software and hardware requests. The test submits 30 changing images and requires 30 output packets plus nonempty output after flushing. It reports configuration support, the first frame's pixel format, packet/byte counts, errors, native GPU-process crashes and Chromium versions. It opens no Beam project and shares no GPU process with a running editor. A native GPU crash can produce an OS crash dump.

JSON goes to stdout; progress goes to stderr. Exit status 1 indicates invalid arguments or a diagnostic host failure. Hardware rejection is a completed measurement, not a command failure. Every case has a 20-second host deadline. Temporary profiles are removed after the diagnostic. Linux retains X11/XWayland through the original process argument; Windows/macOS retain their platform defaults. Their hardware behavior must be verified on those systems.

## Measured failure

| AVC CBR case | Result |
| --- | --- |
| CPU image, software request | 30/30 packets; no GPU crash |
| GPU image, software request | 30/30 packets; no GPU crash |
| CPU image, hardware request | Configuration accepted; zero packets; `Unable to create a mappable shared image` |
| GPU image, hardware request | Configuration accepted; zero packets; diagnostic GPU process exits with code 133 |

The diagnostic bypasses Beam's renderer, editor and Mediabunny. It reproduces the failure directly with `VideoEncoder`, rather than attributing it to the timeline or scene complexity.

[Recorded AVC and VP9 results](webcodecs-buffer-results-2026-10-02.json) retain the actual packet counts, errors, versions and GPU crash events. VP9 CBR produced the same pass/failure pattern.

## Chromium's buffer path

In the examined Chromium version:

1. `VideoEncodeAcceleratorAdapter::InitializeOnAcceleratorThread` selects GPU-memory-buffer input on Linux. CPU images are consequently copied into an NV12 mappable shared image before submission, rather than sent through the accelerator's shared-memory input path. See [the adapter](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/media/video/video_encode_accelerator_adapter.cc).
2. X11's `OzonePlatformX11::IsNativePixmapConfigSupported` returns `false`. This is a platform implementation decision, not a libva codec capability query. See [the X11 backend](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/ui/ozone/platform/x11/ozone_platform_x11.cc).
3. `SharedImageFactory` consults that capability when creating native buffers. Its alternative shared-memory backing is not a native DMA-BUF. See [the factory](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/gpu/command_buffer/service/shared_image/shared_image_factory.cc).
4. VA-API's native input expects a mappable NV12 frame backed by a native pixmap. `CreateGpuMemoryBufferHandle` checks `handle.type == gfx::NATIVE_PIXMAP`. The recorded GPU crash's instruction address corresponds to this type check, rather than the subsequent file-descriptor duplication check. See [buffer extraction](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/media/gpu/chromeos/platform_video_frame_utils.cc) and [VA-API input handling](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/media/gpu/vaapi/vaapi_video_encode_accelerator.cc).

These findings identify a mismatch between the requested accelerator input and the supplied backing. They do not establish that returning `true` unconditionally, suppressing the native type check, or replacing a system library would make encoding correct. Native buffer allocation, format/modifier support, ownership and synchronization must all work.

Additional isolated tests with the installed driver produced no hardware packets: Electron under Wayland, Google Chrome 154.0.8037.92 under Wayland, and directly re-encoding hardware-requested decoder output. That decoder returned BGRA, including with Linux zero-copy decoding features enabled, so it did not provide a native NV12 bypass. A temporary minigbm allocator under Wayland stalled the diagnostic and hit its deadline. No allocator or display-backend change from these experiments is shipped with Beam.

Electron's experimental `sharedTexture` API supports importing native NV12 handles, but the examined implementation wraps them as opaque shared images while this VA-API encoder requires mappable shared images. That API therefore does not, by itself, establish a working encoder input. See [Electron's implementation](https://github.com/electron/electron/blob/v44.5.1/shell/common/api/electron_api_shared_texture.cc).

## What constitutes a correction

A browser/backend correction must provide a supported native NV12 backing to this input path, or explicitly negotiate another accelerator-supported storage path. The direct diagnostic must then produce every expected packet. Beam's shared selector and a complete edited project export must also succeed before accepting the change. Any throughput claim requires comparing the same exported project and settings.

Changing the hardware preference or bitrate mode cannot manufacture native buffers. The examined code exposes no WebCodecs option to choose this internal Linux storage path. A Chromium/Electron source correction or a demonstrably working browser/backend combination is needed; a JavaScript-only flag change has not been demonstrated here.

The exported project's report selects `prefer-software` after its hardware check fails. Its approximately 95% encoder/wait share measures the selected software pipeline; it does **not** measure 95% time transferring images to a hardware encoder. Fixing hardware frame submission is a prerequisite to evaluating that hardware pipeline's speed.

## Resources is a separate measurement problem

Resources 1.10.2 has an [upstream report of Intel encode/decode graphs stuck at 0%](https://github.com/nokyan/resources/issues/653). Its [Intel device-counter implementation](https://github.com/nokyan/resources/blob/v1.10.2/src/utils/gpu/intel.rs) marks separate device encode/decode queries as unimplemented and identifies a combined media engine. Those graph values alone cannot establish that an Intel media engine is idle. This does not explain away WebCodecs's actual zero-packet error.

Beam's Linux DRM measurements report the application's GPU-process engine busy times. The video counter can include decoding, encoding and other windows; it does not identify this export's encoder implementation. Compare working packets, the selected preference and independent counters, and retain unavailable measurements as unavailable.
