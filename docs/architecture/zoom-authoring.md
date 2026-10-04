# Shared zoom authoring

Engine zoom data and authoring helpers are available without a browser, Vue or Electron. Runtime renders them through the same WebGL lens backend in video preview/export and Screenshot. A browser-capable rendering host is still required.

Video zooms live in `CompositionSnapshot.zooms`. Camera zooms retain the existing `projection: 2d | 3d` contract. A lens sets `effect: glass`, `mode: manual`, normalized `focus`, a magnification `depth` from 1 to 6, and `glass` settings. It magnifies the completed composition beneath the lens without moving the whole camera.

`createGlassHighlight()` returns fresh settings: circular lens, diameter 60% of the shorter canvas dimension, restrained refraction, rim, dispersion and shadow. `glass.size` is a diameter relative to the shorter canvas dimension, bounded to 0.02–4. Freehand contours store 3–128 points in local coordinates from −1 to 1; an empty contour is an unfinished selection and draws no lens. `fitGlassContour()` converts a drawn contour into normalized focus, diameter and bounded contour points. Appearance controls are normalized to 0–1, bevel to 0.02–0.5, and transitions to 0–1000 ms.

`generateRecordingZooms(composition, sessionId, telemetry, reserved, { style: 'glass', canvas })` groups explicit recorded clicks by space and time. It maps trim, playback speed, crop, local mirrors, rotation, frame content and scene transforms into canvas coordinates. It preserves reserved intervals and generates readable durations and bounded sizes. Generated lenses are manual elements with `generation: automatic`, so they remain editable and can be identified during regeneration. No clicks means no fabricated lenses.

Screenshot stores zooms in `state.zooms`, as composition layers with `kind: zoom`, `name`, `enabled`, `mode: manual`, `startMs: 0` and `endMs: 1`. It has no automatic following, timing animation or keyframes. These layers magnify the composition below their position in the layer order. The portable `still.layer.add` and `still.layer.patch` commands use the same validation as desktop persistence. A static lens can be authored with:

```ts
const layer = {
  ...createManualZoom('lens-1', 0, 1),
  kind: 'zoom',
  name: 'Detail',
  enabled: true,
  effect: 'glass',
  depth: 4,
  glass: createGlassHighlight(),
};
```

These records remain JSON-serializable. Preview resources, GPU textures, selection state and inspector units stay outside the document and its history. Unknown or invalid shapes, contour points, settings and static animation fields are rejected at the engine/native storage boundary. GPU initialization errors remain visible; there is no alternate image effect substituted silently.
