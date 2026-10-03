import { describe, expect, it } from 'vitest';
import { createElementText } from '@beam/engine/shared/element-text';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import { projectFontSources } from './project-font-sources';
const captions = (ids: string[], imported?: string) => {
  const doc = emptyComposition();
  for (const id of ids)
    doc.clips.push({
      id,
      name: 'Text',
      kind: 'caption',
      timelineStartMs: 0,
      timelineDurationMs: 1000,
      sourceInMs: 0,
      sourceDurationMs: 1000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      caption: {
        type: 'text',
        sentences: [],
        style: {
          ...createDefaultCaptionStyle(),
          ...(imported ? { fontAssetId: imported } : {}),
        },
      },
    });
  return doc;
};
describe('desktop font URL resolution', () => {
  it('does not add system fonts or invent resources for empty documents', () => {
    expect(projectFontSources(emptyComposition())).toEqual({});
    expect(projectFontSources(captions(['system']))).toEqual({});
  });
  it('resolves imported fonts without modifying caption data', () => {
    const id = 'a'.repeat(64),
      doc = captions(['a'], id);
    expect(projectFontSources(doc)).toEqual({
      [id]: `project-media://font/${id}`,
    });
    expect(doc.clips).toHaveLength(1);
  });
  it('deduplicates imported fonts shared by multiple captions', () => {
    const id = 'a'.repeat(64);
    expect(Object.keys(projectFontSources(captions(['a', 'b'], id)))).toEqual([id]);
  });
  it('includes imported fonts from editable native screenshot text', () => {
    const id = 'b'.repeat(64),
      text = createElementText('Beam');
    text.style.fontAssetId = id;
    const base = captions(['text']).clips[0]!;
    const shape = {
      ...base,
      kind: 'shape' as const,
      assetId: '',
      transform: { x: 0, y: 0, width: 1, height: 1 },
      ...DEFAULT_SHAPE_LAYER_STYLE,
      family: 'text' as const,
      preset: 'text' as const,
      text,
    };
    expect(projectFontSources({ clips: [shape] })).toEqual({ [id]: `project-media://font/${id}` });
    expect(text.content).toBe('Beam');
  });
});
