import { describe, expect, it } from 'vitest';
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
        style: { ...createDefaultCaptionStyle(), ...(imported ? { fontAssetId: imported } : {}) },
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
    expect(projectFontSources(doc)).toEqual({ [id]: `project-media://font/${id}` });
    expect(doc.clips).toHaveLength(1);
  });
  it('deduplicates imported fonts shared by multiple captions', () => {
    const id = 'a'.repeat(64);
    expect(Object.keys(projectFontSources(captions(['a', 'b'], id)))).toEqual([id]);
  });
});
