# Screenshot gradient effects

In Screenshot, select a content layer in Composition and choose **Effects → Gradient** (also available in its context menu). The nested Gradient row opens its inspector. Its back button returns to the owning layer. Mesh, Flow and Silk use BEBE-ui's Gradient Studio shaders, perceptual Oklab palettes and Aurora, Ember, Bloom, Tide, Nocturne and Sunrise presets.

Effects fill the original layer's alpha, including text, artwork, rounded corners and shadows. Their opacity crossfades the original content with the gradient while preserving partially transparent edges. Effect blend modes operate against that layer's original content; the owning layer's opacity and blend mode still operate against the composition. Background gradients require a visible background with actual content. Blur/highlight backdrop regions and zoom lenses cannot carry a fill effect.

The compact Effects menu adds a gradient; the Color menu adds color adjustments or a black-and-white preset. Layer blending and draggable numeric opacity share one row. The parent thumbnail shows the original content, and each nested effect thumbnail shows the cumulative result up to that effect. Clicking a nested row opens its inspector.

Palette, Surface, Geometry, Structure, Light, Texture and Phase sections expose every numeric shader parameter. Palettes contain two to eight opaque hex colors. A layer has at most four effects, applied in array order, each with a unique ID. Disable an effect to retain its settings without rendering it. Locked layers cannot be edited. Recipes persist in the project and undo/redo history; ordinary layer copies retain independently owned recipes. Rasterized background/watermark copies bake effects once.

## Authoring

`beam docs gradients` or the `docs.read` tool with `{"topic":"gradients"}` returns this document and its GitHub source link. Use `documents.snapshot` to obtain the current revision and `documents.transact` to edit an open project. The `effects` patch replaces the whole list, so preserve existing effects when adding or editing one. Sending `effects: []` removes them all.

The direct engine API supplies presets:

```ts
import { createGradientEffect, GRADIENT_PRESETS } from '@beam/engine';

const effect = createGradientEffect('gradient-1');
effect.recipe = structuredClone(GRADIENT_PRESETS.find(preset => preset.id === 'bloom')!.recipe);
session.execute({
  type: 'still.layer.compositing',
  payload: { layerId: '__background__', patch: { effects: [effect] } },
});
```

An agent can send this complete command as part of a transaction without importing an application framework:

```json
{
  "type": "still.layer.compositing",
  "payload": {
    "layerId": "__background__",
    "patch": {
      "effects": [{
        "id": "gradient-1", "kind": "gradient", "enabled": true,
        "opacity": 100, "blendMode": "source-over",
        "recipe": {
          "version": 1, "mode": "flow",
          "colors": ["#2457ff", "#6335ff", "#7aa5ff", "#bde9ff"],
          "background": "#f1f5ff",
          "grain": 24, "distortion": 55, "softness": 35, "folds": 30,
          "space": 55, "scale": 1, "rotation": -25, "seed": 12,
          "offsetX": 0, "offsetY": 0, "stretchX": 100, "stretchY": 100,
          "noiseFrequency": 1, "octaves": 3, "turbulence": 55,
          "swirl": 0, "curvature": 34, "colorSpread": 50,
          "foldFrequency": 5, "lightAngle": 0, "exposure": 0,
          "contrast": 100, "saturation": 100, "grainSize": 1,
          "vignette": 0, "drift": 20, "frame": 0
        }
      }]
    }
  }
}
```

All recipe fields are required; unknown fields, invalid colors, nonfinite values and out-of-range parameters fail atomically. Bounds live in [`GRADIENT_RANGES`](../../packages/engine/src/gradient/gradient-schema.js), shared by the validator and sliders. `seed` and `octaves` are integers. `frame` selects a saved shader moment in seconds, from zero to 120; screenshots have no playback or wall-clock animation.

Color effects use the same transaction and history contract. `createColorEffect(id, true)` creates a monochrome preset; omit the second argument for neutral adjustments. A complete persisted color effect is:

```json
{
  "id": "color-1", "kind": "color-adjustment", "enabled": true,
  "opacity": 100, "blendMode": "source-over",
  "recipe": {
    "version": 1, "hue": 0, "saturation": 100, "brightness": 100,
    "contrast": 100, "grayscale": 0, "sepia": 0, "invert": 0
  }
}
```

Hue is in degrees from -180 to 180. Saturation, brightness and contrast range from 0 to 200 percent; grayscale, sepia and invert range from 0 to 100 percent. All fields are required and validated by [`COLOR_RANGES`](../../packages/engine/src/gradient/color-schema.js). Color effects always use `source-over`; effect opacity crossfades the adjusted and original colors while preserving alpha. Runtime applies hue, saturation, brightness, contrast, grayscale, sepia and invert in this fixed order through Canvas filters. Color-only stacks allocate no gradient WebGL program.

## Runtime and verification

Runtime owns retained WebGL programs and three reusable isolation surfaces per active canvas context. The gradient follows the owning item's local geometry, rotation and host canvas transform, so scaled/translated thumbnails and full-resolution exports share the same projection. Static grain and fixed `frame` make repeated paints deterministic. Surface dimensions are bounded by the host GPU viewport. Missing/lost WebGL and invalid geometry report an error; no alternative gradient is substituted. Render owners release GPU and scratch surfaces on disposal; one-shot raster/thumbnail paths release them after painting.

The algorithms originated in the user's BEBE-ui `src/graphics/gradient/` implementation and `src/data/gradients.ts` presets. Beam keeps rendering in runtime and document validation in engine rather than embedding that project's UI.

Focused unit/component tests cover recipes, transactions, projection, GPU cleanup, inspector controls and worker transport. The opt-in `gradient-desktop.integration.test.ts` launches an isolated Electron profile, adds an effect through Composition, checks real preview/thumbnail pixels and transparent alpha, changes presets, exports through the packaged CLI and verifies saved state plus undo/redo. Enable it with `BEAM_RUN_DESKTOP_AGENT_TEST=1` and provide the native capture executable and compatible Chromium host as described in the agent docs.
