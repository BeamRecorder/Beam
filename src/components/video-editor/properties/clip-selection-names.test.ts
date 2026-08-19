import { describe, expect, it } from 'vitest';
import type { Clip, VisualClip } from '~/media/shared/composition-types';
import { selectedClipNames } from './clip-selection-names';

const namedClip = (id: string, name: string): Clip => ({ id, name }) as Clip;
const freezeFrameClip = (id: string): VisualClip =>
  ({ id, kind: 'screen', name: 'Screen Recording', freezeFrameSourceMs: 1_000 }) as VisualClip;
const freezeFrameName = 'Figer la frame…';

describe('selectedClipNames', () => {
  it('returns copied clips with the same name as separate description items', () => {
    expect(
      selectedClipNames(
        [
          namedClip('one', 'Screen Recording'),
          namedClip('two', 'Screen Recording'),
          namedClip('three', 'Screen Recording'),
        ],
        freezeFrameName,
      ),
    ).toEqual(['Screen Recording', 'Screen Recording', 'Screen Recording']);
  });

  it('uses the translated freeze-frame label for every copied freeze-frame clip', () => {
    expect(selectedClipNames([freezeFrameClip('freeze-one'), freezeFrameClip('freeze-two')], freezeFrameName)).toEqual([
      freezeFrameName,
      freezeFrameName,
    ]);
  });

  it('trims names and omits empty descriptions', () => {
    expect(
      selectedClipNames(
        [
          namedClip('one', '  Screen Recording  '),
          namedClip('two', '   '),
          namedClip('three', ''),
          namedClip('four', '\t'),
          namedClip('five', '  Screen Recording  '),
        ],
        freezeFrameName,
      ),
    ).toEqual(['Screen Recording', 'Screen Recording']);
  });
});
