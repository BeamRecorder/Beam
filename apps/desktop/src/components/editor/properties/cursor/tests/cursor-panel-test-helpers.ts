import { mount } from '@vue/test-utils';
import CursorPanel from '../CursorPanel.vue';
import { MACOS_CURSOR_PACK, orderedCursorPacks } from '../cursor-packs';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
import type { CursorPanelProps } from '../cursor-panel-types';
import {
  createDefaultCursorAutoHideSettings,
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
} from '@beam/engine/capture/cursor-settings';

export const Select = {
  props: ['modelValue', 'options', 'disabled'],
  emits: ['update:modelValue', 'preview:modelValue'],
  template: `
    <button
      type="button"
      class="cursor-select"
      :disabled="disabled"
      :data-model-value="modelValue"
      @mouseenter="$emit('preview:modelValue', options?.[1]?.value ?? null)"
      @mouseleave="$emit('preview:modelValue', null)"
      @focus="$emit('preview:modelValue', options?.[1]?.value ?? null)"
      @blur="$emit('preview:modelValue', null)"
      @click="$emit('update:modelValue', options?.[1]?.value ?? modelValue)"
    >
      {{ options?.map((option) => option.label).join(' | ') }}
    </button>
  `,
};

const BigSlider = {
  props: ['label', 'modelValue', 'defaultValue', 'min', 'max', 'step', 'formatValue'],
  emits: ['update:modelValue'],
  template:
    '<button type="button" class="cursor-slider" :aria-label="label" :data-label="label" :data-model-value="modelValue" :data-default-value="defaultValue" :data-min="min" :data-max="max" :data-step="step" @click="$emit(\'update:modelValue\', max <= 1 ? 0.3 : 30)">{{ formatValue(modelValue) }}</button>',
};

const ColorInput = {
  props: ['disabled', 'label'],
  emits: ['update:modelValue'],
  template:
    '<button type="button" class="cursor-color" :data-label="label" :disabled="disabled" @click="$emit(\'update:modelValue\', \'#fff\')">Color</button>',
};

const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<button type="button" class="cursor-switch" :data-model-value="modelValue" @click="$emit(\'update:modelValue\', !modelValue)">Switch</button>',
};

const ShadowDirectionGroup = {
  emits: ['update:modelValue'],
  template:
    '<button type="button" class="shadow-direction" @click="$emit(\'update:modelValue\', \'top-left\')">Direction</button>',
};

const CursorClickEffectsPanel = {
  emits: ['update:modelValue'],
  template:
    '<button type="button" class="click-effects-stub" @click="$emit(\'update:modelValue\', {})">Clicks</button>',
};

const Button = {
  props: ['disabled', 'loading'],
  emits: ['click'],
  template:
    '<button type="button" class="cursor-button" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
};

const RafRevealTransition = {
  template: '<div class="raf-reveal-transition-stub"><slot /></div>',
};

export const global = {
  stubs: {
    Select,
    BigSlider,
    ColorInput,
    Switch,
    ShadowDirectionGroup,
    CursorClickEffectsPanel,
    Button,
    RafRevealTransition,
  },
};

const asset = (id: string, label = id) => ({
  id,
  label,
  url: `project-media://cursor/pack/${id}`,
  format: 'svg' as const,
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 4, y: 5 },
});

export const importedPack = (id: string, name: string, ids = ['default', 'pointer']): CursorPackDescriptor => ({
  id,
  name,
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: ids[0]!,
  cursors: ids.map((cursorId) => asset(cursorId, `${name} ${cursorId}`)),
  automaticMap: Object.fromEntries(ids.map((cursorId) => [cursorId, cursorId])),
});

export const mixedOriginalPack = (): CursorPackDescriptor => ({
  id: 'pack:mixed-original',
  name: 'Mixed original',
  source: 'imported',
  colorMode: 'original',
  defaultCursorId: 'png-default',
  cursors: [
    { ...asset('png-default'), format: 'png', tintable: false },
    { ...asset('tintable-svg'), tintable: true },
  ],
  automaticMap: { default: 'png-default', handpointing: 'tintable-svg' },
});

export const baseProps = (overrides: Partial<CursorPanelProps> = {}) => ({
  selection: {
    packId: MACOS_CURSOR_PACK.id,
    mode: 'automatic' as const,
    cursorId: null,
  },
  packs: orderedCursorPacks([importedPack('pack:zeta', 'Zeta'), importedPack('pack:alpha', 'Alpha')]),
  cursorSize: 24,
  cursorColor: '#000000',
  enableShadow: true,
  shadowBlur: 8,
  shadowColor: '#111111',
  shadowDirection: 'bottom-right' as const,
  motion: createDefaultCursorMotionSettings(),
  clickEffects: createDefaultCursorClickEffects(),
  autoHide: createDefaultCursorAutoHideSettings(),
  ...overrides,
});

export const mountPanel = (overrides: Parameters<typeof baseProps>[0] = {}) =>
  mount(CursorPanel, { props: baseProps(overrides), global });

export const cursorColorControl = (wrapper: ReturnType<typeof mountPanel>) =>
  wrapper.findAll('.cursor-color').find((control) => control.attributes('data-label') === 'Cursor Color');
