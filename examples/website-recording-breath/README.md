# Take a breath

Ten-second Beam HTML composition, 1280 × 800 at 30 fps. Imports the actual
`RecorderBar.vue`, native Buttons and native light/dark palettes. The unchanged
Beautiful Captures pointer presses Pause at 1.2 s and Resume at 4.65 s.
The timer holds while the supplied preview shows the woman taking a breath.
The final 450 ms blends into the opening frame for the website loop.

The portrait preserves its 9:16 proportions over the existing Sonoma Horizon
wallpaper. The only camera move is a gentle 1.8% 2D zoom. All assets are frozen
locally, including the supplied AI-generated footage; see `assets/NOTICE.md`.
This is an authored demonstration, not a native screen recording.

```sh
bun install --cwd examples/website-recording-breath
bun run --cwd examples/website-recording-breath build
bun run --cwd examples/website-recording-breath test --coverage
bunx vue-tsc -p examples/website-recording-breath/tsconfig.json --noEmit
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run --cwd examples/website-recording-breath verify
BEAM_INSTANCE=950580 bun run --cwd examples/website-recording-breath publish dark
BEAM_INSTANCE=950580 bun run --cwd examples/website-recording-breath publish light
BEAM_CHROMIUM_GPU=hardware bun run --cwd examples/website-recording-breath render dark
BEAM_CHROMIUM_GPU=hardware bun run --cwd examples/website-recording-breath render light
bun run --cwd examples/website-recording-breath website /path/to/website-private /path/to/export-6s-woman-talking-facecam.webm
```

`publish` persists independent editable HTML projects in Beam. `render` uses
the actual Beam CLI motion renderer; `website` compresses those renders to
VP9 WebM, extracts matching WebP posters and writes provenance notices.
The optional final argument compresses the user's already edited camera/audio
export without changing its montage. The build decodes all 240 source frames
to WebP and embeds them as data URLs for deterministic forward/backwards
seeking inside Beam’s isolated HTML renderer. External FFmpeg is required for
that decoding, compression and posters. Original sound is excluded from the
silent loops.

The browser verification checks actual Pause/Resume hit targets, both themes,
forward/reverse video seeks, loop-seam pixels and local asset completeness.

The local compiled HTML bundle intentionally contains the entire footage cache
(about 9 MB). The website ships only the compressed WebM videos and WebP
posters. No runtime network access or Electron security changes are needed.
