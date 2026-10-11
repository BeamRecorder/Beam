# Studio overview

A 15-second, 1600 × 1000 / 60 fps silent loop for the primary Edit feature video,
with light/dark variants. The heading's background animation stays independent.

The film uses the actual Quiet Aurora 4 recording, original cursor telemetry,
and Beam's existing CC0 demo webcam fixture. Native EditorTitlebar,
TimelineToolbar, TimelineAddMenu, TimelineTrimHandle, TimelineGapButtons,
ClipPropertiesPanel, CaptionClipPanel and CanvasBackgroundTabs supply the UI.
`paintTimelineCanvas` paints four tracks. `renderCompositionFrame` renders the
recording, camera, caption, appearance, background and native 2D zoom.

## Sequence

- 0–5.4 s: trim, split twice, delete the 800 ms fragment, remove the gap.
- 5.9–7.9 s: type and hold a manual caption, **Every detail, in focus.**
- 7.9–10.9 s: change shadow to violet and resize the recording proportionally.
- 10.9–12.5 s: select and hold the native Ocean canvas gradient.
- 12.5–14.25 s: play the finished result with a native 2D zoom and caption.
- 14.25–15 s: fade, reset under zero opacity, return to the opening frame.

The timeline framing is a restrained 1.1×; the properties framing stays at
1.22× for 5.75 seconds. Camera transitions take 0.85–0.95 seconds, and the final
playback returns to the full editor. There are no per-control camera moves.
The final native 1.5× recording zoom starts at zero strength on Play, then
enters progressively.

Gestures illustrate editing, not measured interaction latency. No audio
waveform, automatic transcript or word timing is invented. Mediabunny decodes
explicit source times; one paused GSAP clock controls all state. The offline
font library contains local Hanken/Beam Sans and never impersonates Electron
preload. Native OS font import is unavailable in this film.

## Reproduce

```sh
bun install
bun run build
bun run typecheck
bun run test --coverage
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify
bun run check
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_CHROMIUM_GPU=hardware bun run render light
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_CHROMIUM_GPU=hardware bun run render dark
bun run website /path/to/website-private
node scripts/verify-media.mjs /path/to/website-private
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome node scripts/verify-site.mjs http://localhost:7000
```

The build freezes entries into `dist/light` and `dist/dark`. Rendering calls
Beam CLI motion, producing 900-frame MP4 masters. External FFmpeg creates VP9
WebM and WebP website derivatives. Generated builds, proofs and masters are
ignored by Git.
Website derivatives use 1280 × 800 / 60 fps, Lanczos resizing and VP9 CRF 38;
the original 1600 × 1000 masters remain available for later exports.

Verification checks twelve reverse-seek states in both themes and the 0/15 s
seam. The HyperFrames seek-completion barrier awaits the same native inspector,
scroll and compositor settlement as Beam CLI. Native scroll-clipped labels are
marked as intentional occlusion; visible controls remain audited.
Chromium occasionally re-rasterizes antialiased UI edges after a camera
move. The comparison bounds this to the card's 3-pixel edge strip (≤2000 pixels,
channel delta ≤20), rounded control edges (≤64 pixels, delta ≤48), the native
playhead tip’s right edge (≤16 pixels, delta ≤32), and ≤64 other native UI pixels
with delta ≤8. The measured differences were a single card
edge row, 45 pixels of the rounded Export button and 13 playhead-edge pixels. Source/cursor differences
outside these limits fail; no blanket tolerance masks the media preview.

## Native project

The local duplicate is **Quiet Aurora 4 — Studio overview**. It keeps its own
project/session manifests and complete source media. Its edited timeline is
10.4 seconds; the website film takes 15 seconds to show editing and playback.

`prepare-project.mjs` copies the supplied local source and runs offline Beam
CLI edit commands. `repair-recording-links.mjs` preserves each split camera
fragment's actual screen owner. `finish-project.mjs` saves caption and appearance
with CLI patch/add commands, then stores presentation and zoom settings.
They never open the desktop app. A completed target is protected from replacement;
a SHA-256 receipt in `.beam/project/receipt.json` verifies the original is intact.
Rebuild after preparing a fresh duplicate so the film uses its new fragment IDs.

## Assets

The MP4 and telemetry are copied from the supplied Quiet Aurora 4 project.
Tahoe/Ventura are Beam catalog wallpapers, always sized proportionally.
MacOS cursor sprites and the Beam icon are unchanged product assets.
Hanken Grotesk uses SIL OFL; its license is included beside the font.
Native composition stages are validated by the engine on import.

Source: MPL-2.0. Website credits: `editing-studio.NOTICE.txt`.
