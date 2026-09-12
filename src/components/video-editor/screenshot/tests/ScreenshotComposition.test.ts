import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerBlendMode } from '~/media/shared/layer-compositing-types';
import type { ScreenshotLayer } from '../screenshot-layer-types';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: (namespace: string) => ({
    t: (key: string, params?: Record<string, unknown>) =>
      `${namespace}.${key}${typeof params?.name === 'string' ? ` (${params.name})` : ''}`,
  }),
}));

import ScreenshotComposition from '../composition/ScreenshotComposition.vue';

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: ['disabled', 'icon', 'iconOnly', 'size', 'variant'],
  emits: ['click'],
  template:
    '<button type="button" v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
});

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

const stubs = { Button: ButtonStub, Select: SelectStub, BigSlider: BigSliderStub };
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
  props: Partial<{ layers: ScreenshotLayer[]; selectedId: string | null; source: string; disabled: boolean }> = {},
) =>
  mount(ScreenshotComposition, {
    props: { layers: allLayers(), selectedId: 'shape-1', source, ...props },
    global: { stubs },
  });

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
    expect(wrapper.get('.layer-row[data-layer-id="screenshot"] img').attributes('src')).toBe(source);

    await wrapper.get('.layer-row[data-layer-id="screenshot"] .layer-select').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['screenshot']]);
  });

  it('updates the selected layer opacity and blend mode and forwards row actions', async () => {
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

    await wrapper.get('footer button[aria-label="ScreenshotComposition.delete"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['shape-1']]);
  });

  it('disables compositing and deletion for locked or unselected layers, while preserving visibility controls', async () => {
    const locked = allLayers().map((layer) =>
      layer.id === 'shape-1' ? { ...layer, locked: true, visible: false } : layer,
    );
    const wrapper = mountComposition({ layers: locked, selectedId: 'shape-1' });
    wrappers.push(wrapper);

    expect(wrapper.get('fieldset').element.disabled).toBe(true);
    expect(wrapper.findComponent(SelectStub).props('disabled')).toBe(true);
    expect((wrapper.get('footer button').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper
      .get('.layer-row[data-layer-id="shape-1"] button[aria-label="ScreenshotComposition.show (Elements.shape)"]')
      .trigger('click');
    expect(wrapper.emitted('visibility')).toEqual([['shape-1', true]]);

    await wrapper.setProps({ selectedId: null });
    expect(wrapper.get('fieldset').element.disabled).toBe(true);
    expect((wrapper.get('footer button').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('cannot delete the screenshot or background and handles an empty layer stack', () => {
    const wrapper = mountComposition({ selectedId: '__background__' });
    wrappers.push(wrapper);
    expect((wrapper.get('footer button').element as HTMLButtonElement).disabled).toBe(true);

    const empty = mountComposition({ layers: [], selectedId: null });
    wrappers.push(empty);
    expect(empty.findAll('.layer-row')).toHaveLength(0);
    expect(empty.get('.layer-count').text()).toBe('0');
    expect(empty.get('fieldset').element.disabled).toBe(true);
    expect((empty.get('footer button').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('collapses and expands the layer list and controls', async () => {
    const wrapper = mountComposition();
    wrappers.push(wrapper);

    const collapse = wrapper.get('header button[aria-label="ScreenshotComposition.collapse"]');
    await collapse.trigger('click');
    expect(wrapper.get('header button').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.layer-list').exists()).toBe(false);
    expect(wrapper.find('fieldset').exists()).toBe(false);

    await wrapper.get('header button[aria-label="ScreenshotComposition.expand"]').trigger('click');
    expect(wrapper.get('header button').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.layer-list').exists()).toBe(true);
  });

  it('starts collapsed on compact windows, permits reopening, and collapses when the window becomes compact', async () => {
    const media = installMediaQuery(true);
    const wrapper = mountComposition();
    wrappers.push(wrapper);
    await nextTick();

    expect(media.matchMedia).toHaveBeenCalledWith('(max-width: 1180px)');
    expect(wrapper.get('header button').attributes('aria-expanded')).toBe('false');

    await wrapper.get('header button[aria-label="ScreenshotComposition.expand"]').trigger('click');
    expect(wrapper.get('header button').attributes('aria-expanded')).toBe('true');

    media.setMatches(false);
    await nextTick();
    expect(wrapper.get('header button').attributes('aria-expanded')).toBe('true');

    media.setMatches(true);
    await nextTick();
    expect(wrapper.get('header button').attributes('aria-expanded')).toBe('false');
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

    const grip = wrapper.get('.layer-row[data-layer-id="screenshot"] .layer-grip').element;
    dispatchPointer(grip, 'pointerdown', { pointerId: 12, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 12, clientY: 35 });
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.layer-row').map((row) => row.attributes('data-layer-id'))[0]).toBe('screenshot');

    dispatchPointer(window, 'pointerup', { pointerId: 12, clientY: 35 });
    expect(wrapper.emitted('reorder')).toEqual([['screenshot', 0]]);
    expect(setPointerCapture).toHaveBeenCalledWith(12);
    expect(releasePointerCapture).toHaveBeenCalledWith(12);

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
    const top = wrapper.get('.layer-row[data-layer-id="__watermark__"]');
    const shape = wrapper.get('.layer-row[data-layer-id="shape-1"]');
    const bottom = wrapper.get('.layer-row[data-layer-id="__background__"]');

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
    expect((wrapper.get('.layer-grip').element as HTMLButtonElement).disabled).toBe(true);
  });
});
