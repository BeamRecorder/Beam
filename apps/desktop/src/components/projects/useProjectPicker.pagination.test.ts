import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectCatalogPage } from '~/api/types/project-catalog';
import { captureMock as capture } from '../hud/tests/capture.mock';
vi.mock('~/api/capture', () => ({ capture }));
import { useProjectPicker } from './useProjectPicker';
enableAutoUnmount(afterEach);
const batch = (offset: number, count = 40, nextCursor: string | null = null): ProjectCatalogPage => ({
  projects: Array.from(
    { length: count },
    (_, index) =>
      ({
        id: String(offset + index),
        name: `Project ${offset + index}`,
        mode: 'studio',
        createdAt: '',
        updatedAt: '',
        sessionCount: 0,
        previewSrc: null,
        thumbnailSrc: null,
      }) as CaptureProject,
  ),
  total: 92,
  nextCursor,
});
async function create() {
  const props = reactive({ compact: false, currentProjectId: null, active: true });
  let picker!: ReturnType<typeof useProjectPicker>;
  const wrapper = mount(
    defineComponent({
      setup() {
        picker = useProjectPicker(props, vi.fn());
        return () =>
          picker.isLoading.value
            ? null
            : h('div', { ref: picker.containerProps.ref }, [h('div', { ref: picker.gridRef })]);
      },
    }),
  );
  await flushPromises();
  return { picker, props, wrapper };
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(680);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  capture.listProjectsPage.mockReset().mockResolvedValueOnce(batch(0, 40, 'second'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('automatically appends the next batch near the virtual grid end, without loading the whole library', async () => {
  const { picker } = await create();
  expect(picker.projects.value).toHaveLength(40);
  expect(capture.listProjectsPage).toHaveBeenCalledOnce();
  capture.listProjectsPage.mockResolvedValueOnce(batch(40, 40, 'third'));
  picker.containerProps.ref.value!.scrollTop = 2200;
  for (let index = 0; index < 10; index++) picker.containerProps.onScroll();
  await flushPromises();
  expect(capture.listProjectsPage).toHaveBeenCalledTimes(2);
  expect(capture.listProjectsPage).toHaveBeenLastCalledWith({ query: '', cursor: 'second', limit: 40 });
  expect(picker.projects.value).toHaveLength(80);
  capture.listProjectsPage.mockResolvedValueOnce(batch(80, 12));
  picker.containerProps.ref.value!.scrollTop = 5600;
  picker.containerProps.onScroll();
  await flushPromises();
  expect(picker.projects.value).toHaveLength(92);
  expect(capture.listProjectsPage).toHaveBeenCalledTimes(3);
});
it('selects all matches including unloaded pages and shows partial selection for the first page', async () => {
  const { picker } = await create();
  picker.toggleSelectionMode();
  for (const project of picker.projects.value) picker.toggleBatchSelect(project.id);
  expect(picker.isAllSelected.value).toBe(false);
  expect(picker.isSomeSelected.value).toBe(true);
  capture.listProjectsPage.mockResolvedValueOnce(batch(40, 40, 'third')).mockResolvedValueOnce(batch(80, 12));
  const selecting = picker.toggleSelectAll();
  await picker.toggleSelectAll();
  await selecting;
  expect(picker.selectedBatchIds.value.size).toBe(92);
  expect(picker.isAllSelected.value).toBe(true);
  expect(capture.listProjectsPage).toHaveBeenCalledTimes(3);
});
it('searches beyond the loaded page without first loading intermediate projects', async () => {
  const { picker } = await create();
  vi.useFakeTimers();
  capture.listProjectsPage.mockResolvedValueOnce({ ...batch(91, 1), total: 1 });
  picker.searchQuery.value = 'Project 91';
  await flushPromises();
  await vi.advanceTimersByTimeAsync(150);
  expect(picker.filteredProjects.value.map((project) => project.id)).toEqual(['91']);
  expect(capture.listProjectsPage).toHaveBeenCalledTimes(2);
  expect(capture.listProjectsPage).toHaveBeenLastCalledWith({ query: 'project 91', limit: 40, force: false });
});
it('closing and reopening selection cannot apply a stale select-all response', async () => {
  const { picker } = await create();
  let complete!: (page: ProjectCatalogPage) => void;
  capture.listProjectsPage.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  picker.toggleSelectionMode();
  const selecting = picker.toggleSelectAll();
  picker.toggleSelectionMode();
  picker.toggleSelectionMode();
  complete(batch(40, 52));
  await selecting;
  expect(picker.selectedBatchIds.value.size).toBe(0);
});
