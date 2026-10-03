import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import { capture } from '~/api/capture';
import type { CaptureProject } from '~/api/types/capture-api';

export function useProjectCatalog(query: Ref<string>, active: () => boolean) {
  const projects = ref<CaptureProject[]>([]);
  const total = ref(0);
  const isLoading = ref(true);
  const isLoadingMore = ref(false);
  const errorMessage = ref('');
  const loadMoreError = ref('');
  const nextCursor = ref<string | null>(null);
  const version = ref(0);
  const hasMore = computed(() => nextCursor.value !== null);
  let loadedQuery: string | null = null;
  let completeCatalogue: CaptureProject[] | null = null;
  let generation = 0;
  let disposed = false;
  let loading: Promise<void> | null = null;
  let more: Promise<void> | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const normalizedQuery = () => query.value.trim().toLowerCase();
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

  const load = (force = false) => {
    if (disposed) return Promise.resolve();
    if (loading) return loading;
    const current = ++generation;
    const search = normalizedQuery();
    completeCatalogue = null;
    const retainPosition = loadedQuery === search;
    const targetCount = retainPosition ? Math.max(40, projects.value.length) : 40;
    isLoading.value = projects.value.length === 0;
    isLoadingMore.value = false;
    more = null;
    errorMessage.value = '';
    loadMoreError.value = '';
    const request = capture
      .listProjectsPage({ query: search, limit: 40, force })
      .then(async (first) => {
        if (disposed || current !== generation) return;
        let page = first;
        let next = [...page.projects];
        while (
          retainPosition &&
          next.length < targetCount &&
          page.nextCursor &&
          active() &&
          !disposed &&
          current === generation
        ) {
          const cursor = page.nextCursor;
          page = await capture.listProjectsPage({ query: search, cursor, limit: 40 });
          if (page.reset) {
            next = [...page.projects];
            break;
          }
          if (page.nextCursor === cursor) throw new Error('Invalid project catalogue continuation.');
          const existing = new Set(next.map((project) => project.id));
          next.push(...page.projects.filter((project) => !existing.has(project.id)));
        }
        if (disposed || current !== generation) return;
        projects.value = next;
        nextCursor.value = page.nextCursor;
        total.value = page.total;
        loadedQuery = search;
        if (!search && !page.nextCursor) completeCatalogue = next;
        if (!retainPosition || page.reset) version.value++;
      })
      .catch((error: unknown) => {
        if (current === generation && !disposed) {
          if (!retainPosition) projects.value = [];
          errorMessage.value = message(error);
        }
      })
      .finally(() => {
        if (current !== generation || disposed) return;
        loading = null;
        isLoading.value = false;
      });
    loading = request;
    return request;
  };
  const loadMore = () => {
    const search = normalizedQuery();
    if (disposed || !active() || !nextCursor.value || loading || loadedQuery !== search) return Promise.resolve();
    if (more) return more;
    const current = generation;
    isLoadingMore.value = true;
    loadMoreError.value = '';
    const cursor = nextCursor.value;
    const request = capture
      .listProjectsPage({ query: search, cursor, limit: 40 })
      .then((page) => {
        if (disposed || current !== generation) return;
        if (page.nextCursor === cursor && !page.reset) throw new Error('Invalid project catalogue continuation.');
        if (page.reset) {
          projects.value = page.projects;
          version.value++;
        } else {
          const existing = new Set(projects.value.map((project) => project.id));
          projects.value.push(...page.projects.filter((project) => !existing.has(project.id)));
        }
        nextCursor.value = page.nextCursor;
        total.value = page.total;
        if (!search && !page.nextCursor) completeCatalogue = [...projects.value];
      })
      .catch((error: unknown) => {
        if (current === generation && !disposed) loadMoreError.value = message(error);
      })
      .finally(() => {
        if (current !== generation || disposed) return;
        more = null;
        isLoadingMore.value = false;
      });
    more = request;
    return request;
  };
  const invalidate = (clearComplete = true) => {
    generation++;
    loading = null;
    more = null;
    loadedQuery = null;
    nextCursor.value = null;
    isLoadingMore.value = false;
    if (clearComplete) completeCatalogue = null;
  };
  const loadAll = async () => {
    if (loading) await loading;
    if (loadedQuery !== normalizedQuery()) await load();
    if (errorMessage.value) throw new Error(errorMessage.value);
    const current = generation;
    while (!disposed && active() && current === generation && nextCursor.value) {
      await loadMore();
      if (loadMoreError.value) throw new Error(loadMoreError.value);
    }
    return projects.value;
  };
  watch(query, () => {
    if (searchTimer) clearTimeout(searchTimer);
    invalidate(false);
    if (completeCatalogue) {
      const search = normalizedQuery();
      projects.value = completeCatalogue.filter((project) => project.name.toLowerCase().includes(search));
      total.value = projects.value.length;
      loadedQuery = search;
      errorMessage.value = '';
      loadMoreError.value = '';
      isLoading.value = false;
      version.value++;
      return;
    }
    if (!active()) return;
    searchTimer = setTimeout(() => {
      searchTimer = null;
      void load();
    }, 150);
  });
  watch(active, (visible) => {
    if (visible) return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = null;
    generation++;
    loading = null;
    more = null;
    isLoading.value = false;
    isLoadingMore.value = false;
  });
  onUnmounted(() => {
    disposed = true;
    generation++;
    if (searchTimer) clearTimeout(searchTimer);
  });
  return {
    projects,
    total,
    isLoading,
    isLoadingMore,
    errorMessage,
    loadMoreError,
    version,
    hasMore,
    load,
    loadMore,
    loadAll,
    invalidate,
    hasLoaded: () => loadedQuery !== null,
  };
}
