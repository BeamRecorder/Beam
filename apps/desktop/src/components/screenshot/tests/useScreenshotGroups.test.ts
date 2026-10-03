import { describe, it, expect, vi } from 'vitest';
import { shallowRef, ref } from 'vue';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import { createStillCommands } from '@beam/engine/screenshot/still-commands';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import { useScreenshotGroups } from '../useScreenshotGroups';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
vi.mock('~/composables/property-interaction', () => ({
  beginPropertyInteraction: vi.fn(),
  endPropertyInteraction: vi.fn(),
}));
function setup() {
  let doc = createStillDocument('project', 'image.png', 1920, 1080);
  const registry = createStillCommands();
  for (const id of ['a', 'b'])
    doc = registry.execute(doc, {
      type: 'still.layer.add',
      payload: { ...doc.state.image, ...DEFAULT_SHAPE_LAYER_STYLE, id, kind: 'shape' },
    });
  const state = shallowRef<ScreenshotState | null>(doc.state),
    selected = ref(['a', 'b']),
    disabled = ref(false);
  return { state, selected, disabled, ...useScreenshotGroups(state, selected, () => disabled.value) };
}
describe('screenshot group actions', () => {
  it('groups eligible selections and detaches them as one property interaction', () => {
    const g = setup();
    expect(g.canGroup.value).toBe(true);
    expect(g.canUngroup.value).toBe(false);
    expect(g.group()).toBe(true);
    expect(g.canGroup.value).toBe(false);
    expect(g.canUngroup.value).toBe(true);
    expect(g.ungroup()).toBe(true);
    expect(g.canUngroup.value).toBe(false);
  });
  it('ignores unavailable, empty or singleton selections', () => {
    const g = setup();
    g.state.value = null;
    expect(g.group()).toBe(false);
    g.state.value = createStillDocument('project', 'image.png', 1920, 1080).state;
    g.selected.value = [];
    expect(g.group()).toBe(false);
    expect(g.ungroup()).toBe(false);
    g.selected.value = ['image'];
    expect(g.canGroup.value).toBe(false);
  });
  it('blocks disabled, locked and background groups', () => {
    const g = setup();
    g.disabled.value = true;
    expect(g.group()).toBe(false);
    g.disabled.value = false;
    g.selected.value = ['__background__', 'a'];
    expect(g.canGroup.value).toBe(false);
    g.selected.value = ['a', 'b'];
    g.group();
    g.state.value = {
      ...g.state.value!,
      composition: g.state.value!.composition!.map((r) => (r.id === 'a' ? { ...r, locked: true } : r)),
    };
    expect(g.canUngroup.value).toBe(false);
    expect(g.ungroup()).toBe(false);
  });
});
