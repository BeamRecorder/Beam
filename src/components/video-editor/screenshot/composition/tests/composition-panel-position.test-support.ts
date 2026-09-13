import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref, type VNode } from 'vue';
import { vi } from 'vitest';
import { useCompositionPanelPosition } from '../useCompositionPanelPosition';

export interface PanelGeometry {
  workspaceWidth: number;
  workspaceHeight: number;
  panelWidth: number;
  headerHeight: number;
  scale: number;
  contentHeight: number;
  layerRowsScrollHeight: number;
  layerRowsClientHeight: number;
}

export type PanelPositionController = ReturnType<typeof useCompositionPanelPosition>;

const defaultGeometry = (): PanelGeometry => ({
  workspaceWidth: 500,
  workspaceHeight: 400,
  panelWidth: 200,
  headerHeight: 80,
  scale: 1,
  contentHeight: 100,
  layerRowsScrollHeight: 40,
  layerRowsClientHeight: 40,
});

const makeRect = (width: number, height: number): DOMRect =>
  ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

const applyGeometry = (node: HTMLElement, kind: 'workspace' | 'panel', geometry: PanelGeometry) => {
  Object.defineProperty(node, 'offsetWidth', {
    configurable: true,
    get: () => (kind === 'workspace' ? geometry.workspaceWidth : geometry.panelWidth),
  });
  Object.defineProperty(node, 'offsetHeight', {
    configurable: true,
    get: () => (kind === 'workspace' ? geometry.workspaceHeight : geometry.headerHeight),
  });
  vi.spyOn(node, 'getBoundingClientRect').mockImplementation(() => {
    const width = kind === 'workspace' ? geometry.workspaceWidth : geometry.panelWidth;
    const height = kind === 'workspace' ? geometry.workspaceHeight : geometry.headerHeight;
    return makeRect(width * geometry.scale, height * geometry.scale);
  });
};

const applyContentMetrics = (node: HTMLElement, kind: 'content' | 'layer-list', geometry: PanelGeometry) => {
  const content = kind === 'content';
  Object.defineProperties(node, {
    scrollHeight: {
      configurable: true,
      get: () => (content ? geometry.contentHeight : geometry.layerRowsScrollHeight),
    },
    offsetHeight: {
      configurable: true,
      get: () => (content ? geometry.contentHeight : geometry.layerRowsScrollHeight),
    },
    clientHeight: {
      configurable: true,
      get: () => (content ? geometry.contentHeight : geometry.layerRowsClientHeight),
    },
  });
};

const installPointerCapture = (panel: HTMLElement) => {
  let capturedPointer: number | null = null;
  const setPointerCapture = vi.fn((pointerId: number) => {
    capturedPointer = pointerId;
  });
  const hasPointerCapture = vi.fn((pointerId: number) => capturedPointer === pointerId);
  const releasePointerCapture = vi.fn((pointerId: number) => {
    if (capturedPointer === pointerId) capturedPointer = null;
  });
  Object.defineProperties(panel, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    hasPointerCapture: { configurable: true, value: hasPointerCapture },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
  });
  return { setPointerCapture, hasPointerCapture, releasePointerCapture };
};

export class TestResizeObserver implements ResizeObserver {
  static instances: TestResizeObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    TestResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  trigger(): void {
    this.callback([], this);
  }
}

export const resetTestResizeObservers = () => {
  TestResizeObserver.instances.length = 0;
};

export const mountPanelPositionHarness = (geometry = defaultGeometry(), initiallyCollapsed = false) => {
  const panelRef = ref<HTMLElement | null>(null);
  const workspaceRef = ref<HTMLElement | null>(null);
  const contentRef = ref<HTMLElement | null>(null);
  const collapsed = ref(initiallyCollapsed);
  const toggle = vi.fn(() => {
    collapsed.value = !collapsed.value;
  });
  let state!: PanelPositionController;

  const geometryBeforeMount = (kind: 'workspace' | 'panel' | 'content' | 'layer-list') => (node: VNode) => {
    if (!(node.el instanceof HTMLElement)) return;
    if (kind === 'content' || kind === 'layer-list') applyContentMetrics(node.el, kind, geometry);
    else applyGeometry(node.el, kind, geometry);
  };

  const Harness = defineComponent({
    setup() {
      state = useCompositionPanelPosition(panelRef, toggle, contentRef, collapsed);
      return () => {
        const children = [
          h('button', {
            type: 'button',
            class: 'composition-header',
            onPointerdown: state.begin,
            onClick: state.click,
          }),
        ];
        if (!collapsed.value || !state.ready.value) {
          children.push(
            h(
              'div',
              {
                ref: contentRef,
                class: 'composition-content',
                onVnodeBeforeMount: geometryBeforeMount('content'),
              },
              [
                h('div', { class: 'compositing-controls' }),
                h(
                  'div',
                  {
                    class: 'layer-list',
                    onVnodeBeforeMount: geometryBeforeMount('layer-list'),
                  },
                  [h('div', { class: 'layer-rows' })],
                ),
              ],
            ),
          );
        }
        return h(
          'div',
          {
            ref: workspaceRef,
            class: 'composition-workspace',
            onVnodeBeforeMount: geometryBeforeMount('workspace'),
          },
          [
            h(
              'div',
              {
                ref: panelRef,
                class: 'composition-panel',
                onVnodeBeforeMount: geometryBeforeMount('panel'),
              },
              children,
            ),
          ],
        );
      };
    },
  });

  const wrapper = mount(Harness);
  const panel = wrapper.get('.composition-panel').element as HTMLElement;
  const header = wrapper.get('.composition-header').element as HTMLElement;
  const workspace = wrapper.get('.composition-workspace').element as HTMLElement;
  const pointerCapture = installPointerCapture(header);
  return {
    wrapper,
    panel,
    header,
    workspace,
    content: wrapper.get('.composition-content').element as HTMLElement,
    state,
    toggle,
    collapsed,
    geometry,
    pointerCapture,
  };
};

export const dispatchPointer = (
  target: EventTarget,
  type: string,
  values: Partial<Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerId' | 'isPrimary'>> = {},
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { configurable: true, value: values.button ?? 0 },
    clientX: { configurable: true, value: values.clientX ?? 0 },
    clientY: { configurable: true, value: values.clientY ?? 0 },
    pointerId: { configurable: true, value: values.pointerId ?? 1 },
    isPrimary: { configurable: true, value: values.isPrimary ?? true },
  });
  target.dispatchEvent(event);
  return event as unknown as PointerEvent;
};

export const dispatchClick = (target: HTMLElement, detail = 1) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail });
  target.dispatchEvent(event);
  return event;
};

export const unmountTracked = (wrappers: VueWrapper[], wrapper: VueWrapper) => {
  const index = wrappers.indexOf(wrapper);
  if (index >= 0) wrappers.splice(index, 1);
  wrapper.unmount();
};

export const installFrameScheduler = () => {
  let nextId = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextId;
    pending.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    pending.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);

  return {
    pending,
    request,
    cancel,
    flush(time = 16) {
      const frames = [...pending.values()];
      pending.clear();
      for (const frame of frames) frame(time);
    },
  };
};
