import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { provideCompositionPanelDock, COMPOSITION_DOCK_KEY } from '../composition-panel-dock';
import { useCompositionPanelPosition } from '../useCompositionPanelPosition';
import { COMPOSITION_POSITION_KEY } from '../composition-panel-position';
import type { CompositionPanelDock } from '../composition-panel-types';
import {
  dispatchClick,
  dispatchPointer,
  installFrameScheduler,
  TestResizeObserver,
} from './composition-panel-position.test-support';
import ScreenshotCompositionDock from '../ScreenshotCompositionDock.vue';

const mocks = vi.hoisted(() => ({ extras: {} as Record<string, unknown>, update: vi.fn(), animate: vi.fn() }));
vi.mock('~/stores/preferences', () => ({
  usePreferencesStore: () => ({ settings: { extras: mocks.extras }, update: mocks.update }),
}));
vi.mock('../composition-panel-motion', () => ({ animateCompositionPanel: mocks.animate }));
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
const wrappers: VueWrapper[] = [];
const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

function harness(scale = 1) {
  let dock!: CompositionPanelDock;
  let state!: ReturnType<typeof useCompositionPanelPosition>;
  const panel = ref<HTMLElement | null>(null),
    content = ref<HTMLElement | null>(null),
    collapsed = ref(false);
  const geometry = (kind: 'workspace' | 'panel' | 'motion') => (node: { el: unknown }) => {
    const el = node.el as HTMLElement;
    Object.defineProperties(el, {
      offsetWidth: { get: () => (kind === 'workspace' ? 800 : 264) },
      offsetHeight: { get: () => (kind === 'workspace' ? 600 : 56) },
    });
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() =>
      kind === 'workspace'
        ? rect(0, 40, 800 * scale, 600 * scale)
        : rect(
            500,
            56,
            (kind === 'motion' && dock.docked.value ? 60 : 264) * scale,
            (kind === 'motion' && dock.docked.value ? 28 : 56) * scale,
          ),
    );
  };
  const Panel = defineComponent({
    setup() {
      state = useCompositionPanelPosition(
        panel,
        () => {
          collapsed.value = !collapsed.value;
        },
        content,
        collapsed,
      );
      return () =>
        h('div', { class: 'workspace', onVnodeBeforeMount: geometry('workspace') }, [
          h('aside', { ref: panel, onVnodeBeforeMount: geometry('panel') }, [
            h('div', { class: 'composition-motion', onVnodeBeforeMount: geometry('motion') }, [
              h(
                'button',
                { class: 'composition-toggle', onPointerdown: state.begin, onClick: state.click },
                'Composition',
              ),
              h('div', { ref: content, class: 'composition-content' }, [h('button', { class: 'inner' })]),
            ]),
          ]),
        ]);
    },
  });
  const Harness = defineComponent({
    setup() {
      dock = provideCompositionPanelDock();
      return () => h('div', [h('header', { class: 'editor-titlebar' }, [h(ScreenshotCompositionDock)]), h(Panel)]);
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  wrappers.push(wrapper);
  const anchor = wrapper.get('.composition-dock-target').element as HTMLElement;
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(rect(320 * scale, 6, 60 * scale, 28));
  vi.spyOn(wrapper.get('.editor-titlebar').element, 'getBoundingClientRect').mockReturnValue(
    rect(0, 0, 800 * scale, 40),
  );
  const header = wrapper.get('.composition-toggle').element as HTMLButtonElement;
  let capture = false;
  header.setPointerCapture = vi.fn(() => {
    capture = true;
  });
  header.hasPointerCapture = vi.fn(() => capture);
  header.releasePointerCapture = vi.fn(() => {
    capture = false;
  });
  return { wrapper, dock, state, panel, header, anchor, collapsed };
}

beforeEach(() => {
  vi.clearAllMocks();
  TestResizeObserver.instances.length = 0;
  mocks.extras = {};
  mocks.update.mockResolvedValue({});
  mocks.animate.mockImplementation(() => ({ cancel: vi.fn() }));
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  installFrameScheduler();
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('restores the dock preference independently from the last floating position', async () => {
  mocks.extras = { [COMPOSITION_DOCK_KEY]: true, [COMPOSITION_POSITION_KEY]: { x: 0.2, y: 0.6 } };
  const f = harness();
  await nextTick();
  f.state.toggleDock();
  await flushPromises();
  expect(f.dock.docked.value).toBe(false);
  expect(f.panel.value?.style.transform).toBe('translate3d(116.80000000000001px, 323.2px, 0)');
  expect(mocks.update).toHaveBeenLastCalledWith({
    extras: { [COMPOSITION_DOCK_KEY]: false, [COMPOSITION_POSITION_KEY]: { x: 0.2, y: 0.6 } },
  });
});

it('provides a keyboard docking action, collapses the panel and morphs to the titlebar', async () => {
  const f = harness();
  await nextTick();
  f.state.toggleDock();
  await flushPromises();
  expect(f.dock.docked.value).toBe(true);
  expect(f.collapsed.value).toBe(true);
  expect(f.panel.value?.style.transform).toBe('translate3d(320px, -34px, 0)');
  expect(mocks.animate).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(f.header);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
    extras: { [COMPOSITION_DOCK_KEY]: true, [COMPOSITION_POSITION_KEY]: { x: 1, y: 0 } },
  });
});

it.each([1, 1.25])('docks a pointer drop at UI scale %s and suppresses the generated click', async (scale) => {
  const f = harness(scale);
  await nextTick();
  dispatchPointer(f.header, 'pointerdown', { clientX: 600, clientY: 100 });
  dispatchPointer(window, 'pointermove', { clientX: 330 * scale, clientY: 20 });
  await nextTick();
  expect(f.dock.hovered.value).toBe(true);
  expect(mocks.update).not.toHaveBeenCalled();
  dispatchPointer(window, 'pointerup', { clientX: 330 * scale, clientY: 20 });
  await flushPromises();
  expect(f.dock.docked.value).toBe(true);
  expect(f.dock.dragging.value).toBe(false);
  expect(f.dock.hovered.value).toBe(false);
  expect(dispatchClick(f.header).defaultPrevented).toBe(true);
  expect(f.collapsed.value).toBe(true);
  expect(mocks.update).toHaveBeenCalledOnce();
});

it('pulls the docked panel back into the workspace and commits only when released', async () => {
  mocks.extras = { [COMPOSITION_DOCK_KEY]: true };
  const f = harness();
  await nextTick();
  dispatchPointer(f.header, 'pointerdown', { clientX: 340, clientY: 20 });
  dispatchPointer(window, 'pointermove', { clientX: 500, clientY: 240 });
  await nextTick();
  expect(f.dock.docked.value).toBe(false);
  expect(mocks.update).not.toHaveBeenCalled();
  dispatchPointer(window, 'pointerup', { clientX: 500, clientY: 240 });
  await flushPromises();
  expect(mocks.update.mock.calls[0]![0].extras[COMPOSITION_DOCK_KEY]).toBe(false);
  expect(mocks.update.mock.calls[0]![0].extras[COMPOSITION_POSITION_KEY].y).toBeGreaterThan(0);
});

it.each(['pointercancel', 'lostpointercapture', 'blur', 'Escape'])(
  'cancels undocking through %s without saving the preview',
  async (kind) => {
    mocks.extras = { [COMPOSITION_DOCK_KEY]: true };
    const f = harness();
    await nextTick();
    dispatchPointer(f.header, 'pointerdown', { clientX: 340, clientY: 20 });
    dispatchPointer(window, 'pointermove', { clientX: 500, clientY: 240 });
    await nextTick();
    expect(f.dock.docked.value).toBe(false);
    if (kind === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    else if (kind === 'blur') window.dispatchEvent(new Event('blur'));
    else dispatchPointer(kind === 'lostpointercapture' ? f.header : window, kind);
    await flushPromises();
    expect(f.dock.docked.value).toBe(true);
    expect(f.dock.dragging.value).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  },
);

it('keeps a tiny docked drag anchored and ignores another pointer', async () => {
  mocks.extras = { [COMPOSITION_DOCK_KEY]: true };
  const f = harness();
  await nextTick();
  dispatchPointer(f.header, 'pointerdown', { clientX: 340, clientY: 20 });
  dispatchPointer(window, 'pointermove', { pointerId: 2, clientX: 500, clientY: 240 });
  dispatchPointer(window, 'pointerup', { clientX: 342, clientY: 21 });
  await flushPromises();
  expect(f.dock.docked.value).toBe(true);
  expect(mocks.update).not.toHaveBeenCalled();
});

it('closes a docked dropdown on outside press or Escape while retaining owned popovers', async () => {
  mocks.extras = { [COMPOSITION_DOCK_KEY]: true };
  const f = harness();
  await nextTick();
  dispatchClick(f.header);
  await nextTick();
  expect(f.collapsed.value).toBe(false);
  expect(f.dock.expanded.value).toBe(true);
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  dispatchPointer(menu, 'pointerdown');
  await nextTick();
  expect(f.collapsed.value).toBe(false);
  menu.remove();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  await nextTick();
  expect(f.collapsed.value).toBe(true);
  expect(f.dock.expanded.value).toBe(false);
  dispatchClick(f.header);
  await nextTick();
  dispatchPointer(document.body, 'pointerdown');
  await nextTick();
  expect(f.collapsed.value).toBe(true);
});

it('cancels a morph and a pending gesture on unmount without persisting a drag preview', async () => {
  const f = harness();
  await nextTick();
  f.state.toggleDock();
  await flushPromises();
  const cancel = mocks.animate.mock.results[0]!.value.cancel;
  dispatchPointer(f.header, 'pointerdown', { clientX: 340, clientY: 20 });
  expect(cancel).toHaveBeenCalledOnce();
  dispatchPointer(window, 'pointermove', { clientX: 500, clientY: 240 });
  f.wrapper.unmount();
  wrappers.pop();
  await flushPromises();
  expect(mocks.update).toHaveBeenCalledOnce();
});

it('renders nothing without an editor docking provider', () => {
  const wrapper = mount(ScreenshotCompositionDock);
  wrappers.push(wrapper);
  expect(wrapper.find('.composition-dock-target').exists()).toBe(false);
});

it('previews the actual translated heading and live layer count without changing its structure on hover', async () => {
  const f = harness();
  f.dock.dragging.value = true;
  f.dock.count.value = 137;
  await nextTick();
  const heading = f.wrapper.get('.composition-dock-target .composition-heading');
  expect(heading.get('strong').text()).toBe('title');
  expect(heading.get('.layer-count').text()).toBe('137');
  const node = heading.element;
  f.dock.hovered.value = true;
  await nextTick();
  expect(f.wrapper.get('.composition-dock-target .composition-heading').element).toBe(node);
  f.dock.count.value = 0;
  await nextTick();
  expect(heading.get('.layer-count').text()).toBe('0');
});

it('follows titlebar reflow while docked but leaves a live drag in control of its position', async () => {
  mocks.extras = { [COMPOSITION_DOCK_KEY]: true };
  const f = harness();
  await nextTick();
  const observer = TestResizeObserver.instances.find((instance) => instance.observed.has(f.anchor))!;
  vi.mocked(f.anchor.getBoundingClientRect).mockReturnValue(rect(360, 8, 180, 28));
  observer.trigger();
  expect(f.panel.value?.style.transform).toBe('translate3d(360px, -32px, 0)');
  dispatchPointer(f.header, 'pointerdown', { clientX: 380, clientY: 20 });
  dispatchPointer(window, 'pointermove', { clientX: 386, clientY: 20 });
  vi.mocked(f.anchor.getBoundingClientRect).mockReturnValue(rect(400, 8, 180, 28));
  observer.trigger();
  expect(f.panel.value?.style.transform).toBe('translate3d(360px, -32px, 0)');
  window.dispatchEvent(new Event('blur'));
  f.state.toggleDock();
  await flushPromises();
  const floating = f.panel.value?.style.transform;
  observer.trigger();
  expect(f.panel.value?.style.transform).toBe(floating);
});

it('keeps an active drag inside the dock magnet anchored without writing preferences', async () => {
  mocks.extras = { [COMPOSITION_DOCK_KEY]: true };
  const f = harness();
  await nextTick();
  dispatchPointer(f.header, 'pointerdown', { clientX: 340, clientY: 20 });
  dispatchPointer(window, 'pointermove', { clientX: 346, clientY: 20 });
  await nextTick();
  expect(f.dock.dragging.value).toBe(true);
  dispatchPointer(window, 'pointerup', { clientX: 346, clientY: 20 });
  await flushPromises();
  expect(f.dock.docked.value).toBe(true);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(dispatchClick(f.header).defaultPrevented).toBe(true);
});

it('keeps an open dock menu for inner presses and already handled Escape events', async () => {
  mocks.extras = { [COMPOSITION_DOCK_KEY]: true };
  const f = harness();
  await nextTick();
  dispatchClick(f.header);
  await nextTick();
  dispatchPointer(f.wrapper.get('.inner').element, 'pointerdown');
  const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  handled.preventDefault();
  window.dispatchEvent(handled);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  expect(f.collapsed.value).toBe(false);
});

it('abandons the pending morph when disposed before the next layout tick', async () => {
  const f = harness();
  await nextTick();
  f.state.toggleDock();
  f.wrapper.unmount();
  wrappers.pop();
  await flushPromises();
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.animate).not.toHaveBeenCalled();
});

it('retains the last committed floating position when a pointer drop docks the panel', async () => {
  const position = { x: 0.2, y: 0.6 };
  mocks.extras = { [COMPOSITION_POSITION_KEY]: position };
  const f = harness();
  await nextTick();
  dispatchPointer(f.header, 'pointerdown', { clientX: 600, clientY: 100 });
  dispatchPointer(window, 'pointerup', { clientX: 24, clientY: 3 });
  await flushPromises();
  expect(f.dock.docked.value).toBe(true);
  expect(mocks.update.mock.calls[0]![0].extras[COMPOSITION_POSITION_KEY]).toEqual(position);
  f.state.toggleDock();
  await flushPromises();
  expect(f.panel.value?.style.transform).toBe('translate3d(116.80000000000001px, 323.2px, 0)');
});
