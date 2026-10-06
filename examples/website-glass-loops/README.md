# Website glass lens loops

```sh
bun install --frozen-lockfile
bun run build
bun run test --coverage
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_CHROMIUM_GPU=hardware bun run render glass dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_CHROMIUM_GPU=hardware bun run render automatic dark
# Repeat the render commands with light.
bun run website /path/to/website-private
BEAM_INSTANCE=<pid> bun run publish glass dark
BEAM_INSTANCE=<pid> bun run publish automatic dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_WEBSITE_URL=http://127.0.0.1:7000 bun run verify:website
```

The source imports the real ZoomPanel, GlassHighlightControls and GlassHighlightSelection without changing product code. Lens pixels use renderGlassHighlights and the timeline uses paintTimelineCanvas. buildAutomaticGlassElements computes lenses from the bundled original telemetry after the documented crop mapping. Changing the selected lens preserves its automatic origin.

The 2D HTML scene and Figma editing pointer are authored; the recording preview uses four original Google Docs frames and recorded cursor samples. The browser tab strip is cropped out. Recording time accelerates during preview and pauses on a real click for editing. Original source recording and projects are read-only.

GSAP owns the timeline; window.beamComposition.seek settles Vue, opens native disclosures/dialogs, then paints native GPU/timeline surfaces. Offline disclosure reveals omit the live app's wall-clock RAF transition via an example-only adapter. The compiled sources and assets are frozen into an independent saved Beam HTML project by publish.

Build output, native render jobs, QA captures, publication receipts and exports are ignored. External FFmpeg creates VP9/WebP derivatives; no FFmpeg binary is bundled.
