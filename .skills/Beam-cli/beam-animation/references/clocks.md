# Seek-safe clocks

## GSAP

Install GSAP in the authored source project. Beam does not supply it globally.

```ts
import { gsap } from 'gsap';

const timeline = gsap.timeline({ paused: true });
timeline.fromTo('.title', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6 }, 0);
timeline.to('.title', { opacity: 0, duration: 0.4 }, 5.6);

Object.assign(window, {
  beamComposition: {
    seek(timeMs: number) {
      timeline.time(Math.max(0, timeMs) / 1000, false);
    },
  },
});
```

Keep animation values on the timeline. Side-effect callbacks that append nodes or start audio are not reversible just because the timeline seeks. Construct the DOM once and sample state. Do not call `play()` or start another clock during export.

For CSS/Web Animations, pause the animation and assign `currentTime = timeMs` during every seek; set an appropriate fill mode so the initial and final states remain defined. Await any initialization necessary for stable layout.

## Native property tracks

Use a real unlocked clip ID from the document. `animation.set` takes the track itself as its payload:

```json
{
  "type": "animation.set",
  "payload": {
    "id": "intro-position",
    "targetId": "CLIP_ID",
    "property": "transform.x",
    "interpolation": "number",
    "keyframes": [
      {"timeMs":0,"value":0},
      {"timeMs":600,"value":0.05}
    ]
  }
}
```

Submit in a live transaction or a standalone `edit` command array. The example uses normalized position, not pixel displacement. Read the installed command documentation and existing tracks before selecting clock, easing or property fields.

`animation.delete` takes a track ID string as its payload, not `{id: ...}`. `scene.set` takes the complete validated graph. Preserve existing groups/tracks rather than replacing them with a fragment. Native tracks cannot target identity/source fields or arbitrary prototype paths.

At minimum, sample 0 ms, a middle hold, transition midpoints and the last valid source frame, then return to a previously sampled time and compare. For an N-second render at F FPS, the final sampled frame is approximately `N*1000 - 1000/F`, not an extra frame at the exclusive endpoint.
