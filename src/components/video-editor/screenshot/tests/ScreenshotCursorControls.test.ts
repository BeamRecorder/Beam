import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import CursorAppearanceControls from '../../properties/cursor/CursorAppearanceControls.vue';
import ScreenshotCursorControls from '../ScreenshotCursorControls.vue';
import type { ScreenshotCursorLayer } from '../screenshot-layer-types';

const capture = vi.hoisted(() => ({ pickCursorPackImport: vi.fn(), openCursorPackDiscovery: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => toast }));
vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: (namespace: string) => ({ t: (key: string) => `${namespace}.${key}` }),
}));

const SelectStub = defineComponent({
  inheritAttrs: false,
  props: ['modelValue', 'options', 'disabled'],
  emits: ['update:modelValue', 'preview:modelValue'],
  template:
    '<select v-bind="$attrs" class="cursor-select" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
});

const BigSliderStub = defineComponent({
  inheritAttrs: false,
  props: ['label', 'modelValue', 'defaultValue', 'min', 'max', 'step', 'formatValue'],
  emits: ['update:modelValue'],
  template:
    '<input v-bind="$attrs" class="cursor-slider" type="range" :aria-label="label" :min="min" :max="max" :step="step" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
});

const ColorInputStub = defineComponent({
  inheritAttrs: false,
  props: ['label', 'modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input v-bind="$attrs" class="cursor-color" type="text" :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
});

const SwitchStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input class="cursor-switch" type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
});

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: ['disabled', 'loading'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" type="button" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
});

const DividerStub = defineComponent({ template: '<div class="divider"></div>' });
const BlurRevealTransitionStub = defineComponent({ template: '<div><slot /></div>' });
const PopoverStub = defineComponent({ template: '<div><slot name="trigger" /><slot /></div>' });
const AdvancedButtonStub = defineComponent({ template: '<button><slot /></button>' });

const asset = (id: string): CursorAssetDescriptor => ({
  id,
  label: id[0]!.toUpperCase() + id.slice(1),
  url: `project-media://cursor/pack/${id}.svg`,
  format: 'svg',
  tintable: true,
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 2, y: 3 },
});

const makePack = (id: string, name: string, cursorIds: string[] = ['default', 'pointer']): CursorPackDescriptor => ({
  id,
  name,
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: cursorIds[0]!,
  cursors: cursorIds.map(asset),
  automaticMap: Object.fromEntries(cursorIds.map((cursorId) => [cursorId, cursorId])),
});

const pack = makePack('pack:arrows', 'Arrows');
const otherPack = makePack('pack:other', 'Other', ['default', 'pointer', 'hand']);
const importedPack = makePack('pack:imported', 'Imported', ['hand']);

const makeCursor = (): ScreenshotCursorLayer => ({
  id: 'cursor-1',
  name: 'Pointer',
  enabled: true,
  position: { x: 0.4, y: 0.6 },
  size: 48,
  rotation: 27,
  selection: { packId: pack.id, mode: 'fixed', cursorId: 'pointer' },
  color: '#336699',
  shadowEnabled: true,
  shadowBlur: 8,
  shadowColor: '#112233',
  shadowDirection: 'bottom-right',
});

const global = {
  stubs: {
    Select: SelectStub,
    BigSlider: BigSliderStub,
    ColorInput: ColorInputStub,
    Switch: SwitchStub,
    Button: ButtonStub,
    Divider: DividerStub,
    BlurRevealTransition: BlurRevealTransitionStub,
    Popover: PopoverStub,
    AdvancedButton: AdvancedButtonStub,
  },
};

const mountControls = (cursor = makeCursor()) =>
  mount(ScreenshotCursorControls, { props: { cursor, packs: [pack, otherPack] }, global });

beforeEach(() => {
  capture.pickCursorPackImport.mockReset();
  capture.openCursorPackDiscovery.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe('ScreenshotCursorControls', () => {
  it('binds the still-cursor style and rotation values to the shared controls', () => {
    const cursor = makeCursor();
    const wrapper = mountControls(cursor);
    const appearance = wrapper.findComponent(CursorAppearanceControls);
    const rotation = wrapper
      .findAllComponents(BigSliderStub)
      .find((control) => control.props('label') === 'CanvasPanel.shapeRotation')!;

    expect(appearance.props()).toMatchObject({
      selection: cursor.selection,
      packs: [pack, otherPack],
      cursorSize: cursor.size,
      cursorColor: cursor.color,
      enableShadow: cursor.shadowEnabled,
      shadowBlur: cursor.shadowBlur,
      shadowColor: cursor.shadowColor,
      shadowDirection: cursor.shadowDirection,
      still: true,
    });
    expect(rotation.props('modelValue')).toBe(cursor.rotation);
    expect(rotation.props('min')).toBe(0);
    expect(rotation.props('max')).toBe(360);
    expect(rotation.props('step')).toBe(1);
    expect(rotation.props('defaultValue')).toBe(0);
    expect((rotation.props('formatValue') as (value: number) => string)(213)).toBe('213°');
  });

  it('forwards style edits and imported packs from real shared controls', async () => {
    const wrapper = mountControls();
    capture.pickCursorPackImport.mockResolvedValue({
      pack: importedPack,
      importedCount: 1,
      ignoredAnimatedRoles: [],
      duplicate: false,
    });

    const selects = wrapper.findAll('select.cursor-select');
    await selects[1]!.setValue('default');
    await selects[0]!.setValue(otherPack.id);
    await wrapper.get('input.cursor-size-control').setValue('72');
    await wrapper.get('input[aria-label="CursorPanel.cursorColor"]').setValue('#abcdef');
    await wrapper.get('input[aria-label="CursorPanel.shadowBlur"]').setValue('13');
    await wrapper.get('input[aria-label="CursorPanel.shadowColor"]').setValue('#fedcba');
    await wrapper.get('button[aria-label="ShadowDirectionGroup.topLeft"]').trigger('click');
    await wrapper.get('input.cursor-switch').setValue(false);

    const rotation = wrapper
      .findAllComponents(BigSliderStub)
      .find((control) => control.props('label') === 'CanvasPanel.shapeRotation')!;
    await rotation.get('input').setValue('213');

    await wrapper.get('.pack-import-button').trigger('click');
    await flushPromises();

    expect(capture.pickCursorPackImport).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledOnce();
    expect(wrapper.emitted('imported')).toEqual([[importedPack]]);
    const updates = wrapper.emitted('update') ?? [];
    expect(updates).toEqual(
      expect.arrayContaining([
        [{ selection: { packId: pack.id, mode: 'fixed', cursorId: 'default' } satisfies CursorSelection }],
        [{ selection: { packId: otherPack.id, mode: 'fixed', cursorId: 'pointer' } satisfies CursorSelection }],
        [{ size: 72 }],
        [{ color: '#abcdef' }],
        [{ shadowBlur: 13 }],
        [{ shadowColor: '#fedcba' }],
        [{ shadowDirection: 'top-left' }],
        [{ shadowEnabled: false }],
        [{ rotation: 213 }],
        [{ selection: { packId: importedPack.id, mode: 'fixed', cursorId: 'hand' } satisfies CursorSelection }],
      ]),
    );
  });
});
