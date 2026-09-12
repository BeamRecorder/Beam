import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import CursorAppearanceControls from '../CursorAppearanceControls.vue';
import type { CursorAppearanceProps } from '../cursor-appearance-types';

const capture = vi.hoisted(() => ({ pickCursorPackImport: vi.fn(), openCursorPackDiscovery: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => toast }));

const Select = {
  name: 'TestSelect',
  props: ['modelValue', 'options', 'disabled'],
  emits: ['update:modelValue', 'preview:modelValue'],
  template: `
    <select class="cursor-select" :value="modelValue" :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
  `,
};
const BigSlider = {
  props: ['label', 'modelValue', 'defaultValue', 'min', 'max'],
  emits: ['update:modelValue'],
  template:
    '<div class="cursor-slider" :data-label="label" :data-value="modelValue" :data-default="defaultValue" :data-min="min" :data-max="max"><button class="slider-change" @click="$emit(\'update:modelValue\', modelValue + 1)" /></div>',
};
const ColorInput = {
  props: ['label', 'modelValue'],
  emits: ['update:modelValue'],
  template:
    '<div class="cursor-color" :data-label="label" :data-value="modelValue"><button class="color-change" @click="$emit(\'update:modelValue\', \'#123456\')" /></div>',
};
const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<button class="cursor-switch" :data-value="modelValue" @click="$emit(\'update:modelValue\', !modelValue)" />',
};
const Button = {
  props: ['disabled', 'loading'],
  emits: ['click'],
  template:
    '<button type="button" class="cursor-button" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
};
const AdvancedButton = {
  props: ['open', 'controls', 'label'],
  emits: ['update:open'],
  template: '<button class="advanced-toggle" @click="$emit(\'update:open\', !open)">{{ label }}</button>',
};
const ShadowDirectionGroup = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<button class="shadow-direction" :data-value="modelValue" @click="$emit(\'update:modelValue\', \'top-left\')" />',
};
const Divider = { template: '<div class="divider" />' };
const BlurRevealTransition = { template: '<div class="transition"><slot /></div>' };
const Popover = { template: '<div><slot name="trigger" /><slot /></div>' };
const global = {
  stubs: {
    Select,
    BigSlider,
    ColorInput,
    Switch,
    Button,
    AdvancedButton,
    ShadowDirectionGroup,
    Divider,
    BlurRevealTransition,
    Popover,
  },
};

const asset = (id: string, tintable = true): CursorAssetDescriptor => ({
  id,
  label: id[0]!.toUpperCase() + id.slice(1),
  url: `project-media://cursor/pack/${id}.${tintable ? 'svg' : 'png'}`,
  format: tintable ? 'svg' : 'png',
  tintable,
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 4, y: 5 },
});

const pack = (id: string, name: string, cursorIds = ['default', 'pointer']): CursorPackDescriptor => ({
  id,
  name,
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: cursorIds[0]!,
  cursors: cursorIds.map((cursorId) => asset(cursorId)),
  automaticMap: Object.fromEntries(cursorIds.map((cursorId) => [cursorId, cursorId])),
});

const firstPack = pack('pack:first', 'First');
const secondPack = pack('pack:second', 'Second', ['default', 'pointer', 'cross']);
const baseProps = (overrides: Partial<CursorAppearanceProps> = {}): CursorAppearanceProps => ({
  selection: { packId: firstPack.id, mode: 'fixed', cursorId: 'pointer' },
  packs: [firstPack, secondPack],
  cursorSize: 45,
  cursorColor: '#000000',
  enableShadow: true,
  shadowBlur: 6,
  shadowColor: '#000000',
  shadowDirection: 'bottom',
  still: true,
  ...overrides,
});

describe('CursorAppearanceControls', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    capture.pickCursorPackImport.mockReset();
    capture.openCursorPackDiscovery.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('shows fixed cursor styles without an automatic option for a static layer', async () => {
    const wrapper = mount(CursorAppearanceControls, { props: { ...baseProps() }, global });
    const selects = wrapper.findAll('select.cursor-select');

    expect(selects).toHaveLength(2);
    expect(wrapper.find('.advanced-toggle').exists()).toBe(false);
    expect(selects[1]!.findAll('option').map((option) => option.element.value)).toEqual(['default', 'pointer']);
    await selects[1]!.setValue('default');

    expect(wrapper.emitted('update:selection')).toEqual([
      [{ packId: firstPack.id, mode: 'fixed', cursorId: 'default' }],
    ]);
    expect(wrapper.emitted('preview:selection')).toEqual([[null]]);
    expect(
      wrapper.findAll('.cursor-color').some((control) => control.attributes('data-label') === 'Cursor Color'),
    ).toBe(true);
    expect(wrapper.find('.cursor-size-control').attributes('data-default')).toBe('45');
  });

  it('exposes the shared 384-pixel maximum for the cursor size control', () => {
    const wrapper = mount(CursorAppearanceControls, { props: { ...baseProps() }, global });

    expect(wrapper.find('.cursor-size-control').attributes('data-max')).toBe('384');
  });

  it('switches static layers to the new pack fixed default when the selected style is missing', async () => {
    const wrapper = mount(CursorAppearanceControls, {
      props: { ...baseProps({ selection: { packId: firstPack.id, mode: 'fixed', cursorId: 'not-in-second' } }) },
      global,
    });

    await wrapper.findAll('select.cursor-select')[0]!.setValue(secondPack.id);

    expect(wrapper.emitted('update:selection')).toEqual([
      [{ packId: secondPack.id, mode: 'fixed', cursorId: secondPack.defaultCursorId }],
    ]);
  });

  it('keeps the selected fixed style when the destination pack also contains it', async () => {
    const wrapper = mount(CursorAppearanceControls, { props: { ...baseProps() }, global });

    await wrapper.findAll('select.cursor-select')[0]!.setValue(secondPack.id);

    expect(wrapper.emitted('update:selection')).toEqual([
      [{ packId: secondPack.id, mode: 'fixed', cursorId: 'pointer' }],
    ]);
  });

  it('imports a cursor pack as a fixed default for a static cursor layer', async () => {
    const imported = pack('pack:imported', 'Imported', ['default', 'hand']);
    const order: string[] = [];
    capture.pickCursorPackImport.mockResolvedValue({
      pack: imported,
      importedCount: 2,
      ignoredAnimatedRoles: ['busy'],
      duplicate: false,
    });
    const wrapper = mount(CursorAppearanceControls, {
      props: {
        ...baseProps(),
        onImported: () => order.push('imported'),
        'onUpdate:selection': () => order.push('selection'),
      },
      global,
    });

    await wrapper.get('.pack-import-button').trigger('click');
    await flushPromises();

    expect(capture.pickCursorPackImport).toHaveBeenCalledOnce();
    expect(wrapper.emitted('update:selection')).toEqual([
      [{ packId: imported.id, mode: 'fixed', cursorId: imported.defaultCursorId }],
    ]);
    expect(order).toEqual(['imported', 'selection']);
    expect(toast.success).toHaveBeenCalledOnce();
    expect(toast.success.mock.calls[0]?.[0]).toContain('busy');
  });

  it('preserves automatic selection when reused by the video cursor controls', async () => {
    const selection: CursorSelection = { packId: firstPack.id, mode: 'automatic', cursorId: null };
    const wrapper = mount(CursorAppearanceControls, {
      props: { ...baseProps({ selection, still: false }) },
      global,
    });

    await wrapper.findAll('select.cursor-select')[0]!.setValue(secondPack.id);

    expect(wrapper.emitted('update:selection')).toEqual([
      [{ packId: secondPack.id, mode: 'automatic', cursorId: null }],
    ]);
    expect(wrapper.find('.advanced-toggle').exists()).toBe(true);
  });

  it('hides tint control for original-colour bitmap cursor assets', () => {
    const originalPack: CursorPackDescriptor = {
      ...pack('pack:original', 'Original', ['default']),
      colorMode: 'original',
      cursors: [asset('default', false)],
    };
    const wrapper = mount(CursorAppearanceControls, {
      props: {
        ...baseProps({
          packs: [originalPack],
          selection: { packId: originalPack.id, mode: 'fixed', cursorId: 'default' },
        }),
      },
      global,
    });

    expect(
      wrapper.findAll('.cursor-color').some((control) => control.attributes('data-label') === 'Cursor Color'),
    ).toBe(false);
  });

  it('forwards size, tint, shadow, and direction changes from the shared controls', () => {
    const wrapper = mount(CursorAppearanceControls, { props: { ...baseProps() }, global });
    const sliders = wrapper.findAllComponents(BigSlider);
    const colors = wrapper.findAllComponents(ColorInput);

    expect(sliders).toHaveLength(2);
    expect(colors).toHaveLength(2);
    sliders[0]!.vm.$emit('update:modelValue', 72);
    sliders[1]!.vm.$emit('update:modelValue', 10);
    colors[0]!.vm.$emit('update:modelValue', '#123456');
    colors[1]!.vm.$emit('update:modelValue', '#654321');
    wrapper.findComponent(Switch).vm.$emit('update:modelValue', false);
    wrapper.findComponent(ShadowDirectionGroup).vm.$emit('update:modelValue', 'top-left');

    expect(wrapper.emitted('update:cursorSize')).toEqual([[72]]);
    expect(wrapper.emitted('update:shadowBlur')).toEqual([[10]]);
    expect(wrapper.emitted('update:cursorColor')).toEqual([['#123456']]);
    expect(wrapper.emitted('update:shadowColor')).toEqual([['#654321']]);
    expect(wrapper.emitted('update:enableShadow')).toEqual([[false]]);
    expect(wrapper.emitted('update:shadowDirection')).toEqual([['top-left']]);
  });

  it('previews cursor styles, clears previews on selection, and ignores non-string values', async () => {
    const wrapper = mount(CursorAppearanceControls, {
      props: { ...baseProps({ still: false, selection: { packId: firstPack.id, mode: 'automatic', cursorId: null } }) },
      global,
    });
    await wrapper.get('.advanced-toggle').trigger('click');

    const selects = wrapper.findAllComponents(Select);
    expect(selects[1]!.props('options').map((option: { value: string }) => option.value)).toContain('__automatic__');
    selects[1]!.vm.$emit('preview:modelValue', 'pointer');
    selects[1]!.vm.$emit('preview:modelValue', '__automatic__');
    selects[1]!.vm.$emit('update:modelValue', '__automatic__');
    selects[1]!.vm.$emit('update:modelValue', 5);
    selects[0]!.vm.$emit('update:modelValue', 5);
    selects[0]!.vm.$emit('update:modelValue', 'missing-pack');

    expect(wrapper.emitted('preview:selection')).toEqual([
      [{ packId: firstPack.id, mode: 'fixed', cursorId: 'pointer' }],
      [null],
      [null],
    ]);
    expect(wrapper.emitted('update:selection')).toEqual([
      [{ packId: firstPack.id, mode: 'automatic', cursorId: null }],
    ]);
  });

  it('uses the default asset for automatic tint availability and displays a missing-pack state', () => {
    const mixedPack = {
      ...pack('pack:mixed', 'Mixed', ['default', 'pointer']),
      cursors: [asset('default', false), asset('pointer', true)],
    };
    const automatic = mount(CursorAppearanceControls, {
      props: {
        ...baseProps({
          packs: [mixedPack],
          selection: { packId: mixedPack.id, mode: 'automatic', cursorId: null },
          still: false,
        }),
      },
      global,
    });
    expect(
      automatic.findAll('.cursor-color').some((control) => control.attributes('data-label') === 'Cursor Color'),
    ).toBe(false);

    const missing = mount(CursorAppearanceControls, {
      props: { ...baseProps({ selection: { packId: 'pack:removed', mode: 'fixed', cursorId: 'missing' } }) },
      global,
    });
    expect(missing.find('.missing-pack').exists()).toBe(true);
    expect(
      missing.findAll('.cursor-color').some((control) => control.attributes('data-label') === 'Cursor Color'),
    ).toBe(false);
  });

  it('handles canceled imports and reports both import and discovery failures', async () => {
    capture.pickCursorPackImport.mockResolvedValueOnce(null);
    const wrapper = mount(CursorAppearanceControls, { props: { ...baseProps() }, global });
    await wrapper.get('.pack-import-button').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('imported')).toBeUndefined();
    expect(toast.error).not.toHaveBeenCalled();
    expect((wrapper.get('.pack-import-button').element as HTMLButtonElement).disabled).toBe(false);

    capture.pickCursorPackImport.mockRejectedValueOnce(new Error('import denied'));
    await wrapper.get('.pack-import-button').trigger('click');
    await flushPromises();
    expect(toast.error).toHaveBeenLastCalledWith('import denied');

    capture.pickCursorPackImport.mockRejectedValueOnce('unexpected import failure');
    await wrapper.get('.pack-import-button').trigger('click');
    await flushPromises();
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error.mock.calls[1]?.[0]).toMatch(/unable to import the cursor pack/i);

    capture.openCursorPackDiscovery.mockResolvedValueOnce(undefined);
    await wrapper.find('.discovery-popover .cursor-button').trigger('click');
    await flushPromises();
    expect(capture.openCursorPackDiscovery).toHaveBeenCalledOnce();

    capture.openCursorPackDiscovery.mockRejectedValueOnce(new Error('discovery unavailable'));
    await wrapper.find('.discovery-popover .cursor-button').trigger('click');
    await flushPromises();
    expect(toast.error).toHaveBeenCalledTimes(3);
    expect(toast.error.mock.calls[2]?.[0]).toMatch(/open the cursor theme catalog/i);
  });
});
