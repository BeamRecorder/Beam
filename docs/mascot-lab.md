# Mascot Lab

The prototype is retained in `src/components/brand/lab/`. It has no HTML entry,
HUD action, native window, IPC endpoint, or production import. To prototype,
mount `MascotLab.vue` explicitly in a temporary development harness; do not
add it to the normal application startup or build inputs.

The lab does not control capture. Production UI imports only the shared
`Beamy/` renderer and clock-free engine. Saved Lab experiments do not affect
production artwork. Reduced motion uses still poses and hidden documents
stop playback.

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

The lab UI is in `src/components/brand/lab/`. Its shared SVG renderer and
TypeScript engine live in `src/components/brand/Beamy/`. Attribution, the pinned
upstream commit, and the MIT license are in `engine/NOTICE.md` and `engine/LICENSE`
there. The HUD and startup shell use exactly the lab’s cloud silhouette with
themed sparkle eyes. Action poses morph from the displayed shape; hidden and
resting mascots own no animation loop.

Focused validation: `bunx vitest run src/components/brand/lab src/tests/vite-config.test.ts`
and `bun run typecheck:vue`.
