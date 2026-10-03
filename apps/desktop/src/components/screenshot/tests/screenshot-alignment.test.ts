import { describe, expect, it } from 'vitest';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import { createStillCommands } from '@beam/engine/screenshot/still-commands';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createScreenshotAlignment } from '../screenshot-alignment';
const fixture = () => {
  let doc = createStillDocument('project', 'source', 1920, 1080);
  doc.state.image.enabled = false;
  const r = createStillCommands();
  for (const [i, id] of ['a', 'b', 'c'].entries())
    doc = r.execute(doc, {
      type: 'still.layer.add',
      payload: {
        ...doc.state.image,
        ...DEFAULT_SHAPE_LAYER_STYLE,
        id,
        kind: 'shape',
        assetId: '',
        enabled: true,
        transform: { x: 0.2 + i * 0.2, y: 0.2, width: 0.1, height: 0.1 },
      },
    });
  return doc.state;
};
describe('Screenshot gesture alignment', () => {
  it('snaps one layer against all other layers, including locked reference layers', () => {
    const state = fixture();
    state.composition!.find((r) => r.id === 'b')!.locked = true;
    const snap = createScreenshotAlignment(state, null, ['a'], { width: 960, height: 540 });
    const r = snap({ x: 0.198, y: 0 });
    expect(r.translation.x).toBeCloseTo(0.2);
    expect(r.guides).toContainEqual({ type: 'vertical', position: 0.4 });
    expect(r.measurements[0]!.pixels).toBeCloseTo(192);
  });
  it('keeps group spacing and uses a six-screen-pixel tolerance independent of canvas zoom', () => {
    const state = fixture();
    const fit = createScreenshotAlignment(state, null, ['a', 'b'], { width: 960, height: 540 }),
      zoom = createScreenshotAlignment(state, null, ['a', 'b'], { width: 1920, height: 1080 });
    expect(fit({ x: 0.095, y: 0 }).translation.x).toBeCloseTo(0.1);
    expect(zoom({ x: 0.095, y: 0 }).translation.x).toBeCloseTo(0.095);
  });
  it('can bypass snapping while still showing exact measurements', () => {
    const snap = createScreenshotAlignment(fixture(), null, ['a'], { width: 960, height: 540 });
    const r = snap({ x: 0.198, y: 0 }, true);
    expect(r.translation.x).toBeCloseTo(0.198);
    expect(r.guides).toEqual([]);
    expect(r.measurements.length).toBeGreaterThan(1);
  });
  it('handles an empty or locked selection and constrains a drag at canvas boundaries', () => {
    const state = fixture();
    const snap = createScreenshotAlignment(state, null, ['a'], { width: 960, height: 540 });
    expect(snap({ x: 5, y: 0 }).translation.x).toBeCloseTo(0.79);
    expect(createScreenshotAlignment(state, null, [], { width: 960, height: 540 })({ x: 1, y: 1 })).toEqual({
      translation: { x: 0, y: 0 },
      guides: [],
      measurements: [],
    });
  });
});
