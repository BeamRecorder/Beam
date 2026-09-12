# Startup measurements — 2026-09-12

Measured the real Electron 43.4.1 application with production Vite assets and the release Rust capture engine on Fedora 44 / Wayland, with an Intel GPU. Each launch used a fresh temporary Beam profile and project directory. Onboarding was completed; system audio was enabled, camera and microphone were initially off. Chromium enumerated the real devices (3 audio inputs, 1 video input, 6 audio outputs).

All graphical runs used a private headless Mutter compositor, a private D-Bus session and temporary XDG configuration/data/cache directories, following argui's `scripts/linux-hidden-display.sh`. The original PipeWire/PulseAudio socket paths were passed explicitly so the benchmark exercised real audio hardware. The Portal service was started before the timed comparison series. No window was presented on the user's desktop. The update network check was disabled in the measurement wrapper; product update behavior was unchanged.

Times start when the Electron measurement entry executes, before requiring Beam's main module. They exclude process-loader time before that entry. Paint comes from Chromium's first-contentful-paint event; readiness comes from the real recording button becoming enabled after device discovery. Audio readiness is completion of the native system-audio-preview request. These are process-cold launches with warm OS file caches, not machine-reboot measurements.

## Final alternating comparison

Three launches of each version, alternated before/after on the same private compositor, with no build or test suite running concurrently. The before version is a saved copy of the working tree immediately before the performance changes (including the expanded HUD topbar).

| Measurement, median | Before | After |
| --- | ---: | ---: |
| HUD ready to record | 3,269 ms | 1,515 ms |
| Native system audio preview ready since launch | 3,295 ms | 1,542 ms |
| HUD first contentful paint | 1,427 ms | 1,493 ms |
| HUD wait for native discovery, including command queue | 2,107 ms | 433 ms |
| Native system audio opening request itself | 38 ms | 25 ms |
| Browser device enumerations per launch | 2 | 1 |
| Preference update duration, observed range | 406–696 ms | 0.66–2.61 ms |

HUD readiness improved by 54%, and system audio became available 53% sooner. First paint did not show a reliable improvement: the main gain is removing the disabled period after the HUD appears. Discovery latency in the table includes waiting behind the early capability probe; it is not the total duration of Rust's warmup.

| Run | Before paint | After paint | Before HUD ready | After HUD ready | Before audio ready | After audio ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,570 ms | 1,493 ms | 3,269 ms | 1,515 ms | 3,295 ms | 1,542 ms |
| 2 | 1,427 ms | 1,844 ms | 3,951 ms | 2,019 ms | 4,026 ms | 2,062 ms |
| 3 | 1,351 ms | 1,427 ms | 3,080 ms | 1,424 ms | 3,119 ms | 1,450 ms |

## Device checks

Two additional before/after pairs selected the real microphone and camera through the HUD menus. Microphone requests completed in 58–76 ms before and 43–50 ms after. Camera selection made two video `getUserMedia` requests before and one after. Both versions delivered actual camera frames. Time from selection acknowledgement to first frame varied: 381–817 ms before and 678–772 ms after; no camera-latency improvement is claimed from these samples. Removing the duplicate open prevents competing camera consumers, particularly relevant to Windows hardware allocation.

## Changes responsible

- The eagerly prepared countdown window mounts its own lightweight entry and the shared theme store, without loading App, HUD, recording controllers, translation dictionaries or the motion plugin.
- Linux starts native capability discovery while Chromium initializes. Rust caches successful FFmpeg results and briefly reuses failures (two seconds) so a failed warmup is not immediately repeated. The normal HUD source discovery remains authoritative.
- FFmpeg's version/encoder/muxer inventories overlap. Hardware trials remain sequential and preserve priority. A complete PCI/DRM inventory avoids testing vendor-specific encoders for absent GPU vendors; unknown inventories keep all candidates, and positive NVIDIA device/container hints retain NVENC in filtered PCI namespaces. Output pipes are drained concurrently so large inventories do not stall until timeout.
- Microphone/camera discovery shares one in-flight Chromium enumeration and does not open temporary streams for labels. Browser devices restore independently of native discovery, and the overlay owns the single camera preview stream.
- Window thumbnails load on the selected tab, with the existing refresh/cache behavior. Shortcut subscriptions are installed before discovery completes.
- Ordinary preference changes no longer unregister and re-register all global shortcuts. Actual shortcut changes and resets still register serially.

## Validation and limits

113 focused Vue/TypeScript tests and 37 focused Electron tests passed. Targeted coverage: 96.87% statements, 92.51% branches, 96.29% functions, 98.63% lines. The 17 affected Rust probe/cache/inventory tests, package Clippy, Rust formatting, Vue typecheck, production build and changed-file lint passed.

This validates Linux hardware behavior in a hidden Wayland session. Windows/macOS physical capture and permission flows were not run; the Linux warmup is explicitly disabled there. The compositor and GPU initialization add variance, so these results are not a promise of identical timings on the normal desktop or other machines. No claim is made about idle CPU or memory improvement. A final smoke run with a fresh, unprimed private Portal service took 2.90 s to HUD readiness; it verified the rebuilt binary, the visible countdown digit, real microphone selection and one camera stream delivering frames. This cold-service check is not included in the paired medians.

Local measurement artifacts for this session: `/tmp/beam-final-{before,after}-{1,2,3}.json` and `.png`, `/tmp/beam-devices-{before,after}-{1,2}.json`, `/tmp/beam-performance-summary.json`, and `/tmp/beam-startup-verified.json` (final rebuilt-binary smoke). The instrumented launcher and private-display batch are `/tmp/beam-startup-profile.cjs`, `/tmp/beam-startup-preload.cjs`, and `/tmp/beam-profile-final.sh`; they use temporary profiles and must only be launched through the private compositor helper.


## Screenshot export follow-up — 2026-09-12

The Quick Snip status now has a dedicated renderer entry, prewarmed while choosing Screenshot. It stays hidden until native capture finishes, shows the source image while processing, and receives a thumbnail of the styled canvas before clipboard encoding. Native blur releases stale focus so completed output dismisses after five seconds without interaction. Portal screenshot intents skip video/audio capability discovery.

A private Mutter/Wayland desktop with actual Electron windows, the production preload, status component and IPC handshake verified:

- Cold development renderer readiness: 822–1,454 ms, entirely while hidden.
- Prewarmed native presentation and processing DOM/image readiness: 3–12 ms after the processing update; the compositor was allowed another 200 ms before checking the captured window pixels.
- Completed native window destruction: 4,987–4,989 ms after blur deactivated its controls.
- No App/HUD, recording-controller or video-export module requested by the screenshot status renderer.

The PNG benchmark used deterministic high-entropy BGRA frames in an isolated Rust harness with the production conversion and png 0.18.1 encoder. It measured encoding/file writing, excluding source selection and screen capture. A 3840×2160 frame took about 12.66 s with the old unoptimized development dependencies; optimized PNG dependencies plus lossless Fast compression took 0.33–0.62 s across runs, with source size increasing from 27.2 to 31.6 MiB. This is a deliberately demanding synthetic image, not an end-to-end capture latency promise. PNG decode/round-trip tests verify exact pixel preservation and atomic publication/cleanup.

Validation: focused Vue tests (143, plus 10 App regression cases), focused Electron tests (149), screenshot Rust unit tests (11) and physical-display protocol tests (2) passed. Scoped Vue coverage: 97.90% statements, 96.62% branches, 94.11% functions and 99.50% lines. Vue type checking, release application build, Linux Clippy and Windows cross-compilation passed. The separate plain TypeScript checker still reports two pre-existing Vue component-ref typing errors in `components/projects/useProjectPicker.ts:117,126`. Windows Clippy additionally reports a pre-existing `chunks_exact_mut(4)` lint in `cursor/win/capture.rs:350`. macOS cross-compilation requires the missing Apple Swift/SDK toolchain; the native Windows/macOS capture and mixed-DPI monitor paths still need on-device verification. The private Linux compositor has no PipeWire service, so it verifies the actual pill window, not an interactive Portal capture.

Windows region capture now resolves the selected display through `resolve-display`: Electron converts its center from DIP to physical pixels using [screen.dipToScreenPoint](https://www.electronjs.org/docs/latest/api/screen#screendiptoscreenpointpoint-windows-linux), and Rust calls MonitorFromPoint in a temporary Per-Monitor V2 DPI context. No monitor ordering, size matching or unrelated saved capture ID is used.
