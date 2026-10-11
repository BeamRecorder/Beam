---
name: beam-animation
description: Animate Beam HTML compositions or native video property tracks with deterministic seeking. Use for timing, transitions, GSAP, WebGL and camera emphasis that must match preview, reverse scrubbing and export.
---

# Beam animation

Read the existing `design.md` and `frame.md`. If visual direction is absent for a new piece, use `../beam-design/SKILL.md` to ask the missing questions. Animate toward a communication goal rather than adding effects independently to every element.

## Two animation paths

- **HTML artwork:** expose `window.beamComposition.seek(timeMs)` and set the entire frame at an arbitrary source time. See `../beam-composition/SKILL.md` for publication.
- **Native video:** use validated `animation.set` tracks and `scene.set` groups from `beam-cli docs commands`. They address existing clip/group fields; they are not CSS selectors or HTML timelines.

Screenshot documents are static. Animation commands are not accepted for stills; publish a chosen static state or capture a video frame instead.

## Deterministic clock

The same `seek(2500)` must render the same pixels after `seek(0)`, `seek(5000)`, or another `seek(2500)`. Test repeated and reverse seeks, not only playback from zero.

- Drive motion from `timeMs`, not `Date.now`, `performance.now`, independent intervals or accumulated simulation state.
- Use seeded randomness or precomputed values. Do not fetch changing network content during rendering.
- Keep CSS/Web Animations paused and explicitly seek them if used. A free-running CSS animation will drift during export.
- Await fonts, images and asynchronous drawing. An optional `ready` promise handles initialization; async `seek` must resolve only after the frame is ready.
- For Vue, apply state for the requested time and await `nextTick()` before resolving.
- For WebGL/Three.js, set uniforms/object state from the requested time and draw that completed frame. Do not require forward-only physics integration. Preserve a capturable drawing buffer when the renderer requires it.

Read [references/clocks.md](references/clocks.md) for GSAP and native-track examples.

## Motion decisions

Give the viewer time to read and understand an action. Entries should establish the hierarchy, holds should expose the important content, and exits should hand attention to the next scene. Stagger related elements as a group; keep the main subject stable while the viewer reads it.

Use camera motion to reveal a meaningful detail. Do not zoom beyond source resolution or swing a UI through unreadable perspective merely for movement. Plan a coherent start and end state for transitions; inspect both sides of every cut.

For a seamless loop, match the visual state at the loop boundary and check velocity when motion crosses it. A fade to blank is a design choice, not proof of a seamless loop.

Avoid simultaneously animating a parent's transform and independently compensating its children without a clear coordinate plan. In GSAP, do not combine CSS centering transforms with overwritten `x`/`y`; center using layout or explicit percentage transforms.

Inspect representative holds, transition midpoints, the first visible frame and the last valid frame with `../beam-export/SKILL.md`. Report timing and visual failures before claiming a finished render.
