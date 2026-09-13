import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { usePreferencesStore } from '~/stores/preferences';
import type { CompositionPanelBounds, CompositionPanelPosition } from './composition-panel-types';
import {
  COMPOSITION_POSITION_KEY,
  DEFAULT_COMPOSITION_POSITION,
  MAX_COMPOSITION_BODY_HEIGHT,
  clampCompositionPanelPosition,
  compositionPanelLayout,
  moveCompositionPanel,
  readCompositionPanelPosition,
} from './composition-panel-position';

export function useCompositionPanelPosition(
  panel: Ref<HTMLElement | null>,
  toggle: () => void,
  content: Ref<HTMLElement | null>,
  collapsed: Ref<boolean>,
) {
  const preferences = usePreferencesStore();
  const upward = ref(false);
  const dragging = ref(false);
  const ready = ref(false);
  let position = { ...DEFAULT_COMPOSITION_POSITION };
  let draftPosition: CompositionPanelPosition | null = null;
  let contentHeight = 0;
  let openBodyHeight = 0;
  let directionLocked = false;
  let bounds: CompositionPanelBounds | null = null;
  let scale = 1;
  let suppressClick = false;
  let observer: ResizeObserver | null = null;
  let contentObserver: ResizeObserver | null = null;
  let cancelGesture: (() => void) | null = null;
  let saves = Promise.resolve();

  const constrain = (value: CompositionPanelPosition) =>
    directionLocked && bounds ? clampCompositionPanelPosition(bounds, value, openBodyHeight, upward.value) : value;

  const paint = (value: CompositionPanelPosition) => {
    if (!panel.value || !bounds) return;
    const layout = compositionPanelLayout(bounds, value, directionLocked ? 0 : contentHeight, upward.value);
    panel.value.style.transform = `translate3d(${layout.x}px, ${layout.y}px, 0)`;
    if (!directionLocked) {
      upward.value = layout.upward;
      openBodyHeight = Math.min(layout.bodyHeight, contentHeight);
    }
    // An open panel keeps its direction and size; dragging only translates the whole rectangle.
    const height = `${openBodyHeight}px`;
    if (panel.value.style.getPropertyValue('--composition-body-height') !== height)
      panel.value.style.setProperty('--composition-body-height', height);
  };

  const measureContent = () => {
    const node = content.value;
    if (!node) return;
    const list = node.querySelector<HTMLElement>('.layer-list');
    const clippedRows = list ? Math.max(0, list.scrollHeight - list.clientHeight) : 0;
    const height = Math.min(
      MAX_COMPOSITION_BODY_HEIGHT,
      node.scrollHeight + node.offsetHeight - node.clientHeight + clippedRows,
    );
    if (height === contentHeight) return;
    contentHeight = height;
    if (directionLocked && bounds) {
      const layout = compositionPanelLayout(bounds, draftPosition ?? position, 0, upward.value);
      openBodyHeight = Math.min(height, layout.bodyHeight);
    }
    paint(draftPosition ?? position);
  };

  const observeContent = () => {
    contentObserver?.disconnect();
    const node = content.value;
    if (!node) return;
    measureContent();
    contentObserver = new ResizeObserver(measureContent);
    contentObserver.observe(node);
    for (const child of node.children) contentObserver.observe(child);
    const rows = node.querySelector('.layer-rows');
    if (rows) contentObserver.observe(rows);
  };

  const measure = () => {
    const node = panel.value;
    const workspace = node?.parentElement;
    if (!node || !workspace || !node.offsetWidth) return;
    const rect = node.getBoundingClientRect();
    const area = workspace.getBoundingClientRect();
    if (!rect.width || !area.width || !area.height) return;
    // Pointer coordinates are physical CSS pixels; panel geometry may have editor UI scaling.
    scale = rect.width / node.offsetWidth;
    bounds = {
      width: area.width / scale,
      height: area.height / scale,
      panelWidth: node.offsetWidth,
      headerHeight: node.offsetHeight,
    };
    openBodyHeight = Math.min(openBodyHeight, compositionPanelLayout(bounds, position).travelY);
    position = constrain(position);
    paint(position);
  };

  const persist = (value: CompositionPanelPosition) => {
    saves = saves
      .then(() =>
        preferences.update({
          extras: { [COMPOSITION_POSITION_KEY]: value },
        }),
      )
      .then(() => undefined)
      .catch((error: unknown) => console.warn('Unable to save screenshot Composition position', error));
  };

  const begin = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false || cancelGesture) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    measure();
    if (!bounds) return;
    suppressClick = false;
    const initial = { ...position };
    const initialUpward = upward.value;
    const layout = compositionPanelLayout(bounds, initial, contentHeight, upward.value);
    const pointerId = event.pointerId;
    const gestureScale = scale;
    let draft = initial;
    let frame = 0;
    let active = false;
    const apply = () => {
      frame = 0;
      paint(draft);
    };
    const update = (next: PointerEvent) => {
      const dx = next.clientX - event.clientX;
      const dy = next.clientY - event.clientY;
      if (!active && Math.hypot(dx, dy) < 4) return;
      if (!active) {
        active = true;
        dragging.value = true;
        suppressClick = true;
        if (next.type !== 'pointerup') target.setPointerCapture(pointerId);
      }
      draft = constrain(moveCompositionPanel(initial, layout, dx / gestureScale, dy / gestureScale));
      draftPosition = draft;
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      update(next);
      if (active && !frame) frame = requestAnimationFrame(apply);
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', rollback);
      target.removeEventListener('lostpointercapture', cancel);
      cancelGesture = null;
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      dragging.value = false;
      draftPosition = null;
    };
    const rollback = () => {
      cleanup();
      upward.value = initialUpward;
      paint(position);
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      update(next);
      cleanup();
      if (!active) return;
      position = draft;
      paint(position);
      if (position.x !== initial.x || position.y !== initial.y) persist({ ...position });
    };
    const cancel = (next: PointerEvent) => {
      if (next.pointerId === pointerId) rollback();
    };
    const keydown = (next: KeyboardEvent) => {
      if (next.key !== 'Escape') return;
      next.preventDefault();
      next.stopPropagation();
      rollback();
    };
    cancelGesture = rollback;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keydown);
    window.addEventListener('blur', rollback);
    target.addEventListener('lostpointercapture', cancel);
  };

  const click = (event: MouseEvent) => {
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    toggle();
  };

  const resize = () => {
    cancelGesture?.();
    measure();
  };
  onMounted(() => {
    // The theme bootstrap already hydrated user preferences before mounting the editor.
    position = readCompositionPanelPosition(preferences.settings?.extras?.[COMPOSITION_POSITION_KEY]) ?? position;
    measure();
    observer = new ResizeObserver(resize);
    if (panel.value?.parentElement) observer.observe(panel.value.parentElement);
    if (panel.value) observer.observe(panel.value);
    watch(content, observeContent, { immediate: true, flush: 'post' });
    watch(
      collapsed,
      () => {
        directionLocked = false;
        paint(position);
        directionLocked = !collapsed.value;
      },
      { immediate: true, flush: 'post' },
    );
    ready.value = true;
  });
  onBeforeUnmount(() => {
    cancelGesture?.();
    observer?.disconnect();
    contentObserver?.disconnect();
  });
  return { upward, dragging, ready, begin, click };
}
