import { describe, expect, it } from 'vitest';
import { ANIMATED_FRAME_PRESETS, validateAnimatedFrame } from './animated-frame-schema.js';
import { DEFAULT_ANIMATED_FRAME } from './animated-frame-types';
import { validateComposition } from '../commands/clip-composition-validation';
import { createStillDocument, validateStillDocument } from '../screenshot/still-document';
import { emptyComposition } from './composition-types';

describe('animated frame contract', () => {
  it.each(ANIMATED_FRAME_PRESETS)('validates the %s preset and bounded editable controls', (preset) => {
    for (const width of [1, 3, 16])
      for (const speed of [0, 1, 3]) expect(() => validateAnimatedFrame({ preset, width, speed })).not.toThrow();
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { ...DEFAULT_ANIMATED_FRAME, preset: 'random' },
    ...[0, 17, NaN, Infinity, '1'].map((width) => ({ ...DEFAULT_ANIMATED_FRAME, width })),
    ...[-1, 4, NaN, Infinity, '1'].map((speed) => ({ ...DEFAULT_ANIMATED_FRAME, speed })),
    { ...DEFAULT_ANIMATED_FRAME, shader: 'code' },
  ])('rejects malformed settings %j', (value) => {
    expect(() => validateAnimatedFrame(value)).toThrow('Invalid animated frame');
  });
  it('enforces the same saved settings at the composition and still-document boundaries', () => {
    const document = createStillDocument('image-document', 'source.png', 800, 600);
    const clip = document.state.image;
    clip.trackId = 'visual';
    clip.timelineDurationMs = clip.sourceDurationMs = 1000;
    clip.appearance.frame = 'animated';
    clip.appearance.animatedFrame = { ...DEFAULT_ANIMATED_FRAME, speed: 0 };
    const composition = {
      ...emptyComposition(),
      assets: [
        {
          id: 'source',
          kind: 'image' as const,
          name: 'Image',
          origin: 'project' as const,
          durationMs: 1000,
          fileName: null,
          width: 800,
          height: 600,
          src: 'source.png',
        },
      ],
      clips: [clip],
    };
    expect(() => validateComposition(composition)).not.toThrow();
    expect(() => validateStillDocument(document)).not.toThrow();
    Object.assign(clip.appearance.animatedFrame, { width: 17 });
    expect(() => validateComposition(composition)).toThrow('Invalid animated frame');
    expect(() => validateStillDocument(document)).toThrow('Invalid animated frame');
  });
});
