import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
import type { ProjectCatalogPage, ProjectCatalogRequest } from '~/api/types/project-catalog';
const bridge = vi.hoisted(() => ({
  listProjectsPage: vi.fn<(request?: ProjectCatalogRequest) => Promise<ProjectCatalogPage>>(),
}));
vi.mock('~/api/capture', () => ({ capture: bridge }));
import { useProjectCatalog } from './useProjectCatalog';
enableAutoUnmount(afterEach);
const project = (id: string, name = id) =>
  ({
    id,
    name,
    mode: 'studio',
    createdAt: '',
    updatedAt: '',
    sessionCount: 0,
    previewSrc: null,
    thumbnailSrc: null,
  }) as CaptureProject;
const page = (ids: string[], total = ids.length, nextCursor: string | null = null): ProjectCatalogPage => ({
  projects: ids.map((id) => project(id)),
  total,
  nextCursor,
});
function create() {
  const query = ref(''),
    active = ref(true);
  let catalog!: ReturnType<typeof useProjectCatalog>;
  const wrapper = mount(
    defineComponent({
      setup() {
        catalog = useProjectCatalog(query, () => active.value);
        return () => null;
      },
    }),
  );
  return { catalog, query, active, wrapper };
}
beforeEach(() => {
  vi.useFakeTimers();
  bridge.listProjectsPage.mockReset().mockResolvedValue(page(['one', 'two'], 4, 'next'));
});
afterEach(() => vi.useRealTimers());

it('loads only the first bounded page and shares concurrent first-page requests', async () => {
  const { catalog } = create();
  const first = catalog.load();
  expect(catalog.load()).toBe(first);
  await first;
  expect(bridge.listProjectsPage).toHaveBeenCalledOnce();
  expect(bridge.listProjectsPage).toHaveBeenCalledWith({ query: '', limit: 40, force: false });
  expect(catalog.projects.value).toHaveLength(2);
  expect(catalog.total.value).toBe(4);
  expect(catalog.hasMore.value).toBe(true);
});
it('appends automatic batches, deduplicates records and shares a pending continuation', async () => {
  const { catalog } = create();
  await catalog.load();
  bridge.listProjectsPage.mockResolvedValueOnce(page(['two', 'three', 'four'], 4));
  const next = catalog.loadMore();
  expect(catalog.loadMore()).toBe(next);
  await next;
  expect(catalog.projects.value.map((item) => item.id)).toEqual(['one', 'two', 'three', 'four']);
  expect(catalog.hasMore.value).toBe(false);
  await catalog.loadMore();
  expect(bridge.listProjectsPage).toHaveBeenCalledTimes(2);
});
it('queries the entire indexed catalogue for a match outside loaded pages', async () => {
  const { catalog, query } = create();
  await catalog.load();
  bridge.listProjectsPage.mockResolvedValueOnce(page(['outside']));
  query.value = ' OUTSIDE ';
  await nextTick();
  await vi.advanceTimersByTimeAsync(149);
  expect(bridge.listProjectsPage).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(bridge.listProjectsPage).toHaveBeenLastCalledWith({ query: 'outside', limit: 40, force: false });
  expect(catalog.projects.value[0]?.id).toBe('outside');
});
it('filters locally only after every project has been loaded', async () => {
  const { catalog, query } = create();
  bridge.listProjectsPage.mockResolvedValueOnce(page(['one', 'two']));
  await catalog.load();
  query.value = 'two';
  await nextTick();
  expect(catalog.projects.value.map((item) => item.id)).toEqual(['two']);
  query.value = '';
  await nextTick();
  expect(catalog.projects.value).toHaveLength(2);
  expect(bridge.listProjectsPage).toHaveBeenCalledOnce();
});
it('ignores old search and pagination replies after the search changes', async () => {
  const { catalog, query } = create();
  await catalog.load();
  let resolve!: (page: ProjectCatalogPage) => void;
  bridge.listProjectsPage.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const older = catalog.loadMore();
  query.value = 'fresh';
  bridge.listProjectsPage.mockResolvedValueOnce(page(['fresh']));
  await nextTick();
  await vi.advanceTimersByTimeAsync(150);
  resolve(page(['stale']));
  await older;
  expect(catalog.projects.value.map((item) => item.id)).toEqual(['fresh']);
});
it('replaces rather than appends a new snapshot when a continuation becomes stale', async () => {
  const { catalog } = create();
  await catalog.load();
  const version = catalog.version.value;
  bridge.listProjectsPage.mockResolvedValueOnce({ ...page(['fresh'], 4, 'new-cursor'), reset: true });
  await catalog.loadMore();
  expect(catalog.projects.value.map((item) => item.id)).toEqual(['fresh']);
  expect(catalog.version.value).toBe(version + 1);
});
it('keeps existing cards when a continuation fails and supports retry', async () => {
  const { catalog } = create();
  await catalog.load();
  bridge.listProjectsPage.mockRejectedValueOnce(new Error('offline'));
  await catalog.loadMore();
  expect(catalog.projects.value).toHaveLength(2);
  expect(catalog.loadMoreError.value).toBe('offline');
  bridge.listProjectsPage.mockResolvedValueOnce(page(['three', 'four'], 4));
  await catalog.loadMore();
  expect(catalog.projects.value).toHaveLength(4);
  expect(catalog.loadMoreError.value).toBe('');
});
it('stops malformed non-advancing cursors and does not loop forever during select-all', async () => {
  const { catalog } = create();
  await catalog.load();
  await expect(catalog.loadAll()).rejects.toThrow('continuation');
  expect(bridge.listProjectsPage).toHaveBeenCalledTimes(2);
});
it('loads the full matching selection only when explicitly requested', async () => {
  const { catalog } = create();
  await catalog.load();
  bridge.listProjectsPage.mockResolvedValueOnce(page(['three'], 4, 'last')).mockResolvedValueOnce(page(['four'], 4));
  await catalog.loadAll();
  expect(catalog.projects.value).toHaveLength(4);
  expect(bridge.listProjectsPage).toHaveBeenCalledTimes(3);
});

it('select-all waits for an ongoing revalidation rather than spinning on an unavailable continuation', async () => {
  const { catalog, active } = create();
  await catalog.load();
  let finish!: (page: ProjectCatalogPage) => void;
  bridge.listProjectsPage.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const revalidating = catalog.load();
  const visibilityReads = vi.spyOn(active, 'value', 'get');
  const selecting = catalog.loadAll();
  await Promise.resolve();
  await Promise.resolve();
  expect(visibilityReads).not.toHaveBeenCalled();
  expect(bridge.listProjectsPage).toHaveBeenCalledTimes(2);
  finish(page(['one', 'two'], 4, 'next'));
  bridge.listProjectsPage.mockResolvedValueOnce(page(['three', 'four'], 4));
  await revalidating;
  await selecting;
  expect(catalog.projects.value).toHaveLength(4);
  expect(bridge.listProjectsPage).toHaveBeenCalledTimes(3);
});
it('restores the already viewed batches during revalidation without resetting scroll position', async () => {
  const { catalog } = create();
  const ids = Array.from({ length: 40 }, (_, index) => String(index));
  bridge.listProjectsPage.mockResolvedValueOnce(page(ids, 80, 'next'));
  await catalog.load();
  bridge.listProjectsPage.mockResolvedValueOnce(
    page(
      ids.map((id) => `more-${id}`),
      80,
    ),
  );
  await catalog.loadMore();
  const version = catalog.version.value;
  bridge.listProjectsPage.mockResolvedValueOnce(page(ids, 80, 'next')).mockResolvedValueOnce(
    page(
      ids.map((id) => `more-${id}`),
      80,
    ),
  );
  await catalog.load();
  expect(catalog.projects.value).toHaveLength(80);
  expect(catalog.version.value).toBe(version);
});
it('does not load more or run a queued search while hidden', async () => {
  const { catalog, query, active } = create();
  await catalog.load();
  query.value = 'other';
  await nextTick();
  active.value = false;
  await nextTick();
  await vi.advanceTimersByTimeAsync(200);
  await catalog.loadMore();
  expect(bridge.listProjectsPage).toHaveBeenCalledOnce();
});
it('ignores pending replies after disposal and cannot start more requests', async () => {
  const { catalog, wrapper } = create();
  let resolve!: (page: ProjectCatalogPage) => void;
  bridge.listProjectsPage.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const loading = catalog.load();
  wrapper.unmount();
  resolve(page(['late']));
  await loading;
  await catalog.load();
  await catalog.loadMore();
  expect(catalog.projects.value).toEqual([]);
  expect(bridge.listProjectsPage).toHaveBeenCalledOnce();
});
it('makes first-load failures actionable and handles empty and forced-refresh results', async () => {
  const { catalog } = create();
  bridge.listProjectsPage.mockRejectedValueOnce('offline');
  await catalog.load();
  expect(catalog.errorMessage.value).toBe('offline');
  expect(catalog.isLoading.value).toBe(false);
  bridge.listProjectsPage.mockResolvedValueOnce(page([]));
  await catalog.load(true);
  expect(catalog.errorMessage.value).toBe('');
  expect(catalog.total.value).toBe(0);
  expect(catalog.hasMore.value).toBe(false);
  expect(bridge.listProjectsPage).toHaveBeenLastCalledWith({ query: '', limit: 40, force: true });
  await flushPromises();
});
