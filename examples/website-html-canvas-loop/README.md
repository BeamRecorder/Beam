# Your canvas can be code

A twelve-second, silent HTML/Vue/GSAP loop for Beam's AI-native feature detail.
Source and rendered artwork share the same edit state. The title changes on save,
the CSS color edit updates the real shape, and GSAP rotates the actual HTML orbit.
The authoring clock supports arbitrary and reverse seeks with no external assets.

The delivery is rendered through **Beam CLI**, with two real manual camera zooms
at 1.5× and `projection: 2d`. `src/camera.ts` is shared by the native timeline presentation,
the offline render snapshot and both editable desktop projects. HTML is captured at 2× to keep the 1.5× focus sharp. The zooms are
native document records rather than baked CSS camera transforms.

```sh
bun install
bun run build
bun run thumbnails
bun run build
bun run test --coverage
bun run typecheck
bun run check
bun run verify
BEAM_CHROMIUM_EXECUTABLE=/path/to/chromium bun run render dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chromium bun run render light
bun run publish dark
bun run publish light
bun run website
```

Publish creates independent Beam projects and preserves their persistent HTML
source versions. Only those project IDs are patched. Build/check/verification
operate on local files without starting a development server. The illustration
is an authored explanation, not a recording of user input. Font/mark provenance
is documented in `assets/NOTICE.md`.

MP4 masters and proof frames live in `renders/` / `.beam/verification/` and are
ignored by Git. External FFmpeg creates VP9/WebP website derivatives; no FFmpeg
binary is bundled. The private site's existing themed media player supplies
viewport suspension, a pause button and reduced-motion support.

The movie imports the desktop EditorTitlebar, EditorWorkspace, TimelineToolbar,
ZoomPanel, TimelineTrackHeaders, TimelineZoomTrack, TimelineCanvasLane and shared
timeline surface/painter and CSS. The local HTML render supplies its thumbnails.
The source pane illustrates editing an external HTML file; Beam retains that file
as a persistent layer. No Electron capture API is exposed to the composition.

Layout/runtime/motion checks use `--no-contrast`: the native product controls keep
the exact Beam palette requested by the user, including muted helper labels.
The full contrast audit remains available with `npx hyperframes check dist/dark`;
it reports the product's existing muted-label contrast separately.
