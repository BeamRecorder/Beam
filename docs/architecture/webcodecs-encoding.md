# WebCodecs encoder selection

`packages/encoder/src/mediabunny/video-encoder-selection.ts` selects the same video encoder for desktop and CLI. Video encoding uses WebCodecs through Mediabunny. There is no native video encoder transport.

For each container's codecs, selection checks hardware variable bitrate and then hardware constant bitrate using the export's width, height, frame rate, target bitrate and quality latency mode. WebM permits VP9, VP8 and AV1; MP4 retains AVC. A supported hardware configuration must encode one full-size test image and return a packet before selection accepts it. Probe pixels are CPU-backed to exercise buffer allocation without Chromium's GPU readback native-buffer crash. Probe output goes to a null target and is never included in the exported video.

When no hardware configuration works, selection checks explicit software WebCodecs configurations in the same codec and bitrate order. It never requests an unavailable hardware path again through `no-preference`. No export frame is dropped and no export pixels are copied to the CPU by the probe. Complete lack of a supported codec fails before output startup.

Reports expose the selected hardware preference, bitrate mode, hardware check (`passed`, `unsupported`, `failed`) and any frame-probe error. A passed check confirms one encoded packet; WebCodecs still does not expose which underlying implementation produced it. Native GPU counters measure busy time and remain separate evidence.

## Host activation

- Linux desktop enables `AcceleratedVideoEncoder` before Electron readiness, preserving other enabled features and explicit feature disables. It retains the app's X11 backend, sandbox and Chromium driver checks.
- Windows and macOS use Chromium's default Media Foundation/D3D and VideoToolbox backends. The Linux-only feature is not applied to those platforms. The shared capability and frame checks run on all three OSes.
- CLI software WebGL remains the displayless default. `BEAM_CHROMIUM_GPU=hardware` enables GPU rendering and the Linux encoder feature when applicable. GPU availability still depends on the browser build, driver and headless platform.

Chromium documents Linux activation in its [VA-API guide](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/vaapi.md). Its [encoder factory](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/media/gpu/gpu_video_encode_accelerator_factory.cc) selects the platform backends.

## Linux verification on 2026-10-02

On Electron 44.5.1 / Chromium 152, Intel Arc MTL, Mesa 26.2.3 and Fedora's Intel media driver 26.2.4, enabling the feature changes Chromium's video encoding status from disabled to enabled. Hardware AVC configuration is unavailable. Hardware VP9 and AV1 accept constant bitrate configuration but fail actual buffer allocation; the probe detects these failures before starting the export. Direct GPU-canvas encoding without that check crashes Chromium in its native-buffer handling.

The resulting software WebCodecs path encoded all 30 test frames at 1920×1080 in both MP4 and WebM without a GPU-process crash. This verifies safe selection on this machine; it does not establish a hardware export speedup or Windows/macOS hardware results.
