# Editor loading audit

Measured on 2026-09-30 with Electron 44.5.1 and production bundles on Linux/X11.
Each trial started a fresh Electron process and temporary Chromium/user profile.
Three alternating before/after pairs opened each of two copied real projects;
the original projects were never written. The project catalogue retained its
real size, with unrelated media omitted from the temporary copy. Checks and
builds had finished before the timed trials. OS file caches were not cleared.

The baseline is the production build immediately before this editor-loading
change. Both versions use the same native engine, dependency versions and video
decode flags. Hardware video decoding failed in this environment, so both used
`--disable-accelerated-video-decode`; GPU composition remained enabled. These
are local comparisons, not cold OS-boot measurements or cross-platform promises.

## Results

Times start at the HUD's editor-open request. Presentation means the native
renderer-ready gate completed; preview means the first playback load settled
and its loading cover finished leaving. It does not wait for all audio waveform
refinements or every timeline thumbnail.

| Median of three trials | Before | After | Change |
| --- | ---: | ---: | ---: |
| Simple project: first visible preview | 2,063 ms | 1,696 ms | 18% faster |
| Camera, audio and imported media: first visible preview | 3,165 ms | 1,856 ms | 41% faster |
| Simple project: native presentation | 792 ms | 826 ms | No demonstrated improvement |
| Camera/audio project: native presentation | 858 ms | 720 ms | 16% faster |
| Simple project: main-thread task time above 50 ms | 703 ms | 499 ms | 29% less |
| Camera/audio project: main-thread task time above 50 ms | 1,664 ms | 637 ms | 62% less |

Preview ranges were 1,993–2,278 ms before versus 1,678–1,840 ms after for the
simple project, and 2,628–3,468 ms versus 1,851–2,112 ms for the camera/audio
project. The task metric sums the excess over 50 ms for renderer long tasks up
to visible preview; it is not a Lighthouse TBT score. Some initialization tasks
remain long: the largest task in the camera/audio trials had a median of 595 ms
before and 336 ms after.

Peak renderer working set was approximately 451 → 438 MiB for the simple
project and 640 → 658 MiB for the camera/audio project. This does **not** establish
a general memory reduction. Earlier preview readiness also samples ongoing
decode/analysis at a different point. The worker and its GPU context terminate
when the final waveform component releases them; transferred images close after
painting or rejection.

## What changed

- A CPU profile attributed about 494 ms to waveform renderer setup and 255 ms
  to drawing on the interface thread. One shared waveform Worker now owns shader
  compilation, GPU rendering and readback. The UI receives an image bitmap;
  stale replies cannot overwrite a newer canvas. A subsequent CPU trace shows
  no waveform shader compilation/draw work on the interface thread.
- Saved editor state and presets load in parallel. Playback waits until saved
  settings and composition are restored, avoiding the initial decode of a
  composition that will immediately be replaced. Scope disposal invalidates
  outstanding initialization and playback completions.
- Completed recordings resolve their known project ID directly instead of
  scanning the entire project library.
- The loading cover no longer waits an artificial minimum of 300 ms. Its exit
  animation takes 160 ms rather than 320 ms.
- The HUD preparation view has no titlebar and uses one translated status with
  a cloud/loading morph. Its final confirmed stages say “Almost there!” in all
  15 supported languages. Cancel invalidates pending work, destroys only the
  pending owned editor and preserves the saved project.
- Mascot Lab has no renderer entry, native window, toolbar action or runtime
  import. Prototype code remains under `src/components/brand/lab/`.

## Remaining costs

Project JSON IPC took milliseconds to tens of milliseconds in these trials,
far less than the media and UI initialization path. Background font/artwork
preparation, first media decoding, thumbnail workers and initial component
layout remain work to investigate with the same fixtures. A development-only
Chrome trace reported about 23 ms in scroll-shadow layout reads and 14 ms in
button overflow measurements, with no estimated metric savings; these were not
the primary bottleneck. Development HTTP/import-chain insights do not describe
Electron's production local-file loading.

Further work should measure GPU video decoding on supported hardware, isolate
per-asset first-frame costs for camera/imported media, and capture longer memory
profiles through idle and project close. Windows/macOS native behavior and
decoding need checks on those platforms. No Windows/macOS performance claim is
made by this audit.

## Repeating an inspection without showing windows

Build the renderer, then run the isolated harness:

```sh
bunx vite build
BEAM_EDITOR_PROFILE_SOURCE=/absolute/path/to/project-folder \
BEAM_CAPTURE_ENGINE=/absolute/path/to/capture-engine \
BEAM_EDITOR_PROFILE_OUTPUT=/tmp/beam-editor-profile.json \
node_modules/.bin/electron scripts/performance/profile-editor.cjs --ozone-platform=x11
```

The harness now suppresses native Show/Focus calls for all its windows and
disables background throttling. It checks that no profiling window becomes
visible. User data and media writes stay in its temporary profile. Optional
`BEAM_EDITOR_PROFILE_ROOT` selects another production build, and
`BEAM_EDITOR_PROFILE_TRACE` writes the editor renderer's CPU profile.

Hidden trials measure presentation **readiness**, not native first show, and
hidden renderer animation/paint cadence can differ from onscreen rendering.
Compare hidden trials with hidden trials; do not mix them with the native-visible
measurements above. Electron's
[initially hidden painting behavior](https://www.electronjs.org/docs/latest/api/browser-window#using-the-ready-to-show-event)
allows the renderer to initialize while its native window remains hidden.
