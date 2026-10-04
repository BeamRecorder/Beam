import { describe, it, expect, vi } from 'vitest';
import { shallowRef, ref } from 'vue';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import { createStillCommands } from '@beam/engine/screenshot/still-commands';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import { useScreenshotGroups } from '../useScreenshotGroups';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import { groupScreenshotLayers } from '@beam/engine/screenshot/screenshot-groups';
vi.mock('~/composables/property-interaction', () => ({
  beginPropertyInteraction: vi.fn(),
  endPropertyInteraction: vi.fn(),
}));
function setup() {
  let doc = createStillDocument('project', 'image.png', 1920, 1080);
  const registry = createStillCommands();
  for (const id of ['a', 'b', 'c'])
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
  it('moves a member into a precise slot and keeps only the dragged member selected', () => {
    const g = setup();
    g.group();
    const groupId = g.state.value!.composition!.find((layer) => layer.id === 'a')!.groupId!;
    expect(g.canMoveToGroup('c', groupId)).toBe(true);
    expect(g.moveToGroup('c', groupId, 0)).toBe(true);
    expect(g.selected.value).toEqual(['c']);
    expect(g.state.value!.composition!.at(-1)?.id).toBe('c');
  });
  it('detaches just the dragged member, clears singleton groups and selects the standalone layer', () => {
    const g = setup();
    g.state.value = groupScreenshotLayers(g.state.value!, ['a', 'b'], 'pair');
    expect(g.moveToGroup('a', null, 0)).toBe(true);
    expect(g.selected.value).toEqual(['a']);
    expect(g.state.value!.composition!.some((layer) => layer.groupId)).toBe(false);
  });
  it('rechecks unavailable and locked group moves at commit time', () => {
    const g = setup();
    g.group();
    const groupId = g.state.value!.composition!.find((layer) => layer.id === 'a')!.groupId!;
    g.disabled.value = true;
    expect(g.moveToGroup('c', groupId, 0)).toBe(false);
    g.disabled.value = false;
    expect(g.moveToGroup('c', 'missing', 0)).toBe(false);
    g.state.value = null;
    expect(g.canMoveToGroup('c', groupId)).toBe(false);
    expect(g.moveToGroup('c', groupId, 0)).toBe(false);
  });
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
