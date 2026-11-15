# Third-party source in Beam

Beam's original source retains its existing Mozilla Public License 2.0 in `LICENSE`.
The components below have their own licences; they are not relicensed as MPL-2.0.

## Recordly experimental camera

- Source: https://github.com/webadderallorg/Recordly
- Revision: `0ea5bd753050874a6d157cab818489aa398d6161`
- Location: `packages/engine/src/zoom/recordly/`
- Licence: GNU Affero General Public License, version 3. Full text:
  `packages/engine/src/zoom/recordly/LICENSE.md`.
- Original authors/copyright: Recordly contributors; see the pinned source history.
- `upstream.json` identifies the original and local SHA-256 of each file, the
  extracted declarations and the renderer type-import adaptations. The executable
  generation, camera, interpolation and blur-parameter algorithms are unchanged.

The experimental engine is statically included in Beam's renderer/export code.
Turning the feature off does not remove this source from a distributed build.
Distribution of a combined build must satisfy the AGPL, including corresponding
source availability and preservation of notices; do not describe that build as
exclusively MPL-2.0 or describe Recordly as MIT-licensed.

## Pixi Filters spatial blur kernels

- Source: https://github.com/pixijs/filters, npm `pixi-filters@6.1.5`
- Location: `packages/runtime/src/zoom/recordly/filter-shaders.ts`
- Licence: MIT. Full text: `packages/runtime/src/zoom/recordly/LICENSE.pixi-filters`.
- MotionBlurFilter and ZoomBlurFilter fragment shaders are retained verbatim;
  the WebGL host substitutes the same 13-sample radial kernel and GLSL output
  binding as Pixi's shader compilation.

Other bundled resource notices remain in `public/THIRD_PARTY_NOTICES.md` and
resource-specific notice files.
