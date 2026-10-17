import { describe, expect, it } from 'vitest';
import { recordingLinkComponents } from './recording-link-components';
import type { RecordingClipLink } from './recording-media-link-types';
import { createDefaultClipAppearance } from '../shared/composition-defaults';
import { colorClip } from '../scene/tests/scene-fixtures';
import type { Clip, VisualClip } from '../shared/composition-types';

const screen = (id: string, groupId?: string): VisualClip => ({
  ...colorClip(id),
  kind: 'screen',
  groupId,
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
});

describe('recording graph components', () => {
  it('combines ownership and groups transitively while retaining document order', () => {
    const a = screen('a', 'first'),
      b = screen('b', 'second'),
      c = screen('c', 'second'),
      d = screen('d', 'first');
    const clips = [c, a, d, b];
    const index = recordingLinkComponents(clips, [{ clip: a, owner: b }]);
    expect(index.get('a')).toEqual(clips);
    expect(index.get('a')).toBe(index.get('c'));
    expect(index.get('a')).toBe(index.get('d'));
  });
  it('keeps isolated components independent and accepts empty input or redundant edges', () => {
    const a = screen('a'),
      b = screen('b');
    expect(recordingLinkComponents([], []).size).toBe(0);
    const index = recordingLinkComponents(
      [a, b],
      [
        { clip: a, owner: a },
        { clip: b, owner: null },
      ],
    );
    expect(index.get('a')).toEqual([a]);
    expect(index.get('b')).toEqual([b]);
  });
  it('handles a long ownership chain and cycles without recursion or duplicating member arrays', () => {
    const clips: Clip[] = Array.from({ length: 12000 }, (_, i) => screen(`${i}`));
    const links: RecordingClipLink[] = clips.map((clip, i) => ({
      clip,
      owner: clips[(i + 1) % clips.length] as VisualClip,
    }));
    const index = recordingLinkComponents(clips, links);
    expect(index.size).toBe(12000);
    expect(index.get('0')).toEqual(clips);
    for (let i = 0; i < 12000; i += 43) expect(index.get(`${i}`)).toBe(index.get('0'));
  });
});
