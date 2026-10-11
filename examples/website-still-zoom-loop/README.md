# Screenshot zooms for the private website

```sh
bun install --frozen-lockfile
bun run build
bun run test --coverage
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify
bun run check
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run render light
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run render dark
bun run website /path/to/website-private
node scripts/verify-media.mjs /path/to/website-private
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome node scripts/verify-site.mjs http://localhost:7000
```

Nine seconds, 1280 × 800, 60 fps, silent. Reuses the original Beautiful Captures
image, Tahoe wallpapers, Hanken Grotesk and Figma editing pointer. The native
ScreenshotToolbar and ZoomPanel in still mode remain visible throughout. No
Studio playback bar or timeline is added. A single layer shows 2D placement,
two 3D directions and a moved circular glass lens with adjusted refraction.
The 3D illustration uses wider framing so the projected Safari corners remain
visible; it is a composed demonstration, not a recording of a live edit.

The preview uses the actual `drawScreenshotZoom`, `manualCameraZoom` and
`renderGlassHighlights` renderers. The original image is supplied again at lens
density through the native scene painter. Gestures are illustrative; no capture
device, source project, native window or desktop API is used by the composition.

One paused GSAP clock drives deterministic Vue state and paint. The example-only
SeekReveal adapter settles native accordions without live RAF interpolation.
The headless verification checks style states, native controls, reverse seeks,
cursor targeting, missing assets and the loop seam. FFmpeg compresses the Beam
render into website WebM and WebP derivatives; it is not bundled with Beam.
