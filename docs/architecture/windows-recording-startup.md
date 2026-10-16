# Windows recording startup

The supplied October 15, 2026 diagnostic contains one acquired screen frame, zero submitted frames, an empty MP4 and a failed screen track after 303 ms. Windows returned `0xC00D6D60` (`MF_E_TRANSFORM_TYPE_NOT_SET`). It establishes a native media-type negotiation failure before any screen sample was submitted, not the particular driver, transform or setting responsible.

Capture continues to use Windows Graphics Capture and owned, bounded GPU surfaces. Rust builds an explicit H.264/MP4 encoding profile with dimensions, bitrate, frame rate and square-pixel aspect ratios. It no longer mutates a `VideoEncodingQuality.Auto` camera preset, whose manually supplied settings Microsoft documents as ignored. This removes a configuration ambiguity; the diagnostic does not prove it was the reporter's trigger. At startup Rust selects between an accelerated MediaTranscoder candidate and a software H.264 candidate. Only recognized Media Foundation codec/type negotiation rejections allow the second candidate. Permission, disk, memory, device-loss, cancellation and timeout errors remain terminal. Both candidates share the existing ten-second initialization deadline.

Readiness requires the transcoder to request its first sample. A successful `PrepareMediaStreamSourceTranscodeAsync` alone is insufficient: `TranscodeAsync` can fail asynchronously before it requests that sample. The capture callback retains the first actual frame during selection. A rejected candidate releases its stream source and bounded sample worker before another candidate starts. Only the output newly created by that initialization can be reset; existing recordings are never opened for negotiation. There is no switch of encoder after samples start flowing.

Electron completes camera/audio sidecars even when screen capture fails. Completion resolves declared finalized screen segments and checks that a nonempty file exists. It sets `CaptureSession.screenMediaAvailable` independently of live native `screenAvailable`. This preserves camera/audio-only sessions and screen recordings whose source failed after an earlier valid segment. A failed session with no finalized screen media stays out of the automatic editor-opening path, retains its files and original capture error, and permits a new recording attempt. This check does not replace media decoding or recovery of incomplete containers.

Validation covers deterministic selection, 10,000 mixed starts, shared deadlines, terminal errors, combined HRESULT diagnostics, empty/partial media, sidecar completion and a health-triggered stop followed by a successful retry. The changed stop module has 100% statement, branch, function and line coverage. Linux runs the deterministic Rust tests; Windows tests compile with warnings denied from Linux.

Actual Windows encode/decode tests are required before release. The existing Windows CI `screen::` scope includes the new tests: the reported 1466 × 1178 at 60 fps, forced software encoding of GPU surfaces, simulated accelerated type rejection followed by real software encoding, and repeated software sessions. They verify decoded color rows, first-frame timestamp and timing. These tests use real Windows Media Foundation and FFmpeg; cross-compilation does not execute them or establish compatibility with a reporter's GPU driver.

Run the native regression and startup cases on Windows with FFmpeg installed:

```powershell
cargo test -p capture --features hardware-tests --lib screen::win::encoder:: -- --test-threads=1
cargo test -p capture --lib screen::win::async_wait:: -- --test-threads=1
```

References: [Microsoft capture-to-video guidance](https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture-video), [media encoding profile and Auto semantics](https://learn.microsoft.com/en-us/uwp/api/windows.media.mediaproperties.mediaencodingprofile?view=winrt-26100), [media transform input errors](https://learn.microsoft.com/en-us/windows/win32/api/mftransform/nf-mftransform-imftransform-processinput), [MediaTranscoder acceleration control](https://learn.microsoft.com/en-us/uwp/api/windows.media.transcoding.mediatranscoder.hardwareaccelerationenabled?view=winrt-26100).
