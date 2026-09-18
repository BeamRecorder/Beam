import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import type { ScreenshotLayer } from '../screenshot-layer-types';
import { useScreenshotSelection } from '../useScreenshotSelection';

const makeLayer = (id: string, overrides: Partial<ScreenshotLayer> = {}): ScreenshotLayer => ({
  id,
  kind: 'shape',
  name: id,
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
  visible: true,
  ...overrides,
});

const wrappers: VueWrapper[] = [];

const mountSelection = (initialLayers: ScreenshotLayer[] = [makeLayer('a'), makeLayer('b'), makeLayer('c')]) => {
  const layers = ref(initialLayers);
  let selection!: ReturnType<typeof useScreenshotSelection>;
  const wrapper = mount(
    defineComponent({
      setup() {
        selection = useScreenshotSelection(() => layers.value);
        return () => h('div');
      },
    }),
  );
  wrappers.push(wrapper);
  return { layers, selection, wrapper };
};

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('useScreenshotSelection', () => {
  it('starts with no primary or selected layers', () => {
    const { selection } = mountSelection();

    expect(selection.selectedIds.value).toEqual([]);
    expect(selection.selectedId.value).toBeNull();
  });

  it('replaces the selection by default, ignores unknown IDs, and clears on a normal null selection', () => {
    const { selection } = mountSelection();

    selection.select('a');
    expect(selection.selectedIds.value).toEqual(['a']);
    expect(selection.selectedId.value).toBe('a');

    selection.select('b');
    expect(selection.selectedIds.value).toEqual(['b']);
    expect(selection.selectedId.value).toBe('b');

    selection.select('missing');
    expect(selection.selectedIds.value).toEqual(['b']);
    expect(selection.selectedId.value).toBe('b');

    selection.select(null);
    expect(selection.selectedIds.value).toEqual([]);
    expect(selection.selectedId.value).toBeNull();
  });

  it('adds and removes members in toggle mode while keeping the last member primary', () => {
    const { selection } = mountSelection();

    selection.select('a');
    selection.select('b', 'toggle');
    expect(selection.selectedIds.value).toEqual(['a', 'b']);
    expect(selection.selectedId.value).toBe('b');

    selection.select('c', 'toggle');
    expect(selection.selectedIds.value).toEqual(['a', 'b', 'c']);
    expect(selection.selectedId.value).toBe('c');

    selection.select('c', 'toggle');
    expect(selection.selectedIds.value).toEqual(['a', 'b']);
    expect(selection.selectedId.value).toBe('b');

    selection.select('missing', 'toggle');
    selection.select(null, 'toggle');
    expect(selection.selectedIds.value).toEqual(['a', 'b']);
    expect(selection.selectedId.value).toBe('b');

    selection.select('b', 'toggle');
    expect(selection.selectedIds.value).toEqual(['a']);
    expect(selection.selectedId.value).toBe('a');
  });

  it('replaces the selection with valid marquee IDs and keeps its explicit primary last', () => {
    const { selection } = mountSelection();

    selection.selectMany(['c', 'missing', 'a', 'c'], 'a');

    expect(selection.selectedIds.value).toEqual(['c', 'a']);
    expect(selection.selectedId.value).toBe('a');
  });

  it('keeps selectedId writable as a single-selection compatibility interface', () => {
    const { selection } = mountSelection();

    selection.select('a');
    selection.select('b', 'toggle');
    selection.selectedId.value = 'c';
    expect(selection.selectedIds.value).toEqual(['c']);
    expect(selection.selectedId.value).toBe('c');

    selection.selectedId.value = null;
    expect(selection.selectedIds.value).toEqual([]);
    expect(selection.selectedId.value).toBeNull();
  });

  it('removes deleted layer IDs and does not restore selection when an ID returns', async () => {
    const { layers, selection } = mountSelection();
    selection.select('a');
    selection.select('b', 'toggle');
    selection.select('c', 'toggle');

    layers.value = layers.value.filter((layer) => layer.id !== 'c');
    await nextTick();

    expect(selection.selectedIds.value).toEqual(['a', 'b']);
    expect(selection.selectedId.value).toBe('b');

    layers.value.push(makeLayer('c'));
    await nextTick();

    expect(selection.selectedIds.value).toEqual(['a', 'b']);
    expect(selection.selectedId.value).toBe('b');
  });

  it('keeps selection when layers become locked or hidden', async () => {
    const { layers, selection } = mountSelection();
    selection.select('a');
    selection.select('b', 'toggle');

    const first = layers.value.find((layer) => layer.id === 'a');
    const second = layers.value.find((layer) => layer.id === 'b');
    if (!first || !second) throw new Error('Expected the selected layers.');
    first.locked = true;
    second.visible = false;
    await nextTick();

    expect(selection.selectedIds.value).toEqual(['a', 'b']);
    expect(selection.selectedId.value).toBe('b');
  });
});
