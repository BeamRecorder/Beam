import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CursorPanel from '../CursorPanel.vue';
import { MACOS_CURSOR_PACK, orderedCursorPacks } from '../cursor-packs';
import type { CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import { createDefaultCursorClickEffects, createDefaultCursorMotionSettings } from '~/api/types/cursor-settings';
import { useToastStore } from '~/ui/toast/toastStore';

const capture = vi.hoisted(() => ({
  pickCursorPackImport: vi.fn(),
  openCursorPackDiscovery: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

const Select = {
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
  emits: ['update:modelValue'],
  template: '<button type="button" class="cursor-slider" @click="$emit(\'update:modelValue\', 30)">Slider</button>',
};

const ColorInput = {
  props: ['disabled'],
  emits: ['update:modelValue'],
  template:
    '<button type="button" class="cursor-color" :disabled="disabled" @click="$emit(\'update:modelValue\', \'#fff\')">Color</button>',
};

const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<button type="button" class="cursor-switch" @click="$emit(\'update:modelValue\', !modelValue)">Switch</button>',
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

const global = {
  stubs: { Select, BigSlider, ColorInput, Switch, ShadowDirectionGroup, CursorClickEffectsPanel, Button },
};

const asset = (id: string, label = id) => ({
  id,
  label,
  url: `project-media://cursor/pack/${id}`,
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 4, y: 5 },
});

const importedPack = (id: string, name: string, ids = ['default', 'pointer']): CursorPackDescriptor => ({
  id,
  name,
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: ids[0]!,
  cursors: ids.map((cursorId) => asset(cursorId, `${name} ${cursorId}`)),
  automaticMap: Object.fromEntries(ids.map((cursorId) => [cursorId, cursorId])),
});

const baseProps = (
  overrides: Partial<{
    selection: CursorSelection;
    packs: CursorPackDescriptor[];
    cursorSize: number;
    cursorColor: string;
    enableShadow: boolean;
  }> = {},
) => ({
  selection: { packId: MACOS_CURSOR_PACK.id, mode: 'automatic' as const, cursorId: null },
  packs: orderedCursorPacks([importedPack('pack:zeta', 'Zeta'), importedPack('pack:alpha', 'Alpha')]),
  cursorSize: 24,
  cursorColor: '#000000',
  enableShadow: true,
  shadowBlur: 8,
  shadowColor: '#111111',
  shadowDirection: 'bottom-right' as const,
  motion: createDefaultCursorMotionSettings(),
  clickEffects: createDefaultCursorClickEffects(),
  ...overrides,
});

const mountPanel = (overrides: Parameters<typeof baseProps>[0] = {}) =>
  mount(CursorPanel, { props: baseProps(overrides), global });

describe('CursorPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    capture.pickCursorPackImport.mockReset();
    capture.openCursorPackDiscovery.mockReset();
  });

  it('keeps macOS first, exposes the selected pack and starts with Advanced closed', () => {
    const packs = orderedCursorPacks([importedPack('pack:zeta', 'Zeta'), importedPack('pack:alpha', 'Alpha')]);
    const wrapper = mountPanel({ packs });

    const packSelect = wrapper.findAll('.cursor-select')[0]!;
    expect(packSelect.attributes('data-model-value')).toBe(MACOS_CURSOR_PACK.id);
    expect(packSelect.text().startsWith('macOS')).toBe(true);
    expect(packSelect.text()).toContain('Alpha');
    expect(packSelect.text()).toContain('Zeta');

    const trigger = wrapper.get('.advanced-toggle');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('#cursor-advanced-panel').exists()).toBe(false);
    expect(wrapper.find('.cursor-size-control').exists()).toBe(true);
  });

  it('keeps presentation controls visible and limits Advanced to cursor style and clicks', async () => {
    const wrapper = mountPanel();
    const trigger = wrapper.get('.advanced-toggle');

    expect(wrapper.find('.cursor-size-control').exists()).toBe(true);
    expect(wrapper.find('.motion-options').exists()).toBe(true);
    expect(wrapper.find('.cursor-color').exists()).toBe(true);
    expect(wrapper.find('.cursor-switch').exists()).toBe(true);
    expect(wrapper.find('#cursor-advanced-panel').exists()).toBe(false);

    await trigger.trigger('click');
    await flushPromises();

    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(trigger.attributes('aria-controls')).toBe('cursor-advanced-panel');
    expect(wrapper.get('#cursor-advanced-panel')).toBeDefined();
    expect(wrapper.get('.advanced-options .cursor-select')).toBeDefined();
    expect(wrapper.get('.advanced-options .click-effects-stub')).toBeDefined();
    expect(wrapper.find('.advanced-options .cursor-slider').exists()).toBe(false);
    expect(wrapper.find('.advanced-options .cursor-switch').exists()).toBe(false);
    expect(wrapper.find('.advanced-options .cursor-color').exists()).toBe(false);
    expect(wrapper.find('.advanced-options .motion-options').exists()).toBe(false);
    expect(wrapper.get('.cursor-color').attributes('disabled')).toBeUndefined();
  });

  it('previews fixed cursor selection and commits it only when selected', async () => {
    const wrapper = mountPanel();
    await wrapper.get('.advanced-toggle').trigger('click');
    await flushPromises();

    const cursorSelect = wrapper.findAll('.advanced-options .cursor-select')[0]!;
    await cursorSelect.trigger('mouseenter');
    await cursorSelect.trigger('mouseleave');
    await cursorSelect.trigger('focus');
    await cursorSelect.trigger('blur');

    const preview = wrapper.emitted('preview:selection') ?? [];
    expect(preview[0]?.[0]).toMatchObject({ packId: MACOS_CURSOR_PACK.id, mode: 'fixed' });
    expect(preview.at(-1)).toEqual([null]);
    expect(wrapper.emitted('update:selection')).toBeUndefined();

    await cursorSelect.trigger('click');
    expect(wrapper.emitted('update:selection')?.at(-1)).toEqual([
      { packId: MACOS_CURSOR_PACK.id, mode: 'fixed', cursorId: expect.any(String) },
    ]);
  });

  it('resets only presentation settings and keeps the chosen pack', async () => {
    const selectedPack = importedPack('pack:custom', 'Custom');
    const wrapper = mountPanel({
      packs: [MACOS_CURSOR_PACK, selectedPack],
      selection: { packId: selectedPack.id, mode: 'fixed', cursorId: 'default' },
      cursorSize: 90,
      cursorColor: '#abcabc',
      enableShadow: false,
    });
    await wrapper.get('.advanced-toggle').trigger('click');
    await flushPromises();

    await wrapper.get('.reset-automatic-button').trigger('click');

    expect(wrapper.emitted('update:selection')).toContainEqual([
      { packId: selectedPack.id, mode: 'automatic', cursorId: null },
    ]);
    expect(wrapper.emitted('update:cursorSize')).toContainEqual([45]);
    expect(wrapper.emitted('update:cursorColor')).toContainEqual(['#000000']);
    expect(wrapper.emitted('update:enableShadow')).toContainEqual([true]);
    expect(wrapper.emitted('update:shadowBlur')).toContainEqual([6]);
    expect(wrapper.emitted('update:shadowColor')).toContainEqual(['#000000']);
    expect(wrapper.emitted('update:shadowDirection')).toContainEqual(['bottom']);
    expect(wrapper.emitted('update:clickEffects')).toContainEqual([createDefaultCursorClickEffects()]);
    expect(wrapper.emitted('update:motion')).toContainEqual([createDefaultCursorMotionSettings()]);
  });

  it('preserves a fixed cursor when the new pack has that role and falls back to automatic otherwise', async () => {
    const sameRole = importedPack('pack:same-role', 'Same role', ['default', 'pointer']);
    const differentRole = importedPack('pack:different-role', 'Different role', ['arrow']);
    const wrapper = mountPanel({
      packs: [MACOS_CURSOR_PACK, sameRole, differentRole],
      selection: { packId: MACOS_CURSOR_PACK.id, mode: 'fixed', cursorId: 'default' },
    });
    const packSelect = wrapper.findAll('.cursor-select')[0]!;

    // The stub chooses the second option, which is the same-role pack.
    await packSelect.trigger('click');
    expect(wrapper.emitted('update:selection')?.at(-1)).toEqual([
      { packId: sameRole.id, mode: 'fixed', cursorId: 'default' },
    ]);

    // A second panel verifies the fallback for a pack without that role.
    const fallbackWrapper = mountPanel({
      packs: [MACOS_CURSOR_PACK, differentRole],
      selection: { packId: MACOS_CURSOR_PACK.id, mode: 'fixed', cursorId: 'default' },
    });
    await fallbackWrapper.findAll('.cursor-select')[0]!.trigger('click');
    expect(wrapper.emitted('update:selection')?.at(-1)).toEqual([
      { packId: sameRole.id, mode: 'fixed', cursorId: 'default' },
    ]);
    expect(fallbackWrapper.emitted('update:selection')?.at(-1)).toEqual([
      { packId: differentRole.id, mode: 'automatic', cursorId: null },
    ]);
    fallbackWrapper.unmount();
  });

  it('imports a pack, selects it automatically and reports ignored animated roles', async () => {
    const imported = importedPack('pack:imported', 'Imported');
    capture.pickCursorPackImport.mockResolvedValue({
      pack: imported,
      importedCount: 3,
      ignoredAnimatedRoles: ['wait', 'progress'],
      duplicate: false,
    });
    const wrapper = mountPanel();

    const importButton = wrapper.get('.pack-import-button');
    expect(importButton.attributes('aria-label')).toBe('Import');
    expect(importButton.attributes('tooltip')).toBe('Import');
    expect(importButton.text()).toBe('');
    await importButton.trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:selection')).toEqual([[{ packId: imported.id, mode: 'automatic', cursorId: null }]]);
    expect(useToastStore().toasts.at(-1)).toMatchObject({ type: 'success' });
    expect(useToastStore().toasts.at(-1)?.message).toContain('3');
  });

  it('leaves state untouched when import is cancelled and reports import failures', async () => {
    capture.pickCursorPackImport.mockResolvedValueOnce(null);
    const wrapper = mountPanel();
    await wrapper.get('.pack-import-button').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:selection')).toBeUndefined();
    expect(useToastStore().toasts).toHaveLength(0);

    capture.pickCursorPackImport.mockRejectedValueOnce(new Error('Invalid cursor pack'));
    await wrapper.get('.pack-import-button').trigger('click');
    await flushPromises();
    expect(useToastStore().toasts.at(-1)).toMatchObject({ type: 'error', message: 'Invalid cursor pack' });
  });
});
