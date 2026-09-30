import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref, type Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
const observed = vi.hoisted(() => ({ width: null as Ref<number> | null }));
vi.mock('@vueuse/core', async (original) => {
  const actual = await original<typeof import('@vueuse/core')>();
  const { ref } = await import('vue');
  return { ...actual, useElementSize: () => ({ width: (observed.width = ref(0)), height: ref(0) }) };
});
import { useProjectGrid } from './useProjectGrid';

const create = async (count = 30, width = 680) => {
  const projects = ref(Array.from({ length: count }, (_, index) => ({ id: String(index) }) as CaptureProject));
  const compact = ref(false);
  let grid!: ReturnType<typeof useProjectGrid>;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  const wrapper = mount(
    defineComponent({
      setup() {
        grid = useProjectGrid(projects, () => compact.value);
        return () => h('div', { ref: grid.containerProps.ref }, [h('div', { ref: grid.gridRef })]);
      },
    }),
  );
  await flushPromises();
  return { grid, wrapper, projects, compact };
};
afterEach(() => vi.restoreAllMocks());

describe('responsive virtual project grid', () => {
  it('measures the list on mount while native ResizeObserver has not fired', async () => {
    const { grid, wrapper } = await create();
    expect(grid.gridStyle.value['--project-columns']).toBe(3);
    expect(grid.list.value[0].data.map((project) => project.id)).toEqual(['0', '1', '2']);
    expect(Number.parseFloat(grid.wrapperProps.value.style.height)).toBeCloseTo(10 * (664 / 3 + 12));
    wrapper.unmount();
  });
  it('keeps the current project row visible when changing the number of columns', async () => {
    const { grid, wrapper } = await create();
    const container = grid.containerProps.ref.value!;
    container.scrollTop = 2 * (664 / 3 + 12);
    observed.width!.value = 520;
    await flushPromises();
    expect(grid.gridStyle.value['--project-columns']).toBe(2);
    expect(container.scrollTop).toBeCloseTo(3 * 268);
    expect(grid.list.value.some((row) => row.data.some((project) => project.id === '6'))).toBe(true);
    wrapper.unmount();
  });
  it('updates the row height without changing the number of columns and clamps the end', async () => {
    const { grid, wrapper } = await create(9);
    const container = grid.containerProps.ref.value!;
    container.scrollTop = 9_000;
    observed.width!.value = 700;
    await flushPromises();
    expect(grid.gridStyle.value['--project-columns']).toBe(3);
    expect(container.scrollTop).toBeCloseTo(3 * (684 / 3 + 12) - 300);
    expect(grid.list.value.at(-1)!.data.at(-1)!.id).toBe('8');
    wrapper.unmount();
  });
  it('supports compact layouts, empty lists and detached elements', async () => {
    const { grid, wrapper, projects, compact } = await create(0, 0);
    expect(grid.list.value).toEqual([]);
    expect(grid.gridStyle.value['--project-card-size']).toBe('0px');
    compact.value = true;
    observed.width!.value = 288;
    projects.value = [{ id: 'new' } as CaptureProject];
    await flushPromises();
    expect(grid.gridStyle.value['--project-columns']).toBe(2);
    expect(grid.list.value[0].data[0].id).toBe('new');
    grid.containerProps.ref.value = null;
    grid.gridRef.value = null;
    observed.width!.value = 500;
    await flushPromises();
    wrapper.unmount();
  });
});
