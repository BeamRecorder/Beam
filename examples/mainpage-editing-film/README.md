# Video for BeamMainPage — editing film

An authored, silent **1920 × 1080 / 60 fps** film, rendered with **Beam CLI**.
It uses the actual Beam Vue titlebar, sidebar, Canvas controls, clip/shape/blur
properties, complete TimelineTracks, playback toolbar and selection handles.
The source recording, original macOS cursor artwork and Beam ending come from
the user's open project. No project document is overwritten.

The film has 3.5 seconds of original footage, fifteen seconds of editing, and
the original 2.054-second ending: **20.554 seconds authored**, rounded to whole
frames by the export. See [the shot plan](BRIEF.md).

The native painter renders the original intro/ending, video framing, camera,
cursor, background, outlined shape and privacy blur. Selection uses the same
engine projection as the painter. The edit pointer samples native CSS cursor
roles and draws original macOS sprites with their actual hotspots.

The timeline and inspectors are real application components. Offline host
providers supply local font/catalogue state and real source thumbnails without
Electron settings, updates or native file access. Thumbnail decoding settles
before a frame is captured. Gestures are authored, deterministic illustrations
of a workflow, not measurements of interaction latency.

## Reproduce locally

The recording and snapshot are private generated inputs, excluded from Git.
Open the original project in Beam and supply the matching ending font when
freezing it. Font resolution is separate because `assets.resolve` intentionally
does not expose the shared font library as project-owned media.

```sh
node scripts/prepare.mjs 4934bb2a-fd74-46a4-8086-50b38aeeb009 /path/to/original-HankenGrotesk.ttf
node scripts/build.mjs
bunx vue-tsc -p tsconfig.json --noEmit
bunx vitest run --config vitest.config.ts --coverage
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome node scripts/verify.mjs
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome node scripts/render.mjs
```

Run these from this folder. The renderer defaults to hardware WebGL with
software video decoding, verified locally on Intel Arc; environment variables
can select another Beam CLI backend. No GitHub workflow is involved.

The output is `renders/Video-for-BeamMainPage-editing.mp4`. Generated builds,
verification screenshots, original media and exports stay out of Git. The
editable Vue/TypeScript source stays in this folder.

## Verification

Thirty focused tests validate timing, easing, native composition records,
source preservation, exact trim timing, portable resources and invertible
selection projection. Coverage for motion, composition and selection is 100%
statements/functions/lines and 97.61% branches. Eighteen Chromium captures cover
the original opening, editor reveal, all actions and original ending.

The user's original project remains authoritative for the intro and ending;
the source movie's middle is replaced by this editing demonstration.
