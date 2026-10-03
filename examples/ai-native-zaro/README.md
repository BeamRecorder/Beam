# ai-native-zaro

A separate Beam project reconstructing the supplied Zaro launch film in HTML, CSS, JavaScript and GSAP: **1920 × 1080, 30 fps, 68.6 seconds**. The film retains Zaro's original English copy, palette, interface references and soundtrack.

The reference is stored as `references/video/zaro-template.webm`; the original supplied MP4 stays local and is ignored by Git. The reference is not a video layer in the composition. Graphic layouts, typing, agent rows, workflows, cursor clicks, orbit systems and camera moves are animated in code. Interface detail and original branding use crops recorded in `references/ui/manifest.json`.

**Unofficial Beam demonstration, with no Zaro affiliation or endorsement.** The reference video, soundtrack, logos and interface crops belong to their respective rights holders and are excluded from Beam's code license. No redistribution permission is claimed. See [the third-party notice](references/NOTICE.md) before distributing reference material or adapting the example.

## Build and publish through Beam CLI

From this directory:

```sh
bun install
bun run build
bun run publish
```

Start Beam yourself from the repository with `bun run dev` before publishing. Publication targets the existing Beam instance, creates or reuses the **ai-native-zaro** project, and opens it in a separate editor window. It does not replace your current project. If several instances are running, specify `BEAM_INSTANCE=<pid>`.

The HTML source is bundled through `html.publish`; the original reference soundtrack is imported as a separate audio clip. Publication stages only editable code, local fonts and runtime UI assets in `.beam/publish/`, keeping the large inspection-frame archive and original MP4 in this example's `references/` directory. Saves can be republished with the same command without duplicating layers. The saved project and layer identifiers are in the ignored `.beam/project.json`.

Export through Beam's headless CLI without opening an editor:

```sh
BEAM_CHROMIUM_GPU=hardware bun run render
```

The output is `dist/renders/ai-native-zaro.mp4`. Beam's installed Chromium is required. Building again clears `dist`, including exports.

## Source layout

- `src/scenes-*.js` creates the five groups of scenes.
- `src/motion-*.js` defines their GSAP choreography.
- `src/choreography.js` owns the 27 scene boundaries and reversible visibility.
- `src/clock.js` derives typing from the requested time, including backward seeks.
- `src/main.js` exposes `window.beamComposition.ready` and `seek(timeMs)`.
- `references/` holds the supplied video, extracted soundtrack, local fonts and authentic UI crops.
- `STORYBOARD.md` maps the full reference sequence to source modules.

Everything loads locally. There are no timers, network requests or asynchronous text animations in the movie's clock. The timeline remains paused; Beam supplies the requested position.

## Verify and inspect the reference

```sh
bun run test
BEAM_CHROMIUM_EXECUTABLE=/absolute/path/to/beam/chromium/chrome bun run verify
```

Verification captures reference timestamps, compares forward and reverse-seek pixels, checks decoded local assets, and traverses all 2,058 output frames for scene continuity. Reports and PNGs are written to `.beam/verification/`. This checks deterministic rendering; it is not a claim of pixel-identical fidelity to the original film.

After verification, `bun run compare` creates `.beam/verification/comparison.html` with timestamp-matched reference, reconstruction and difference sheets.

Regenerate crops and selected source frames with `bun run references`; extract every input frame with `bun run references --all`. This requires FFmpeg, ffprobe and Python Pillow. Pass `--source /path/to/original.mp4` to extract the exact supplied source instead of the compressed WebM. The original has 2,056 input frames, two fewer than the 2,058-frame constant-rate reconstruction. All frame comparisons use actual source timestamps from ffprobe; existing crops and verification frames were extracted from the original MP4.

This is a reconstruction from a supplied MP4, not the original Zaro animation source. Font outlines, some camera trajectories and diagram details differ. The supplied video, soundtrack and interface crops remain reference material; the audio has not been represented as CC0. Local Liberation Sans fonts are covered by the accompanying font license.
