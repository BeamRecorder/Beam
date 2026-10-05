# Record — teleprompter and local projects

Two editable Vue / HTML / GSAP compositions rendered by Beam, each eight seconds,
1280 × 800 at 30 fps, with light and dark themes and silent website exports.

The teleprompter imports the actual `TeleprompterView.vue` now shared with the
native Electron window, its complete toolbar, and `RecorderBar.vue`. The reader
scroll position, text-size slider (26 → 34 px) and color picker use the composition
clock. The cursor enlarges the script, then chooses coral text with contrast
suited to each theme while reading continues at 42 px/s. The view has no
native API dependency; session persistence, visibility, shortcuts, resizing and
playback remain in the native `Teleprompter.vue` controller.

The projects composition uses actual `ProjectTitle`, `ProjectPreviewImage`,
`ProjectModeIcon`, `ProjectFeatureBadges`, `Popover` and `Button` components,
plus the original scoped Project Picker styles. Catalog identities and dates are
frozen from existing local Beam projects. Five preview images come from those
projects’ existing authored website demonstrations; `website-demo` uses its
actual thumbnail. Its original file tree is illustrated in HTML after Explore.
The file browser is an authored demonstration, not an operating-system recording.

Both use the existing Beautiful Captures Figma artwork and Beam’s Sonoma Horizon
background. A 1.8% camera move, eased cursor travel and native click spring keep
the motion light. The final fade resets all state before the next iteration.
All assets are local. No original project or recording is changed.

```sh
bun install --cwd examples/website-recording-final-loops
bun run --cwd examples/website-recording-final-loops build
bun run --cwd examples/website-recording-final-loops test --coverage
bunx vue-tsc -p examples/website-recording-final-loops/tsconfig.json --noEmit
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run --cwd examples/website-recording-final-loops verify
BEAM_INSTANCE=<pid> bun run --cwd examples/website-recording-final-loops publish teleprompter dark
BEAM_INSTANCE=<pid> bun run --cwd examples/website-recording-final-loops publish projects dark
BEAM_CHROMIUM_GPU=hardware bun run --cwd examples/website-recording-final-loops render teleprompter dark
BEAM_CHROMIUM_GPU=hardware bun run --cwd examples/website-recording-final-loops render teleprompter light
BEAM_CHROMIUM_GPU=hardware bun run --cwd examples/website-recording-final-loops render projects dark
BEAM_CHROMIUM_GPU=hardware bun run --cwd examples/website-recording-final-loops render projects light
bun run --cwd examples/website-recording-final-loops website /path/to/website-private
```

`publish` creates separate editable HTML projects in Beam; it also accepts light.
`render` exports through the Beam CLI motion renderer. `website` uses external
FFmpeg to compress the renders to VP9, extracts WebP posters and writes notices.
Set `BEAM_DEMO_KIND=teleprompter` or `projects` to optimize only one demonstration.
The site ships only those optimized videos/posters, through its existing themed,
pausable player with reduced-motion support.

`verify` checks 24 real cursor hit targets, all four variants, arbitrary and
reverse seeks, the loop seam and asset availability. It permits at most 64
Chromium antialias edge pixels with a channel delta no greater than 12, across
the complete 1,024,000-pixel frame; no regions are masked.
