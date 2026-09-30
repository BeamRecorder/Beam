# Mascot Lab

Run `bun install --frozen-lockfile`, then `bun run dev`. Open
[http://localhost:6500/mascot.html](http://localhost:6500/mascot.html).

This is an independent browser page in the Beam renderer, with no Electron API,
capture engine, HUD entry, or loading-screen integration. Its Vue SVG component
and clock-free engine can be integrated later.

The laboratory includes Bloub's 14 animation states, eight body shapes, twelve
colors, sixteen rest expressions, and Beam's morphable sparkle/star eyes and
optional cheeks. Compare states on the frozen board, slow down playback, follow
the pointer, and check the mascot against light, dark, and checkerboard surfaces.
Space pauses the entire animation, including blinking. Reduced-motion preferences
start playback paused, and hidden tabs stop the animation loop.

The timeline supports adding, moving, removing, seeking, and changing the duration
of up to 32 movements. A sequence loops until another state is selected. Looks and
timelines are saved in the browser's `beam.mascot-lab.v1` localStorage key; JSON
export/import transfers them between browsers. Reset affects only this lab.

SVG (512 px) and PNG (1024 px) exports capture the current frame with a transparent
background. JSON exports contain the look and complete timeline. GIF and MP4
export are not part of this prototype.

The source is in `src/components/mascot-lab/`. Attribution, the pinned upstream
commit, and the MIT license are in its `bot/NOTICE.md` and `bot/LICENSE`.

Focused validation: `bunx vitest run src/components/mascot-lab src/tests/vite-config.test.ts`
and `bun run typecheck:vue`.
