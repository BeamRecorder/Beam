import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CursorPanel from '../CursorPanel.vue';
import { MACOS_CURSOR_PACK, orderedCursorPacks } from '../cursor-packs';
import type { CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import {
  createDefaultCursorAutoHideSettings,
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
  type CursorAutoHideSettings,
} from '~/api/types/cursor-settings';
import type { CursorClickEffects } from '~/api/types/cursor-settings';
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
  props: ['label', 'modelValue', 'defaultValue', 'min', 'max', 'step'],
  emits: ['update:modelValue'],
  template:
    '<button type="button" class="cursor-slider" :data-label="label" :data-model-value="modelValue" :data-default-value="defaultValue" :data-min="min" :data-max="max" :data-step="step" @click="$emit(\'update:modelValue\', 30)">Slider</button>',
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

const BlurRevealTransition = {
  template: '<div class="blur-reveal-transition-stub"><slot /></div>',
};

const global = {
  stubs: {
    Select,
    BigSlider,
    ColorInput,
    Switch,
    ShadowDirectionGroup,
    CursorClickEffectsPanel,
    Button,
    BlurRevealTransition,
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

const importedPack = (id: string, name: string, ids = ['default', 'pointer']): CursorPackDescriptor => ({
  id,
  name,
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: ids[0]!,
  cursors: ids.map((cursorId) => asset(cursorId, `${name} ${cursorId}`)),
  automaticMap: Object.fromEntries(ids.map((cursorId) => [cursorId, cursorId])),
});

const mixedOriginalPack = (): CursorPackDescriptor => ({
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

const baseProps = (
  overrides: Partial<{
    selection: CursorSelection;
    packs: CursorPackDescriptor[];
    cursorSize: number;
    cursorColor: string;
    enableShadow: boolean;
    clickEffects: CursorClickEffects;
    autoHide: CursorAutoHideSettings;
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
  autoHide: createDefaultCursorAutoHideSettings(),
  ...overrides,
});

const mountPanel = (overrides: Parameters<typeof baseProps>[0] = {}) =>
  mount(CursorPanel, { props: baseProps(overrides), global });

const cursorColorControl = (wrapper: ReturnType<typeof mountPanel>) =>
  wrapper.findAll('.cursor-color').find((control) => control.attributes('data-label') === 'Cursor Color');

describe('CursorPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    capture.pickCursorPackImport.mockReset();
    capture.openCursorPackDiscovery.mockReset();
  });

  it('keeps macOS first, exposes the selected pack and starts with both Advanced panels closed', () => {
    const packs = orderedCursorPacks([importedPack('pack:zeta', 'Zeta'), importedPack('pack:alpha', 'Alpha')]);
    const wrapper = mountPanel({ packs });

    const packSelect = wrapper.findAll('.cursor-select')[0]!;
    expect(packSelect.attributes('data-model-value')).toBe(MACOS_CURSOR_PACK.id);
    expect(packSelect.text().startsWith('macOS')).toBe(true);
    expect(packSelect.text()).toContain('Alpha');
    expect(packSelect.text()).toContain('Zeta');

    const toggles = wrapper.findAll('.advanced-toggle');
    expect(toggles).toHaveLength(2);
    expect(toggles[0]!.attributes('aria-expanded')).toBe('false');
    expect(toggles[0]!.attributes('aria-controls')).toBe('cursor-advanced-panel');
    expect(toggles[1]!.attributes('aria-expanded')).toBe('false');
    expect(toggles[1]!.attributes('aria-controls')).toBe('click-effects-advanced-panel');
    expect(wrapper.find('#cursor-advanced-panel').exists()).toBe(false);
    expect(wrapper.find('#click-effects-advanced-panel').exists()).toBe(false);
    expect(wrapper.find('.cursor-size-control').exists()).toBe(true);
  });

  it('keeps presentation controls visible and separates cursor advanced from click effects advanced', async () => {
    const wrapper = mountPanel();
    const [cursorTrigger, clickTrigger] = wrapper.findAll('.advanced-toggle');

    expect(wrapper.find('.cursor-size-control').exists()).toBe(true);
    expect(wrapper.find('.motion-options').exists()).toBe(true);
    expect(wrapper.find('.cursor-color').exists()).toBe(true);
    expect(wrapper.find('.cursor-switch').exists()).toBe(true);
    expect(wrapper.find('#cursor-advanced-panel').exists()).toBe(false);
    expect(wrapper.find('#click-effects-advanced-panel').exists()).toBe(false);

    // Open cursor advanced
    await cursorTrigger!.trigger('click');
    await flushPromises();

    expect(cursorTrigger!.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('#cursor-advanced-panel')).toBeDefined();
    expect(wrapper.get('#cursor-advanced-panel').element.closest('.blur-reveal-transition-stub')).not.toBeNull();
    expect(wrapper.get('#cursor-advanced-panel .cursor-select')).toBeDefined();
    expect(wrapper.find('#cursor-advanced-panel .click-effects-stub').exists()).toBe(false);

    // Open click effects advanced
    await clickTrigger!.trigger('click');
    await flushPromises();

    expect(clickTrigger!.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('#click-effects-advanced-panel')).toBeDefined();
    expect(wrapper.get('#click-effects-advanced-panel').element.closest('.blur-reveal-transition-stub')).not.toBeNull();
    expect(wrapper.get('#click-effects-advanced-panel .click-effects-stub')).toBeDefined();
    expect(wrapper.find('#click-effects-advanced-panel .cursor-select').exists()).toBe(false);
  });

  it('keeps auto-hide disabled by default and reveals its delay slider only when enabled', async () => {
    const wrapper = mountPanel();

    expect(wrapper.get('.cursor-switch').attributes('data-model-value')).toBe('false');
    expect(wrapper.findAll('.cursor-slider').some((slider) => slider.attributes('data-label') === 'Hide after')).toBe(
      false,
    );

    await wrapper.get('.cursor-switch').trigger('click');
    expect(wrapper.emitted('update:autoHide')).toEqual([[{ enabled: true, delaySeconds: 2, fadeDurationMs: 250 }]]);

    await wrapper.setProps({ autoHide: { enabled: true, delaySeconds: 2, fadeDurationMs: 250 } });
    const delaySlider = wrapper
      .findAll('.cursor-slider')
      .find((slider) => slider.attributes('data-label') === 'Hide after');
    expect(delaySlider).toBeDefined();
    expect(delaySlider?.attributes('data-model-value')).toBe('2');

    await delaySlider!.trigger('click');
    expect(wrapper.emitted('update:autoHide')?.at(-1)).toEqual([
      { enabled: true, delaySeconds: 10, fadeDurationMs: 250 },
    ]);
    await wrapper.setProps({ autoHide: { enabled: true, delaySeconds: 10, fadeDurationMs: 250 } });

    const fadeSlider = wrapper
      .findAll('.cursor-slider')
      .find((slider) => slider.attributes('data-model-value') === '250');
    expect(fadeSlider).toBeDefined();
    expect(fadeSlider?.attributes('data-default-value')).toBe('250');
    expect(fadeSlider?.attributes('data-min')).toBe('0');
    expect(fadeSlider?.attributes('data-max')).toBe('1000');
    expect(fadeSlider?.attributes('data-step')).toBe('50');

    await fadeSlider!.trigger('click');
    expect(wrapper.emitted('update:autoHide')?.at(-1)).toEqual([
      { enabled: true, delaySeconds: 10, fadeDurationMs: 30 },
    ]);
  });

  it.each([
    [
      'tintable SVG selected automatically',
      MACOS_CURSOR_PACK,
      { packId: MACOS_CURSOR_PACK.id, mode: 'automatic', cursorId: null },
    ],
    [
      'tintable SVG selected by fixed cursor id',
      importedPack('pack:svg', 'Tintable SVG'),
      { packId: 'pack:svg', mode: 'fixed', cursorId: 'default' },
    ],
    [
      'explicitly tintable SVG selected by fixed cursor id in an original mixed pack',
      mixedOriginalPack(),
      { packId: 'pack:mixed-original', mode: 'fixed', cursorId: 'tintable-svg' },
    ],
  ] as const)('shows the cursor ColorInput for %s', (_label, pack, selection) => {
    const wrapper = mountPanel({ packs: [MACOS_CURSOR_PACK, pack], selection });

    expect(cursorColorControl(wrapper)?.exists()).toBe(true);
    expect(cursorColorControl(wrapper)?.attributes('disabled')).toBeUndefined();
  });

  it.each([
    [
      'a PNG cursor selected automatically',
      (() => {
        const pack = importedPack('pack:png', 'PNG');
        return { ...pack, cursors: pack.cursors.map((cursor) => ({ ...cursor, format: 'png' as const })) };
      })(),
      { packId: 'pack:png', mode: 'automatic', cursorId: null },
    ],
    [
      'an original-colour SVG selected by fixed cursor id',
      { ...importedPack('pack:original', 'Original'), colorMode: 'original' as const },
      { packId: 'pack:original', mode: 'fixed', cursorId: 'default' },
    ],
  ] as const)(
    'hides the cursor ColorInput for %s instead of rendering a disabled control',
    (_label, pack, selection) => {
      const wrapper = mountPanel({ packs: [MACOS_CURSOR_PACK, pack], selection });

      expect(cursorColorControl(wrapper)).toBeUndefined();
    },
  );

  it('hides the cursor ColorInput for the fixed macOS beachball asset', () => {
    const wrapper = mountPanel({
      packs: [MACOS_CURSOR_PACK],
      selection: { packId: MACOS_CURSOR_PACK.id, mode: 'fixed', cursorId: 'beachball' },
    });

    expect(cursorColorControl(wrapper)).toBeUndefined();
  });

  it('previews fixed cursor selection and commits it only when selected', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('.advanced-toggle')[0]!.trigger('click');
    await flushPromises();

    const cursorSelect = wrapper.findAll('#cursor-advanced-panel .cursor-select')[0]!;
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

  it.each([
    ['Single Ring', 'single'],
    ['Double Wave', 'double'],
    ['Burst', 'solid'],
  ] as const)('applies the global %s shape without changing per-button activation', async (label, style) => {
    const clickEffects: CursorClickEffects = {
      left: {
        ...createDefaultCursorClickEffects().left,
        springEnabled: false,
        springIntensity: 17,
        rippleEnabled: false,
      },
      right: {
        ...createDefaultCursorClickEffects().right,
        springEnabled: true,
        springIntensity: 83,
        rippleEnabled: true,
      },
    };
    const wrapper = mountPanel({ clickEffects });
    const preset = wrapper.get(`button[aria-label="${label}"]`);

    await preset.trigger('click');

    expect(wrapper.emitted('update:clickEffects')?.at(-1)?.[0]).toEqual({
      left: { ...clickEffects.left, rippleStyle: style },
      right: { ...clickEffects.right, rippleStyle: style },
    });
    expect(wrapper.find('button[aria-label="None"]').exists()).toBe(false);
  });

  it('places both Advanced controls on their section title rows', () => {
    const wrapper = mountPanel();
    const advancedTitleRows = wrapper
      .findAll('.advanced-toggle')
      .map((toggle) => toggle.element.closest('.pack-heading, .section-control-heading, .section-heading, .prop-row'));

    expect(advancedTitleRows).toHaveLength(2);
    for (const row of advancedTitleRows) {
      expect(row?.textContent?.replace(/Advanced/g, '').trim()).not.toBe('');
    }
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
    await wrapper.findAll('.advanced-toggle')[0]!.trigger('click');
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
    expect(wrapper.emitted('update:autoHide')).toContainEqual([createDefaultCursorAutoHideSettings()]);
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
