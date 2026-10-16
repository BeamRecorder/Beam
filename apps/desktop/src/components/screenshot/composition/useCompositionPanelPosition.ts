import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { usePreferencesStore } from '~/stores/preferences';
import { COMPOSITION_DOCK_KEY, useCompositionPanelDock } from './composition-panel-dock';
import { compositionPositionAt, overCompositionDock } from './composition-panel-dock-geometry';
import { animateCompositionPanel } from './composition-panel-motion';
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
  const dock = useCompositionPanelDock();
  const docked = dock?.docked ?? ref(false);
  let animation: Animation | null = null;
  let generation = 0;
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
  let dockObserver: ResizeObserver | null = null;
  let cancelGesture: (() => void) | null = null;
  let saves = Promise.resolve();

  const constrain = (value: CompositionPanelPosition) =>
    directionLocked && bounds ? clampCompositionPanelPosition(bounds, value, openBodyHeight, upward.value) : value;

  const paint = (value: CompositionPanelPosition) => {
    if (!panel.value || !bounds) return;
    if (docked.value && dock?.target.value) {
      const target = dock.target.value.getBoundingClientRect();
      const workspace = panel.value.parentElement!.getBoundingClientRect();
      upward.value = false;
      panel.value.style.transform = `translate3d(${(target.left - workspace.left) / scale}px, ${(target.top - workspace.top) / scale}px, 0)`;
      panel.value.style.setProperty('--composition-dock-width', `${target.width / scale}px`);
      panel.value.style.setProperty('--composition-dock-height', `${target.height / scale}px`);
      openBodyHeight = Math.min(contentHeight, Math.max(0, (workspace.bottom - target.bottom - 24) / scale));
      panel.value.style.setProperty('--composition-body-height', `${openBodyHeight}px`);
      return;
    }
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
    const isDocked = docked.value;
    saves = saves
      .then(() =>
        preferences.update({
          extras: { [COMPOSITION_POSITION_KEY]: value, ...(dock ? { [COMPOSITION_DOCK_KEY]: isDocked } : {}) },
        }),
      )
      .then(() => undefined)
      .catch((error: unknown) => console.warn('Unable to save screenshot Composition position', error));
  };

  const surfaceRect = () => panel.value?.querySelector<HTMLElement>('.composition-motion')?.getBoundingClientRect();
  const cancelMotion = () => {
    generation++;
    animation?.cancel();
    animation = null;
  };
  const settle = async (isDocked: boolean, value = position) => {
    if (!dock || !panel.value) return;
    const from = surfaceRect();
    cancelMotion();
    const currentGeneration = generation;
    docked.value = isDocked;
    collapsed.value = true;
    directionLocked = false;
    position = value;
    persist({ ...position });
    await nextTick();
    if (generation !== currentGeneration || !panel.value) return;
    measure();
    paint(position);
    if (from) animation = animateCompositionPanel(panel.value, from);
    panel.value.querySelector<HTMLButtonElement>('.composition-toggle')?.focus();
  };
  const toggleDock = () => void settle(!docked.value);
  watch(
    [docked, collapsed],
    () => {
      if (dock) dock.expanded.value = docked.value && !collapsed.value;
    },
    { immediate: true, flush: 'sync' },
  );

  const begin = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false || cancelGesture) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    cancelMotion();
    measure();
    if (!bounds) return;
    suppressClick = false;
    const initial = { ...position };
    const initialUpward = upward.value;
    const initiallyDocked = docked.value;
    const sourceRect = surfaceRect();
    const gripX = sourceRect?.width
      ? Math.max(0, Math.min(1, (event.clientX - sourceRect.left) / sourceRect.width))
      : 0.5;
    const gripY = sourceRect?.height
      ? Math.max(0, Math.min(1, (event.clientY - sourceRect.top) / sourceRect.height))
      : 0.5;
    let detached = false;
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
        if (dock) dock.dragging.value = true;
        suppressClick = true;
        if (next.type !== 'pointerup') target.setPointerCapture(pointerId);
      }
      const hit = overCompositionDock(
        next.clientX,
        next.clientY,
        dock?.target.value?.closest('.editor-titlebar')?.getBoundingClientRect() ?? null,
      );
      if (dock) dock.hovered.value = hit;
      if (initiallyDocked) {
        if (!detached && hit) return;
        const from = !detached ? surfaceRect() : null;
        detached = true;
        docked.value = false;
        collapsed.value = true;
        const workspace = panel.value!.parentElement!.getBoundingClientRect();
        draft = compositionPositionAt(
          bounds!,
          (next.clientX - workspace.left) / gestureScale - bounds!.panelWidth * gripX,
          (next.clientY - workspace.top) / gestureScale - bounds!.headerHeight * gripY,
        );
        if (from) {
          const currentGeneration = generation;
          void nextTick(() => {
            if (generation !== currentGeneration || !panel.value || !dragging.value) return;
            paint(draft);
            animation = animateCompositionPanel(panel.value, from);
          });
        }
      } else draft = constrain(moveCompositionPanel(initial, layout, dx / gestureScale, dy / gestureScale));
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
      if (dock) {
        dock.dragging.value = false;
        dock.hovered.value = false;
      }
      draftPosition = null;
    };
    const rollback = () => {
      cleanup();
      cancelMotion();
      docked.value = initiallyDocked;
      upward.value = initialUpward;
      paint(position);
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      update(next);
      const wantsDock = dock?.hovered.value === true;
      cleanup();
      if (!active) return;
      if (wantsDock) {
        if (initiallyDocked && !detached) return;
        void settle(true, initial);
        return;
      }
      if (initiallyDocked) {
        void settle(false, draft);
        return;
      }
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
    cancelMotion();
    measure();
  };
  const outside = (event: PointerEvent) => {
    if (!docked.value || collapsed.value || cancelGesture || !(event.target instanceof Element)) return;
    if (panel.value?.contains(event.target) || event.target.closest('.popover-content, [role="menu"], .dialog-overlay'))
      return;
    collapsed.value = true;
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || cancelGesture || !docked.value || collapsed.value) return;
    event.preventDefault();
    collapsed.value = true;
    panel.value?.querySelector<HTMLButtonElement>('.composition-toggle')?.focus();
  };
  onMounted(() => {
    // The theme bootstrap already hydrated user preferences before mounting the editor.
    position = readCompositionPanelPosition(preferences.settings?.extras?.[COMPOSITION_POSITION_KEY]) ?? position;
    if (docked.value) collapsed.value = true;
    measure();
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    observer = new ResizeObserver(resize);
    if (panel.value?.parentElement) observer.observe(panel.value.parentElement);
    if (panel.value) observer.observe(panel.value);
    if (dock?.target.value?.parentElement) {
      dockObserver = new ResizeObserver(() => {
        if (docked.value && !dragging.value) paint(position);
      });
      for (const child of dock.target.value.parentElement.children) dockObserver.observe(child);
    }
    watch(content, observeContent, { immediate: true, flush: 'post' });
    watch(
      collapsed,
      () => {
        directionLocked = false;
        paint(draftPosition ?? position);
        directionLocked = !collapsed.value;
      },
      { immediate: true, flush: 'post' },
    );
    ready.value = true;
  });
  onBeforeUnmount(() => {
    cancelGesture?.();
    cancelMotion();
    if (dock) dock.expanded.value = false;
    window.removeEventListener('pointerdown', outside);
    window.removeEventListener('keydown', escape);
    observer?.disconnect();
    contentObserver?.disconnect();
    dockObserver?.disconnect();
  });
  return { upward, dragging, ready, begin, click, docked, canDock: Boolean(dock), toggleDock };
}
