# Native Beam Instant loops

One continuous 24-second Instant hero and three 8-second detail loops, 1280 × 800, 60 fps, silent, in light and dark themes. English copy. Native Vue components and theme foundations are imported directly from Beam. A small in-memory host supplies demonstration preset/export state without Electron IPC. The shared composition renderer paints saved presets and the preview and the native Beamy motion engine supplies blinks, loading and the final green celebration.

The self-contained 640 × 400 native surface runs in an iframe at 2× capture so Select's teleported menu retains correct viewport geometry. Inline assets survive Beam CLI's independent compilation. The video clock owns every visible state, including native menu/tooltip fades, reverse seeks and the loop seam. The host strips wall-clock CSS transitions/animations from the compiled native bundle. Fonts are awaited explicitly. The illustrated export duration is not a benchmark. Original asset licenses are in `assets/NOTICE.md`.

```sh
bun install
bun run build
bun run typecheck
bun run test
bun run verify
bun run verify:hero
bun run check
BEAM_CHROMIUM_GPU=hardware bun run render hero dark
BEAM_CHROMIUM_GPU=hardware bun run render hero light
bun run verify:render
bun run website hero
BEAM_CHROMIUM_GPU=hardware bun run render presets dark
BEAM_CHROMIUM_GPU=hardware bun run render presets light
BEAM_CHROMIUM_GPU=hardware bun run render export dark
BEAM_CHROMIUM_GPU=hardware bun run render export light
BEAM_CHROMIUM_GPU=hardware bun run render clipboard dark
BEAM_CHROMIUM_GPU=hardware bun run render clipboard light
bun run website
bun run dev
```

Beam CLI renders/encodes the MP4 masters through WebCodecs/Mediabunny. External FFmpeg creates compact WebM loops and WebP posters for the private website. Instant's presets, local-export and clipboard details use these videos. The main video below the header is a freshly rendered 24-second composition. It opens on the real Sequoia wallpaper with an illustrative two-app dock. Click Beam, choose Instant, preview/select Nocturne and Sunrise, then choose Full screen. The native HUD minimizes and the camera eases back to the whole Screenshot canvas. Record a drag, Stop, watch local export and green Beamy, then click Chat in the dock, paste the same recording, Send and see three replies in a scrolling thread without playback controls. The chat and attachment minimize together to the exact opening desktop. Native Beam manual 2D focus is limited to 1.25× during the two presets; no Stop/export punch-in. `bun run website hero` installs just this film and its dedicated posters, leaving the three detail loops intact. Its WebM budget is 2.5 MB per theme for the 24-second, 60 fps native camera sequence; posters stay below 100 KB.

Preset previews use saved presentation and visual settings through the shared composition painter; the HTML host awaits lazy thumbnail painting and tooltip resizing. The macOS pointer is teleported above both menu and tooltip. The native JavaScript is embedded as an inline module to avoid Chromium’s pathological memory growth with a large data-module URL. HyperFrames validation/preview pin updated from 0.8.138 to 0.8.140. The outer host is checked for its composition contract; the compiled native DOM is checked separately because iframe content is opaque to HyperFrames’ layout sweep. `verify:hero` checks both themes, reverse seeks and the exact opening/closing seam through the awaited native clock. Reverse-seek comparison bounds Chromium’s SVG/backdrop/rounded-image edge rerasterization to 16,000 affected pixels and 40,000 summed channel levels on a 1,024,000-pixel frame. At most 64 edge pixels may exceed six color levels, with a 64-level per-channel ceiling; moved geometry and stale presets fail this comparison. Opening/closing poses permit only at most 64 pixels and 64 summed channel levels, with no channel changing by more than one level. `verify:render` verifies both 1440-frame silent masters and requires an encoded-loop SSIM of at least 0.985.

Clipboard demonstrates pasting the MP4 into an illustrative team chat, sending it and receiving two replies. Its channel title and composer belong to the demonstration; they do not imply a built-in Beam chat.
