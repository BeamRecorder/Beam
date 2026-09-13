import { computed, nextTick, onMounted, onUnmounted, ref, type ComputedRef, type ComponentPublicInstance } from 'vue';
import type { BackgroundMedia } from '../../composables/backgroundCatalog';
import { useBackgroundPreviews } from './useBackgroundPreviews';

export function useCanvasMediaTiles(items: ComputedRef<BackgroundMedia[]>) {
  const INITIAL_MEDIA_COUNT = 15;
  const LOAD_MORE_FRAME_SIZE = 3;
  const visibleCount = ref(INITIAL_MEDIA_COUNT);
  const isLoadingMore = ref(false);

  const gridRef = ref<HTMLElement | null>(null);
  const tileElements = new Map<string, Element>();
  const tileItems = new Map<string, BackgroundMedia>();
  const tileItemsByElement = new Map<Element, BackgroundMedia>();
  const tileRefHandlers = new Map<string, (element: Element | ComponentPublicInstance | null) => void>();
  let previewObserver: IntersectionObserver | null = null;
  let observationFrame: number | null = null;
  let loadMoreFrame: number | null = null;
  let loadMoreTarget = 0;
  const { previews, failed, request: requestPreview } = useBackgroundPreviews();

  const visibleItems = computed(() => items.value.slice(0, visibleCount.value));

  const hasMore = computed(() => visibleCount.value < items.value.length);

  const updateMediaTileElement = (element: Element | ComponentPublicInstance | null, item: BackgroundMedia) => {
    const domElement = element && '$el' in element ? (element.$el as Element | null) : (element as Element | null);
    const previous = tileElements.get(item.id);
    if (previous === domElement) return;
    if (previous) {
      previewObserver?.unobserve(previous);
      tileItemsByElement.delete(previous);
    }
    if (!domElement) {
      tileElements.delete(item.id);
      return;
    }
    tileElements.set(item.id, domElement);
    tileItemsByElement.set(domElement, item);
    previewObserver?.observe(domElement);
  };

  const mediaTileRef = (item: BackgroundMedia) => {
    tileItems.set(item.id, item);
    const existing = tileRefHandlers.get(item.id);
    if (existing) return existing;
    const handler = (element: Element | ComponentPublicInstance | null) => {
      const currentItem = tileItems.get(item.id);
      if (currentItem) updateMediaTileElement(element, currentItem);
    };
    tileRefHandlers.set(item.id, handler);
    return handler;
  };

  const observeVisibleTiles = () => {
    for (const item of visibleItems.value) {
      const element = tileElements.get(item.id);
      if (element) previewObserver?.observe(element);
    }
  };

  const scheduleVisibleTileObservation = () => {
    if (observationFrame !== null) return;
    observationFrame = requestAnimationFrame(() => {
      observationFrame = null;
      void nextTick(observeVisibleTiles);
    });
  };

  const cancelLoadMore = () => {
    if (loadMoreFrame !== null) cancelAnimationFrame(loadMoreFrame);
    loadMoreFrame = null;
    loadMoreTarget = 0;
    isLoadingMore.value = false;
  };

  const loadMoreFrameStep = () => {
    loadMoreFrame = null;
    const target = Math.min(loadMoreTarget, items.value.length);
    visibleCount.value = Math.min(visibleCount.value + LOAD_MORE_FRAME_SIZE, target);
    if (visibleCount.value < target) {
      loadMoreFrame = requestAnimationFrame(loadMoreFrameStep);
      return;
    }
    loadMoreTarget = 0;
    isLoadingMore.value = false;
  };

  const loadMore = () => {
    if (isLoadingMore.value || !hasMore.value) return;
    isLoadingMore.value = true;
    loadMoreTarget = Math.min(items.value.length, visibleCount.value + INITIAL_MEDIA_COUNT);
    loadMoreFrame = requestAnimationFrame(loadMoreFrameStep);
  };

  onMounted(() => {
    previewObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const item = tileItemsByElement.get(entry.target);
          if (item) requestPreview(item);
        }
      },
      { root: null, rootMargin: '120px', threshold: 0.01 },
    );
    scheduleVisibleTileObservation();
  });

  onUnmounted(() => {
    cancelLoadMore();
    if (observationFrame !== null) cancelAnimationFrame(observationFrame);
    previewObserver?.disconnect();
    tileElements.clear();
    tileItems.clear();
    tileItemsByElement.clear();
    tileRefHandlers.clear();
  });
  return { gridRef, previews, failed, visibleItems, hasMore, isLoadingMore, mediaTileRef, cancelLoadMore, loadMore };
}
