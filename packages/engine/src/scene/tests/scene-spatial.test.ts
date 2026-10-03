// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createScenePointMapper } from '../scene-spatial';
import { group, sceneDocument } from './scene-fixtures';
describe('scene point projection', () => {
  it('keeps flat and ungrouped clip coordinates identical', () => {
    const doc = sceneDocument();
    delete doc.scene;
    expect(createScenePointMapper(doc, 200, 100)('a', { cx: 0.2, cy: 0.3 }, 0)).toEqual({ cx: 0.2, cy: 0.3 });
  });
  it('composes nested rotation, scale and offsets in physical canvas coordinates', () => {
    const doc = sceneDocument();
    doc.scene!.groups = [
      { ...group(), transform: { x: 0.1, y: 0, scaleX: 2, scaleY: 1, rotation: 90 } },
      { ...group('outer', ['g']), transform: { x: -0.1, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } },
    ];
    doc.scene!.roots = ['outer'];
    const result = createScenePointMapper(doc, 200, 100)('a', { cx: 0.75, cy: 0.5 }, 0);
    expect(result.cx).toBeCloseTo(0.5);
    expect(result.cy).toBeCloseTo(1.5);
    expect(doc.scene!.groups[0]!.transform.x).toBe(0.1);
  });
  it('uses the same animated parent transform when seeking backward', () => {
    const doc = sceneDocument();
    doc.animations!.tracks = [
      {
        id: 'group-motion',
        targetId: 'g',
        property: 'transform.x',
        interpolation: 'number',
        keyframes: [
          { timeMs: 0, value: 0 },
          { timeMs: 1000, value: 0.5 },
        ],
      },
    ];
    const map = createScenePointMapper(doc, 100, 100);
    expect(map('a', { cx: 0.5, cy: 0.5 }, 500).cx).toBe(0.75);
    expect(map('a', { cx: 0.5, cy: 0.5 }, 100).cx).toBe(0.55);
    expect(map('a', { cx: 0.5, cy: 0.5 }, 500).cx).toBe(0.75);
  });
});
