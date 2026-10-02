# GPU drivers and WebCodecs export

Beam exports video with WebCodecs through Chromium. Chromium uses the operating system's media and graphics drivers underneath that API. Installing a VA-API driver does not introduce a native encoder into Beam.

Hardware rendering, decoding and encoding are separate capabilities. A working WebGL canvas or accelerated video playback does not establish that WebCodecs can encode its frames. CBR (`constant`) and VBR (`variable`) are rate-control modes; neither forces hardware encoding or 100% GPU utilization.

## Platform requirements

| Platform | Driver or service | What it provides |
| --- | --- | --- |
| Linux, recent Intel GPUs | Intel media driver (`iHD`), libva, Mesa graphics/GBM and the kernel graphics driver | VA-API codec capabilities, graphics rendering and native image buffers. The media driver has full-feature and reduced-feature builds. |
| Linux, AMD GPUs | Mesa VA-API and graphics drivers, plus the kernel graphics driver | Codec capabilities depend on the GPU and the distribution's enabled codecs. Fedora documents additional packages for restricted codecs. |
| Linux, NVIDIA GPUs | NVIDIA graphics driver and a compatible Chromium media backend | NVENC availability alone does not establish WebCodecs compatibility. The upstream `nvidia-vaapi-driver` documents decoding support only. |
| Windows | The GPU's Windows driver and Chromium's Media Foundation/D3D backend | Hardware codec and surface-sharing support; update through the computer manufacturer or GPU vendor. |
| macOS | macOS graphics/media services and Chromium's VideoToolbox backend | Hardware codec and surface-sharing support; update through macOS Software Update. |

Linux desktop enables `AcceleratedVideoEncoder` and retains X11/XWayland. Windows and macOS use their default Chromium backends. Beam retains the sandbox and driver checks. Driver installation cannot guarantee success in every Chromium build, codec, resolution or bitrate mode.

Sources: [Chromium VA-API support and activation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/vaapi.md), [Fedora driver guidance](https://fedoraproject.org/wiki/Hardware_Video_Acceleration), [Intel feature/build tables](https://github.com/intel/media-driver#build-options), [NVIDIA VA-API codec support](https://github.com/elFarto/nvidia-vaapi-driver#codec-support), [Intel Windows driver installation](https://www.intel.com/content/www/us/en/support/articles/000005629/graphics/processor-graphics.html), [macOS updates](https://support.apple.com/en-us/108382).

## Installing the Intel media driver on Linux

Use packages matching the distribution and release. These commands concern recent Intel GPUs; they are not a general installation recipe for AMD, NVIDIA or older Intel hardware.

### Fedora

Fedora provides `libva-intel-media-driver`. The full-feature `intel-media-driver` package is available through RPM Fusion's nonfree repository; configure that repository using [RPM Fusion's instructions](https://rpmfusion.org/Configuration) before running:

```bash
sudo dnf install intel-media-driver libva-utils
```

On the Fedora 44 x86_64 packages examined here, the full driver lives at `/usr/lib64/dri-nonfree/iHD_drv_video.so`. Fedora's libva searches that directory before `/usr/lib64/dri`. Installing the full package therefore changes which `iHD` implementation is loaded; check `vainfo` after installation and fully quit/relaunch Beam. A permanent `LIBVA_DRIVERS_PATH` override is unnecessary for that package layout.

The existing Mesa graphics/GBM packages also matter, but replacing the media driver does not replace their native-buffer implementation. `libva-utils` supplies diagnostic tools; it does not add codec support by itself. Installing FFmpeg codecs is not a fix for Beam's WebCodecs encoder.

### Debian and Ubuntu

With the appropriate nonfree/multiverse repository enabled for the distribution:

```bash
sudo apt install intel-media-va-driver-non-free vainfo
```

The package is documented by [Debian](https://packages.debian.org/stable/intel-media-va-driver-non-free) and [Ubuntu](https://packages.ubuntu.com/questing/intel-media-va-driver-non-free). Intel describes how its full-feature and free-kernel builds differ. These instructions have not been validated with a Beam hardware export on Debian or Ubuntu.

### Arch Linux

```bash
sudo pacman -S --needed intel-media-driver libva-utils
```

[Arch's package](https://archlinux.org/packages/extra/x86_64/intel-media-driver/) targets Broadwell and newer Intel GPUs. A Beam hardware export has not been validated here on Arch.

## Verify the effect of a driver change

Record the OS, kernel, GPU, graphics/media driver versions and Beam/Chromium versions before and after the change. On Linux, query the intended render device directly:

```bash
vainfo --display drm --device /dev/dri/renderD128
```

Choose the appropriate device on a machine with multiple GPUs. For Intel, `LIBVA_DRIVER_NAME=iHD` can select the media-driver family when diagnosing driver discovery. A `VAEntrypointVLD` entry establishes decoding support; encoding needs `VAEntrypointEncSlice` or `VAEntrypointEncSliceLP`. Neither proves that Chromium can import the image buffers used by Beam.

After restarting Beam, export the same short project with the same container, dimensions, frame rate and preset. Compare **Hardware Acceleration Request**, **Encoder Bitrate Mode**, **Hardware Encoder Check**, any probe error, throughput and per-engine native GPU counters in the export report. Beam verifies a supported configuration by encoding a full-size test image before accepting it; see [encoder selection](../architecture/webcodecs-encoding.md).

A successful packet check verifies that the requested path works for the test image. WebCodecs still does not disclose the actual encoder implementation. GPU video-engine activity provides additional evidence; render-engine utilization alone does not establish hardware encoding. An end-to-end export must also finish with every expected frame before calling a driver change successful.

## Verified Intel Arc MTL results — 2026-10-02

Host: Fedora 44, kernel 7.2.8-200.fc44.x86_64, Intel Core Ultra 5 125H / Arc MTL, Mesa 26.2.3, libva 2.23.0, Electron 44.5.1 / Chromium 152. GPU-canvas tests requested hardware encoding at 1920×1080, 30 fps, 5.91 Mbps, constant bitrate and quality latency, with the normal sandbox and driver checks.

| Isolated test | Measured result | What it establishes |
| --- | --- | --- |
| Installed Fedora `libva-intel-media-driver` 26.2.4 | No H.264 profiles. VP9/AV1 hardware CBR configurations accepted; actual frames fail. | CBR configuration is available, but the current frame path does not work. |
| RPM Fusion `intel-media-driver` 26.1.5 | H.264 profiles and encoding entrypoints appear; WebCodecs accepts H.264 hardware CBR. GPU-canvas encoding returns zero packets and crashes the diagnostic GPU process. | The full driver enables H.264 discovery, but does not fix this export failure. |
| System Mesa GBM | An NV12 buffer requested with scanout + linear usage cannot be allocated; RGB buffers can. | A native-buffer limitation exists independently of codec discovery. |
| Isolated Chromium OS minigbm with its i915 backend | The same NV12 allocation/export succeeds. VP9 and H.264 WebCodecs GPU-canvas encoding still produce zero packets and crash the diagnostic GPU process. | Changing that allocator alone is insufficient; it is not a Beam workaround. |
| Chromium 154 with the installed media driver | VP9 hardware CBR is accepted; actual CPU/GPU-canvas frame tests still fail. | This browser upgrade alone did not resolve the issue in these tests. |

For the isolated experiments above, the RPM Fusion driver was downloaded from its Fedora 44 repository, its package signature was verified against the distribution's RPM Fusion key, and it was extracted into a temporary directory. `LIBVA_DRIVERS_PATH` selected it only for the diagnostic processes. minigbm was compiled from [upstream commit a2d42f09](https://chromium.googlesource.com/chromiumos/platform/minigbm/+/a2d42f09d696b04e6ded5ad38596d8554ffd8988) and loaded only by isolated tests. Those experiments replaced no system driver, system library, desktop configuration or application package, and neither experimental library is shipped with Beam.

These results do not demonstrate working hardware CBR export on this host or a performance improvement. The remaining failure is in Chromium's native image-buffer path. A driver can expose a codec while that path still fails; report both results rather than marking the machine hardware-ready from `vainfo` or `isConfigSupported()` alone. Windows/macOS hardware results remain unverified from this Linux host.

After the user installed `intel-media-driver` 26.1.5 and `libva-utils` system-wide, a fresh Electron process loaded the full driver without temporary overrides. H.264 hardware configurations accepted both VBR and CBR; VP9/AV1 accepted CBR. Running Beam's actual shared encoder selector at the same 1080p/30 fps/5.91 Mbps settings still failed its hardware image probes with `Unable to create a mappable shared image` / `Encoding error`. It selected explicit software AVC for MP4 and software VP9 for WebM, with `hardwareEncoderCheck: failed`. The CPU-backed probes did not crash the GPU process. This confirms that installation fixes H.264 discovery while the native-buffer failure remains.
