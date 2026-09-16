import { mount, type VueWrapper } from '@vue/test-utils';
import { ChevronDown } from '@lucide/vue';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerBlendMode } from '~/media/shared/layer-compositing-types';
import Button from '~/ui/button/Button.vue';
import type { ScreenshotLayer } from '../screenshot-layer-types';

const compositionPosition = vi.hoisted(() => ({
  upward: null as { value: boolean } | null,
  dragging: null as { value: boolean } | null,
  ready: null as { value: boolean } | null,
  begin: vi.fn<(event: PointerEvent) => void>(),
  click: vi.fn(),
}));

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: (namespace: string) => ({
    t: (key: string, params?: Record<string, unknown>) =>
      `${namespace}.${key}${typeof params?.name === 'string' ? ` (${params.name})` : ''}`,
  }),
}));

vi.mock('../composition/useCompositionPanelPosition', () => ({
  useCompositionPanelPosition: (_panel: unknown, onToggle: () => void) => {
    const dragging = compositionPosition.dragging;
    return {
      upward: compositionPosition.upward,
      dragging,
      ready: compositionPosition.ready,
      begin: compositionPosition.begin,
      click: (event: MouseEvent) => {
        compositionPosition.click(event);
        if (!dragging?.value) onToggle();
      },
    };
  },
}));

import ScreenshotComposition from '../composition/ScreenshotComposition.vue';

const SelectStub = defineComponent({
  inheritAttrs: false,
  props: ['disabled', 'modelValue', 'options', 'size'],
  emits: ['update:modelValue'],
  template:
    '<select v-bind="$attrs" :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
});

const BigSliderStub = defineComponent({
  inheritAttrs: false,
  props: ['defaultValue', 'formatValue', 'label', 'max', 'min', 'modelValue', 'step'],
  emits: ['update:modelValue'],
  template:
    '<input v-bind="$attrs" data-testid="opacity-control" type="range" :aria-label="label" :min="min" :max="max" :step="step" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
});

const stubs = { Select: SelectStub, BigSlider: BigSliderStub };
const source = 'project-media://screenshot/shot-1/source.png';

const makeLayer = (
  id: string,
  kind: ScreenshotLayer['kind'],
  name: string,
  overrides: Partial<ScreenshotLayer> = {},
): ScreenshotLayer => ({
  id,
  kind,
  name,
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
  visible: true,
  ...overrides,
});

const allLayers = (): ScreenshotLayer[] => [
  makeLayer('__background__', 'background', ''),
  makeLayer('screenshot', 'image', 'Captured screen'),
  makeLayer('shape-1', 'shape', ''),
  makeLayer('arrow-1', 'arrow', 'Arrow'),
  makeLayer('text-1', 'text', 'Callout'),
  makeLayer('drawing-1', 'drawing', 'Sketch'),
  makeLayer('cursor-1', 'cursor', 'Pointer', { visible: false }),
  makeLayer('__watermark__', 'watermark', ''),
];

const mountComposition = (
  props: Partial<{
    layers: ScreenshotLayer[];
    selectedId: string | null;
    selectedIds: string[];
    source: string;
    disabled: boolean;
  }> = {},
  attachTo?: Element,
) => {
  const selectedId = props.selectedId === undefined ? 'shape-1' : props.selectedId;
  const selectedIds = props.selectedIds ?? (selectedId ? [selectedId] : []);
  return mount(ScreenshotComposition, {
    props: { layers: allLayers(), selectedId, selectedIds, source, ...props },
    global: { stubs },
    attachTo,
  });
};

const dispatchPointer = (
  target: EventTarget,
  type: string,
  values: { button?: number; pointerId: number; clientY: number },
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: values.button ?? 0 },
    pointerId: { value: values.pointerId },
    clientY: { value: values.clientY },
  });
  target.dispatchEvent(event);
  return event;
};

const openRowContextMenu = async (wrapper: VueWrapper, id: string) => {
  await wrapper.get(`.layer-row[data-layer-id="${id}"]`).trigger('contextmenu', { clientX: 80, clientY: 90 });
  await nextTick();
  const item = document.body.querySelector<HTMLButtonElement>('.context-menu-item');
  if (!item) throw new Error('Expected the layer context menu to open.');
  return item;
};

const closeContextMenu = async () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
};

type PointerCaptureDescriptor = PropertyDescriptor | undefined;
let wrappers: VueWrapper[] = [];
let callbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let pointerCaptureDescriptors: Record<string, PointerCaptureDescriptor>;
let setPointerCapture: ReturnType<typeof vi.fn>;
let hasPointerCapture: ReturnType<typeof vi.fn>;
let releasePointerCapture: ReturnType<typeof vi.fn>;

const runFrame = () => {
  const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!entry) throw new Error('No animation frame is scheduled.');
  callbacks.delete(entry[0]);
  entry[1](performance.now());
};

const installMediaQuery = (initialMatches: boolean) => {
  let matches = initialMatches;
  const mediaQuery = new EventTarget() as MediaQueryList;
  Object.defineProperties(mediaQuery, {
    matches: { configurable: true, get: () => matches },
    media: { configurable: true, value: '(max-width: 1180px)' },
    onchange: { configurable: true, value: null, writable: true },
  });
  const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(() => mediaQuery);
  return {
    matchMedia,
    setMatches: (value: boolean) => {
      matches = value;
      const event = new Event('change');
      Object.defineProperty(event, 'matches', { value });
      mediaQuery.dispatchEvent(event);
    },
  };
};

beforeEach(() => {
  wrappers = [];
  compositionPosition.upward = ref(false);
  compositionPosition.dragging = ref(false);
  compositionPosition.ready = ref(true);
  compositionPosition.begin.mockReset();
  compositionPosition.click.mockReset();
  callbacks = new Map();
  nextFrameId = 1;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrameId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id);
  });
  pointerCaptureDescriptors = {
    setPointerCapture: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture'),
    hasPointerCapture: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hasPointerCapture'),
    releasePointerCapture: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'releasePointerCapture'),
  };
  setPointerCapture = vi.fn();
  hasPointerCapture = vi.fn(() => true);
  releasePointerCapture = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: setPointerCapture });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: hasPointerCapture });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: releasePointerCapture,
  });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  for (const [name, descriptor] of Object.entries(pointerCaptureDescriptors)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  }
});

describe('ScreenshotComposition', () => {
  it('lists every layer front-to-back, labels every kind, and routes selection', async () => {
    const layers = allLayers();
    const wrapper = mountComposition({ layers });
    wrappers.push(wrapper);

    expect(wrapper.findAll('.layer-row').map((row) => row.attributes('data-layer-id'))).toEqual([
      '__watermark__',
      'cursor-1',
      'drawing-1',
      'text-1',
      'arrow-1',
      'shape-1',
      'screenshot',
      '__background__',
    ]);
    expect(wrapper.find('.layer-count').text()).toBe('8');
    expect(wrapper.get('.layer-row[data-layer-id="shape-1"] .layer-name').text()).toBe('Elements.shape');
    expect(wrapper.get('.layer-row[data-layer-id="__watermark__"] .layer-name').text()).toBe(
      'ScreenshotComposition.watermark',
    );
    expect(wrapper.get('.layer-row[data-layer-id="cursor-1"]').classes()).toContain('hidden');
    expect(wrapper.get('.layer-row[data-layer-id="shape-1"]').classes()).toContain('selected');
    expect(wrapper.get('.layer-row[data-layer-id="screenshot"] .layer-thumbnail').attributes('aria-busy')).toBe('true');

    const selectButton = wrapper.get('.layer-row[data-layer-id="screenshot"] .layer-select');
    const pointerDown = dispatchPointer(selectButton.element, 'pointerdown', { pointerId: 4, clientY: 50 });
    dispatchPointer(selectButton.element, 'pointerup', { pointerId: 4, clientY: 50 });
    expect(pointerDown.defaultPrevented).toBe(false);
    expect(setPointerCapture).not.toHaveBeenCalled();

    await selectButton.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['screenshot']]);
  });

  it('toggles group membership with Ctrl or Meta and marks every selected layer', async () => {
    const wrapper = mountComposition({ selectedId: 'shape-1', selectedIds: ['shape-1', 'arrow-1'] });
    wrappers.push(wrapper);

    expect(wrapper.get('.layer-row[data-layer-id="shape-1"]').classes()).toContain('selected');
    expect(wrapper.get('.layer-row[data-layer-id="arrow-1"]').classes()).toContain('selected');
    expect(wrapper.get('.layer-row[data-layer-id="shape-1"] .layer-select').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.layer-row[data-layer-id="arrow-1"] .layer-select').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.layer-row[data-layer-id="text-1"] .layer-select').attributes('aria-pressed')).toBe('false');

    await wrapper.get('.layer-row[data-layer-id="text-1"] .layer-select').trigger('click', { ctrlKey: true });
    expect(wrapper.emitted('select')).toEqual([['text-1', 'toggle']]);
    await wrapper.setProps({ selectedIds: ['shape-1', 'arrow-1', 'text-1'] });
    expect(wrapper.get('.layer-row[data-layer-id="text-1"]').classes()).toContain('selected');
    expect(wrapper.get('.layer-row[data-layer-id="text-1"] .layer-select').attributes('aria-pressed')).toBe('true');

    await wrapper.get('.layer-row[data-layer-id="drawing-1"] .layer-select').trigger('click', { metaKey: true });
    expect(wrapper.emitted('select')).toEqual([
      ['text-1', 'toggle'],
      ['drawing-1', 'toggle'],
    ]);
    await wrapper.setProps({ selectedIds: ['shape-1', 'arrow-1', 'text-1', 'drawing-1'] });
    await wrapper.get('.layer-row[data-layer-id="arrow-1"] .layer-select').trigger('click', { ctrlKey: true });
    expect(wrapper.emitted('select')?.at(-1)).toEqual(['arrow-1', 'toggle']);
    await wrapper.setProps({ selectedIds: ['shape-1', 'text-1', 'drawing-1'] });
    expect(wrapper.get('.layer-row[data-layer-id="arrow-1"]').classes()).not.toContain('selected');
    expect(wrapper.get('.layer-row[data-layer-id="arrow-1"] .layer-select').attributes('aria-pressed')).toBe('false');

    await wrapper.get('.layer-row[data-layer-id="cursor-1"] .layer-select').trigger('click');
    expect(wrapper.emitted('select')?.at(-1)).toEqual(['cursor-1']);
  });

  it('updates the selected layer opacity and blend mode and forwards lock and visibility actions', async () => {
    const wrapper = mountComposition({ selectedId: 'shape-1' });
    wrappers.push(wrapper);
    const select = wrapper.findComponent(SelectStub);
    const slider = wrapper.findComponent(BigSliderStub);

    expect(select.props('modelValue')).toBe('source-over');
    expect((select.props('options') as Array<{ value: string }>).map(({ value }) => value)).toContain('multiply');
    expect(slider.props('modelValue')).toBe(100);
    expect((slider.props('formatValue') as (value: number) => string)(64)).toBe('64%');
    select.vm.$emit('update:modelValue', 'multiply' satisfies LayerBlendMode);
    slider.vm.$emit('update:modelValue', 64);
    expect(wrapper.emitted('update')).toEqual([
      ['shape-1', { blendMode: 'multiply' }],
      ['shape-1', { opacity: 64 }],
    ]);

    const row = wrapper.get('.layer-row[data-layer-id="shape-1"]');
    await row.get('button[aria-label="ScreenshotComposition.lock (Elements.shape)"]').trigger('click');
    await row.get('button[aria-label="ScreenshotComposition.hide (Elements.shape)"]').trigger('click');
    expect(wrapper.emitted('update')?.at(-1)).toEqual(['shape-1', { locked: true }]);
    expect(wrapper.emitted('visibility')).toEqual([['shape-1', false]]);
  });

  it('does not start a reorder from the lock or visibility action buttons', async () => {
    const wrapper = mountComposition({ selectedId: 'shape-1' });
    wrappers.push(wrapper);
    const row = wrapper.get('.layer-row[data-layer-id="shape-1"]');
    const lock = row.get('button[aria-label="ScreenshotComposition.lock (Elements.shape)"]');
    const visibility = row.get('button[aria-label="ScreenshotComposition.hide (Elements.shape)"]');

    dispatchPointer(lock.element, 'pointerdown', { pointerId: 31, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 31, clientY: 35 });
    dispatchPointer(window, 'pointerup', { pointerId: 31, clientY: 35 });
    dispatchPointer(visibility.element, 'pointerdown', { pointerId: 32, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 32, clientY: 35 });
    dispatchPointer(window, 'pointerup', { pointerId: 32, clientY: 35 });

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(wrapper.emitted('reorder')).toBeUndefined();

    await lock.trigger('click');
    await visibility.trigger('click');
    expect(wrapper.emitted('update')).toEqual([['shape-1', { locked: true }]]);
    expect(wrapper.emitted('visibility')).toEqual([['shape-1', false]]);
  });

  it('disables compositing for locked or unselected layers while preserving visibility controls', async () => {
    const locked = allLayers().map((layer) =>
      layer.id === 'shape-1' ? { ...layer, locked: true, visible: false } : layer,
    );
    const wrapper = mountComposition({ layers: locked, selectedId: 'shape-1' });
    wrappers.push(wrapper);

    expect(wrapper.get('fieldset').element.disabled).toBe(true);
    expect(wrapper.findComponent(SelectStub).props('disabled')).toBe(true);
    await wrapper
      .get('.layer-row[data-layer-id="shape-1"] button[aria-label="ScreenshotComposition.show (Elements.shape)"]')
      .trigger('click');
    expect(wrapper.emitted('visibility')).toEqual([['shape-1', true]]);

    await wrapper.setProps({ selectedId: null, selectedIds: [] });
    expect(wrapper.get('fieldset').element.disabled).toBe(true);
  });

  it('has no footer or visible reorder hint and handles an empty layer stack', () => {
    const wrapper = mountComposition();
    wrappers.push(wrapper);
    expect(wrapper.find('footer').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('ScreenshotComposition.reorderHint');

    const empty = mountComposition({ layers: [], selectedId: null });
    wrappers.push(empty);
    expect(empty.findAll('.layer-row')).toHaveLength(0);
    expect(empty.get('.layer-count').text()).toBe('0');
    expect(empty.get('fieldset').element.disabled).toBe(true);
    expect(empty.find('footer').exists()).toBe(false);
    expect(empty.text()).not.toContain('ScreenshotComposition.reorderHint');
  });

  it('targets a context-menu deletion to the right-clicked layer after the menu action', async () => {
    const wrapper = mountComposition({ selectedId: 'shape-1' });
    wrappers.push(wrapper);

    const item = await openRowContextMenu(wrapper, 'arrow-1');

    expect(item.textContent).toContain('ScreenshotComposition.delete');
    expect(item.classList.contains('is-danger')).toBe(true);
    expect(item.querySelector('.lucide-trash-2')).not.toBeNull();
    expect(wrapper.emitted('select')).toEqual([['arrow-1']]);
    expect(wrapper.emitted('remove')).toBeUndefined();

    item.click();
    await nextTick();
    expect(wrapper.emitted('remove')).toEqual([['arrow-1']]);
  });

  it('preserves a group selection when opening a menu on one of its members', async () => {
    const wrapper = mountComposition({ selectedId: 'shape-1', selectedIds: ['shape-1', 'arrow-1'] });
    wrappers.push(wrapper);

    const item = await openRowContextMenu(wrapper, 'arrow-1');
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('remove')).toBeUndefined();

    item.click();
    await nextTick();
    expect(wrapper.emitted('remove')).toEqual([['arrow-1']]);
  });

  it('enables group deletion from a protected member but still targets that member', async () => {
    const wrapper = mountComposition({ selectedId: 'shape-1', selectedIds: ['shape-1', 'screenshot'] });
    wrappers.push(wrapper);

    const item = await openRowContextMenu(wrapper, 'screenshot');
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(item.disabled).toBe(false);

    item.click();
    await nextTick();
    expect(wrapper.emitted('remove')).toEqual([['screenshot']]);
  });

  it('disables context-menu deletion for protected or locked layers and blocks disabled editors', async () => {
    const wrapper = mountComposition({ selectedId: 'shape-1' });
    wrappers.push(wrapper);

    for (const id of ['screenshot', '__background__', '__watermark__']) {
      const item = await openRowContextMenu(wrapper, id);
      expect(item.disabled).toBe(true);
      item.click();
      await nextTick();
      expect(wrapper.emitted('remove')).toBeUndefined();
      await closeContextMenu();
    }

    const locked = allLayers().map((layer) => (layer.id === 'shape-1' ? { ...layer, locked: true } : layer));
    await wrapper.setProps({ layers: locked });
    const lockedItem = await openRowContextMenu(wrapper, 'shape-1');
    expect(lockedItem.disabled).toBe(true);
    lockedItem.click();
    await nextTick();
    expect(wrapper.emitted('remove')).toBeUndefined();
    await closeContextMenu();

    await wrapper.setProps({ disabled: true });
    await wrapper.get('.layer-row[data-layer-id="shape-1"]').trigger('contextmenu');
    await nextTick();
    expect(document.body.querySelector('.context-menu-surface')).toBeNull();
    expect(wrapper.emitted('remove')).toBeUndefined();
  });

  it('opens the row context menu with ContextMenu and Shift+F10 keys', async () => {
    const wrapper = mountComposition();
    wrappers.push(wrapper);
    const row = wrapper.get('.layer-row[data-layer-id="arrow-1"] .layer-select');

    row.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.body.querySelector('.context-menu-surface')).not.toBeNull();
    expect(document.body.querySelector('.context-menu-item')?.textContent).toContain('ScreenshotComposition.delete');
    await closeContextMenu();

    row.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }),
    );
    await nextTick();
    expect(document.body.querySelector('.context-menu-surface')).not.toBeNull();
    expect(wrapper.emitted('select')?.at(-1)).toEqual(['arrow-1']);
    await closeContextMenu();
  });

  it('closes the context menu on collapse, panel drag, editor disable, or target removal', async () => {
    const wrapper = mountComposition();
    wrappers.push(wrapper);

    await openRowContextMenu(wrapper, 'arrow-1');
    await wrapper.get('.composition-toggle').trigger('click');
    expect(document.body.querySelector('.context-menu-surface')).toBeNull();

    await wrapper.get('.composition-toggle').trigger('click');
    await openRowContextMenu(wrapper, 'arrow-1');
    if (!compositionPosition.dragging) throw new Error('Panel position mock is not initialized.');
    compositionPosition.dragging.value = true;
    await nextTick();
    expect(document.body.querySelector('.context-menu-surface')).toBeNull();

    compositionPosition.dragging.value = false;
    await openRowContextMenu(wrapper, 'arrow-1');
    await wrapper.setProps({ disabled: true });
    expect(document.body.querySelector('.context-menu-surface')).toBeNull();

    await wrapper.setProps({ disabled: false });
    await openRowContextMenu(wrapper, 'arrow-1');
    await wrapper.setProps({ layers: allLayers().filter((layer) => layer.id !== 'arrow-1') });
    await nextTick();
    expect(document.body.querySelector('.context-menu-surface')).toBeNull();
  });

  it('uses one native card button for the accessible title, layer count, and chevron', () => {
    const wrapper = mountComposition({}, document.body);
    wrappers.push(wrapper);

    const toggle = wrapper.get('.composition-toggle');
    const element = toggle.element as HTMLButtonElement;
    const buttonComponent = wrapper.findComponent(Button);

    expect(wrapper.findAll('.composition-header button')).toHaveLength(1);
    expect(element.tagName).toBe('BUTTON');
    expect(element.type).toBe('button');
    expect(element.tabIndex).toBe(0);
    expect(element.style.height).toBe('var(--composition-header-height)');
    expect(element.style.minHeight).toBe('var(--composition-header-height)');
    expect(element.style.padding).toBe('0px 14px');
    expect(element.style.touchAction).toBe('none');
    element.focus();
    expect(document.activeElement).toBe(element);
    expect(toggle.attributes('aria-label')).toBe('ScreenshotComposition.collapse');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.get('strong').text()).toBe('ScreenshotComposition.title');
    expect(toggle.get('.layer-count').text()).toBe('8');
    expect(toggle.find('.composition-chevron').exists()).toBe(true);
    expect(buttonComponent?.props('variant')).toBe('card');
    expect(buttonComponent?.props('block')).toBe(true);
  });

  it('toggles from clicks on the title and live layer count', async () => {
    const wrapper = mountComposition();
    wrappers.push(wrapper);

    await wrapper.get('.composition-toggle strong').trigger('click');
    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.composition-content').exists()).toBe(false);

    await wrapper.get('.composition-toggle .layer-count').trigger('click');
    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.composition-content').exists()).toBe(true);
    expect(wrapper.get('.composition-toggle .layer-count').text()).toBe('8');
  });

  it('points the chevron toward the available panel space', async () => {
    installMediaQuery(false);
    const wrapper = mountComposition();
    wrappers.push(wrapper);
    const toggle = wrapper.get('.composition-toggle');
    const chevron = wrapper.get('.composition-chevron');

    expect(wrapper.findComponent(ChevronDown).exists()).toBe(true);
    expect(chevron.classes()).toContain('points-up');
    await toggle.trigger('click');
    expect(chevron.classes()).not.toContain('points-up');

    if (!compositionPosition.upward) throw new Error('Panel position mock is not initialized.');
    compositionPosition.upward.value = true;
    await nextTick();
    expect(chevron.classes()).toContain('points-up');

    await toggle.trigger('click');
    expect(chevron.classes()).not.toContain('points-up');
  });

  it('starts moving the panel from the toggle and passes its pointer target', async () => {
    const wrapper = mountComposition();
    wrappers.push(wrapper);
    const toggle = wrapper.get('.composition-toggle');
    let targetDuringBegin: EventTarget | null = null;

    compositionPosition.begin.mockImplementationOnce((event) => {
      targetDuringBegin = event.currentTarget;
    });
    dispatchPointer(toggle.element, 'pointerdown', { pointerId: 22, clientY: 50 });

    expect(compositionPosition.begin).toHaveBeenCalledOnce();
    expect(targetDuringBegin).toBe(toggle.element);
  });

  it('collapses and expands the layer list and controls', async () => {
    const wrapper = mountComposition();
    wrappers.push(wrapper);

    const collapse = wrapper.get('.composition-toggle[aria-label="ScreenshotComposition.collapse"]');
    await collapse.trigger('click');
    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.layer-list').exists()).toBe(false);
    expect(wrapper.find('fieldset').exists()).toBe(false);

    await wrapper.get('.composition-toggle[aria-label="ScreenshotComposition.expand"]').trigger('click');
    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.layer-list').exists()).toBe(true);
  });

  it('starts collapsed on compact windows, permits reopening, and collapses when the window becomes compact', async () => {
    const media = installMediaQuery(true);
    const wrapper = mountComposition();
    wrappers.push(wrapper);
    await nextTick();

    expect(media.matchMedia).toHaveBeenCalledWith('(max-width: 1180px)');
    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('false');

    await wrapper.get('.composition-toggle[aria-label="ScreenshotComposition.expand"]').trigger('click');
    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('true');

    media.setMatches(false);
    await nextTick();
    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('true');

    media.setMatches(true);
    await nextTick();
    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('false');
  });

  it('measures the collapsed panel before showing it on a compact window', async () => {
    installMediaQuery(true);
    if (!compositionPosition.ready) throw new Error('Panel position mock is not initialized.');
    compositionPosition.ready.value = false;
    const wrapper = mountComposition();
    wrappers.push(wrapper);
    const header = wrapper.get('.composition-header');

    expect(wrapper.get('.composition-toggle').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.composition-content').exists()).toBe(true);
    expect(wrapper.get('.screenshot-composition').classes()).toContain('positioning');

    compositionPosition.ready.value = true;
    await nextTick();

    expect(wrapper.find('.composition-content').exists()).toBe(false);
    expect(wrapper.get('.screenshot-composition').classes()).not.toContain('positioning');
    expect(wrapper.get('.composition-header').element).toBe(header.element);
  });

  it('moves a row into the front position and emits its front index', async () => {
    const layers = allLayers();
    const wrapper = mountComposition({ layers });
    wrappers.push(wrapper);
    const list = wrapper.get('.layer-list');
    vi.spyOn(list.element, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 260,
      bottom: 300,
      width: 260,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    for (const row of wrapper.findAll('.layer-row')) {
      Object.defineProperty(row.element, 'offsetHeight', { configurable: true, value: 44 });
    }

    const selectButton = wrapper.get('.layer-row[data-layer-id="screenshot"] .layer-select');
    const pointerDown = dispatchPointer(selectButton.element, 'pointerdown', { pointerId: 12, clientY: 100 });
    expect(pointerDown.defaultPrevented).toBe(false);
    expect(setPointerCapture).not.toHaveBeenCalled();
    dispatchPointer(window, 'pointermove', { pointerId: 12, clientY: 35 });
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.layer-row').map((row) => row.attributes('data-layer-id'))[0]).toBe('screenshot');
    expect(setPointerCapture).toHaveBeenCalledWith(12);

    dispatchPointer(window, 'pointerup', { pointerId: 12, clientY: 35 });
    expect(wrapper.emitted('reorder')).toEqual([['screenshot', 0]]);
    expect(releasePointerCapture).toHaveBeenCalledWith(12);

    const dragClick = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    selectButton.element.dispatchEvent(dragClick);
    expect(dragClick.defaultPrevented).toBe(true);
    expect(wrapper.emitted('select')).toBeUndefined();

    const reordered = [
      ...layers.filter((layer) => layer.id !== 'screenshot'),
      layers.find((layer) => layer.id === 'screenshot')!,
    ];
    await wrapper.setProps({ layers: reordered });
    expect(wrapper.findAll('.layer-row').map((row) => row.attributes('data-layer-id'))[0]).toBe('screenshot');
  });

  it('reorders with Alt plus arrows, clamps at stack edges, and ignores other or disabled keys', async () => {
    const wrapper = mountComposition();
    wrappers.push(wrapper);
    const top = wrapper.get('.layer-row[data-layer-id="__watermark__"] .layer-select');
    const shape = wrapper.get('.layer-row[data-layer-id="shape-1"] .layer-select');
    const bottom = wrapper.get('.layer-row[data-layer-id="__background__"] .layer-select');

    await shape.trigger('keydown', { key: 'ArrowUp', altKey: false });
    await shape.trigger('keydown', { key: 'ArrowLeft', altKey: true });
    expect(wrapper.emitted('reorder')).toBeUndefined();

    await shape.trigger('keydown', { key: 'ArrowUp', altKey: true });
    await shape.trigger('keydown', { key: 'ArrowDown', altKey: true });
    await top.trigger('keydown', { key: 'ArrowUp', altKey: true });
    await bottom.trigger('keydown', { key: 'ArrowDown', altKey: true });
    expect(wrapper.emitted('reorder')).toEqual([
      ['shape-1', 4],
      ['shape-1', 6],
      ['__watermark__', 0],
      ['__background__', 7],
    ]);

    await wrapper.setProps({ disabled: true });
    await shape.trigger('keydown', { key: 'ArrowUp', altKey: true });
    expect(wrapper.emitted('reorder')).toHaveLength(4);
    expect((shape.element as HTMLButtonElement).disabled).toBe(true);
    expect(
      (
        wrapper.get(
          '.layer-row[data-layer-id="shape-1"] button[aria-label="ScreenshotComposition.lock (Elements.shape)"]',
        ).element as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        wrapper.get(
          '.layer-row[data-layer-id="shape-1"] button[aria-label="ScreenshotComposition.hide (Elements.shape)"]',
        ).element as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
