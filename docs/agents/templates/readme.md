# Reusable HTML launch-video templates

Small, customizable components extracted from the `ai-native-zaro` reconstruction.
Use these for a sentence with a moving caret, a prompt field, genuine macOS cursor
motion with click feedback, and smooth 2D/3D camera moves. All animation is derived
from **one supplied time in milliseconds**, including backward seeks. Nothing
plays itself, runs a typing timer, or depends on a network service.

The 12-second example connects the components into a continuous launch sequence:
an opening sentence becomes a prompt, the cursor submits it, cards appear, the
camera moves through the result, and a closing statement resolves. The example's
cards are demonstration artwork; replace them with your real product interface.

## Copy and customize

Copy `components/` and `assets/cursors/` together. The HTML files are plain fragments
and the JS is framework-independent ES modules. Import GSAP in your own project and
pass it to the motion helpers. Vite's `?raw` imports below are only a convenient way
to read a local fragment; any bundler or inline HTML works.

```js
import { gsap } from 'gsap';
import sentence from './components/sentence.html?raw';
import { mountTemplate } from './components/mount.js';
import { createTypingTrack } from './components/typing.js';
import './components/styles.css';

const element = mountTemplate(document.querySelector('#headline'), sentence);
const typing = createTypingTrack(
  element.querySelector('[data-typing-text]'),
  element.querySelector('[data-typing-caret]'),
  {
    phrases: [
      { startMs: 300, durationMs: 700, text: 'Your next idea.' },
      { startMs: 2200, durationMs: 800, text: 'Already taking shape.' },
    ],
    blinkMs: 450,
    hideCaretWhenDone: false,
  },
);
typing.seek(1200); // Also works after seeking to the end and back.
```

Text is assigned through `textContent` or an input's `value`, never injected as HTML.
Unicode grapheme clusters remain intact. `durationMs: 0` reveals a phrase instantly.
Before the first phrase the text and caret are hidden; after completion the caret
blinks on the same source clock unless `hideCaretWhenDone` is enabled.

## Components

| Fragment           | Motion helper                             | Customization                                                                                  |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `sentence.html`    | `createTypingTrack(text, caret, options)` | Phrase replacements, start/duration, blink speed, end state; inherited font/color              |
| `input-field.html` | The same typing helper                    | CSS variables, label, send content, width and padding; `data-send` supports a GSAP click tween |
| `cursor.html`      | `createCursorTrack(gsap, root, options)`  | Timed positions, arrow/pointer/text/grab glyph, size, easing and click times                   |
| `zoom.html`        | `createZoomTrack(gsap, stage, options)`   | Stage dimensions, normalized focus, zoom, rotation, perspective and easing                     |

The input fragment is a **presentation field**, with read-only textbox semantics.
Its caret sits immediately after the text and follows line wrapping. For a live
form, use a real `<input>` or `<textarea>`; the typing helper accepts both, but
interactive input behavior belongs to your application.

Theme fields locally:

```css
.my-prompt {
  --field-bg: #211c2d;
  --field-fg: #f6f3fb;
  --field-border: #494051;
  --field-accent: #b99bf1;
  font-size: 30px;
}
.my-headline {
  font-size: 120px;
  font-weight: 600;
  letter-spacing: -5px;
}
```

`mountTemplate` accepts trusted local markup only. Keep user copy in text/value and
keep selectors scoped to your own scene. Add your own product icon to the send
button if desired; this demonstration uses a typographic arrow.

## Cursor choreography

```js
const pointer = createCursorTrack(gsap, cursorElement, {
  size: 56,
  points: [
    { timeMs: 0, x: 1200, y: 700, kind: 'arrow' },
    { timeMs: 1100, x: 900, y: 500, kind: 'pointer', ease: 'power3.inOut' },
    { timeMs: 1450, x: 900, y: 500, kind: 'pointer' }, // Hold through the click.
    { timeMs: 2100, x: 700, y: 430, kind: 'text' },
  ],
  clicks: [1250],
});
await pointer.ready; // Preload every glyph before the first captured frame.
pointer.seek(1250);
```

Coordinates refer to the cursor's **hotspot**, matching Beam's existing macOS pack.
The outer wrapper carries position; the inner SVG carries click scale, so pressing
the mouse does not shift its target. The glyph changes at the point's timestamp.
Place the cursor inside the zoom stage when it should remain attached to the
interface, as the example does; put it outside for screen-space motion.

The SVGs are copied unchanged from Beam's `public/macOsSvgCursors/`; they are not
redrawn. See [asset provenance](assets/NOTICE.md) for their scope and third-party
ownership. Replace `MACOS_CURSORS` with your own licensed pack when appropriate.

## Smooth camera moves

```js
const camera = createZoomTrack(gsap, stage, {
  width: 1920,
  height: 1080,
  perspective: 1600,
  keyframes: [
    { timeMs: 0, scale: 1 },
    { timeMs: 900, scale: 1.6, focusX: 0.72, focusY: 0.4 },
    { timeMs: 1600, scale: 1.6, focusX: 0.72, focusY: 0.4 }, // Readable hold.
    { timeMs: 2300, scale: 1, rotateY: -4 },
    { timeMs: 3000, scale: 1, rotateY: 0 },
  ],
});
camera.seek(900);
```

`focusX/focusY` are normalized source coordinates in `[0,1]`; the selected point
lands at the viewport center. Rotations are degrees. Dimensions are the logical
stage dimensions, before any player scaling. Motion stays on the inner stage;
the outer viewport clips it and retains the composition geometry. These are HTML
camera treatments, distinct from Beam's native zoom or magnifier document effects.

All motion tracks return `seek(timeMs)` and `dispose()`. Dispose kills their paused
GSAP timelines. Invalid times, scales and required elements fail explicitly.

## Assemble a dynamic launch sequence

Use `example/main.js` as the complete assembly, then adapt the timing to your film.
The camera, cursor, text and scene choreography all consume the same clock.

```js
const choreography = gsap.timeline({ paused: true });
// Add your scene transitions to this paused timeline.
window.beamComposition = {
  ready: Promise.all([document.fonts.ready, pointer.ready]),
  seek(timeMs) {
    camera.seek(timeMs);
    typing.seek(timeMs);
    pointer.seek(timeMs);
    choreography.time(timeMs / 1000, false);
  },
  dispose() {
    camera.dispose();
    pointer.dispose();
    choreography.kill();
  },
};
```

Create the DOM and cache selectors once. Declare initial poses at time zero and use
explicit `fromTo` endpoints for reveals. Give separate tracks distinct properties
to own. Avoid `setTimeout`, `setInterval`, random values, per-frame DOM creation or
calling `.play()` on a second clock. Wait for local fonts and image decoding before
declaring the composition ready.

To make a continuous montage:

1. Build each action around a visible cause: a phrase, a click, a generated result.
2. Begin the next reveal 100–200 ms before the previous exit finishes. Overlap the
   motion while preserving enough time to read the main copy.
3. Use the camera to connect details on the same interface. Alternate a close-up
   with a wider view so viewers retain their bearings.
4. Hold the cursor briefly on its actual target before clicking. Keep click feedback
   short; reserve larger movement for camera handoffs and result reveals.
5. Reuse one accent and a consistent corner/shadow treatment. Put your own real
   screenshots or HTML interface in the zoom stage; retain surrounding native text.
6. Test cuts, the first/last frame and reverse seeks. Sound is a separate Beam audio
   track, synchronized to these timestamps rather than played by HTML timers.

## Build and use through Beam CLI

From `docs/agents/templates/`:

```sh
bun install
bun run test
bun run build
BEAM_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium bun run verify
```

No development server is started by these commands. To render the example with
Beam's headless HTML runtime from the repository root:

```sh
bun run beam motion docs/agents/templates/motion.json /tmp/beam-launch-templates.mp4
```

`motion.json` describes the editable HTML source, 1920 × 1080, 30 fps, 12 seconds.
See [Beam HTML authoring](../../agent/html-compositions.md) for publishing through
`html.publish` into a project. Keep the fragments, local assets and package manifest
inside that project's source bundle. The example intentionally contains no music.
