import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CursorPanel from '../CursorPanel.vue';
import { MACOS_CURSOR_PACK } from '../cursor-packs';
import {
  createDefaultCursorAutoHideSettings,
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
  cursorMotionPreset,
} from '@beam/engine/capture/cursor-settings';
import { useToastStore } from '~/ui/toast/toastStore';
import {
  Select,
  global,
  importedPack,
  mixedOriginalPack,
  baseProps,
  mountPanel,
  cursorColorControl,
} from './cursor-panel-test-helpers';
import { focusEditorProperty } from '../../../search/focus-editor-property';

const capture = vi.hoisted(() => ({
  pickCursorPackImport: vi.fn(),
  openCursorPackDiscovery: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

describe('CursorPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    capture.pickCursorPackImport.mockReset();
    capture.openCursorPackDiscovery.mockReset();
  });

  it('uses flat inspector accordions and opens only Appearance by default', async () => {
    const wrapper = mountPanel();
    const sections = wrapper.findAll('.accordion');
    expect(sections.map((section) => section.attributes('data-cursor-section'))).toEqual([
      'appearance',
      'shadow',
      'motion',
      'visibility',
    ]);
    expect(sections.map((section) => section.get('.accordion-trigger').attributes('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(wrapper.find('[aria-controls="click-effects-advanced-panel"]').exists()).toBe(false);
    expect(wrapper.findAll('.advanced-toggle')).toHaveLength(2);
    expect(wrapper.find('.accordion-actions').exists()).toBe(false);
    for (const section of sections) {
      expect(section.find('.accordion-heading .cursor-switch').exists()).toBe(false);
      expect(section.find('.accordion-heading .advanced-toggle').exists()).toBe(false);
    }
    await sections[0]!.get('.accordion-trigger').trigger('click');
    expect(sections[0]!.get('.accordion-content').attributes('inert')).toBeDefined();
    await sections[0]!.get('.accordion-trigger').trigger('click');
    expect(sections[0]!.get('.cursor-size-control').attributes('data-model-value')).toBe('24');
    expect(wrapper.emitted('update:selection')).toBeUndefined();
  });
  it('keeps Advanced beside its control inside each accordion without changing section visibility', async () => {
    const wrapper = mountPanel();
    for (const name of ['appearance', 'motion']) {
      const section = wrapper.get(`[data-cursor-section="${name}"]`);
      const trigger = section.get('.accordion-trigger');
      if (trigger.attributes('aria-expanded') === 'false') await trigger.trigger('click');
      expect(section.find('.accordion-content .advanced-toggle').exists()).toBe(true);
      expect(
        section.get('.advanced-toggle').element.closest('.pack-heading, .section-control-heading')?.textContent,
      ).toContain(name === 'appearance' ? 'Cursor pack' : 'Motion Preset');
      await section.get('.advanced-toggle').trigger('click');
      expect(trigger.attributes('aria-expanded')).toBe('true');
      expect(section.get('.advanced-toggle').attributes('aria-expanded')).toBe('true');
      await section.get('.advanced-toggle').trigger('click');
      expect(trigger.attributes('aria-expanded')).toBe('true');
      expect(section.get('.advanced-toggle').attributes('aria-expanded')).toBe('false');
    }
    expect(wrapper.emitted('update:selection')).toBeUndefined();
    expect(wrapper.emitted('update:motion')).toBeUndefined();
  });

  it('keeps Shadow and Auto-hide switches in the retained, inert accordion contents', async () => {
    const wrapper = mountPanel({ enableShadow: false });
    for (const [name, event] of [
      ['shadow', 'update:enableShadow'],
      ['visibility', 'update:autoHide'],
    ] as const) {
      const section = wrapper.get(`[data-cursor-section="${name}"]`);
      expect(section.get('.accordion-content').attributes('inert')).toBeDefined();
      expect(section.find('.accordion-heading .cursor-switch').exists()).toBe(false);
      const control = section.get('.accordion-content .prop-row .cursor-switch');
      expect(control.attributes('data-model-value')).toBe('false');
      await section.get('.accordion-trigger').trigger('click');
      await control.trigger('click');
      expect(wrapper.emitted(event)).toHaveLength(1);
      expect(section.get('.accordion-trigger').attributes('aria-expanded')).toBe('true');
      await section.get('.accordion-trigger').trigger('click');
      expect(section.get('.accordion-content').attributes('inert')).toBeDefined();
      expect(wrapper.emitted(event)).toHaveLength(1);
    }
  });

  it('forwards independent click records without a global selector', async () => {
    const wrapper = mountPanel();
    await wrapper.get('.click-effects-stub').trigger('click');
    expect(wrapper.emitted('update:clickEffects')?.at(-1)).toEqual([{}]);
    expect(wrapper.find('[aria-label="Ripple style"]').exists()).toBe(false);
  });

  it('keeps motion sliders behind Advanced and opens Custom without discarding its values', async () => {
    const motion = { ...createDefaultCursorMotionSettings(), smoothing: 0.62, springMassMultiplier: 1.2 };
    const wrapper = mountPanel({ motion });
    await wrapper.get('[data-cursor-section="motion"] .accordion-trigger').trigger('click');
    const preset = wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes('aria-label') === 'Motion Preset')!;
    expect(wrapper.find('#cursor-motion-advanced-panel').exists()).toBe(false);

    preset.vm.$emit('update:modelValue', 'custom');
    await flushPromises();
    expect(wrapper.emitted('update:motion')?.at(-1)).toEqual([{ ...motion, preset: 'custom' }]);
    expect(wrapper.find('#cursor-motion-advanced-panel').exists()).toBe(true);

    for (const [label, field, value] of [
      ['Cursor Smoothing', 'smoothing', 0.3],
      ['Spring Mass', 'springMassMultiplier', 30],
      ['Motion Blur', 'motionBlur', 0.3],
    ] as const) {
      const slider = wrapper.findAll('.cursor-slider').find((control) => control.attributes('data-label') === label)!;
      await slider.trigger('click');
      expect(wrapper.emitted('update:motion')?.at(-1)).toEqual([{ ...motion, preset: 'custom', [field]: value }]);
    }
    preset.vm.$emit('update:modelValue', 'smooth');
    await flushPromises();
    expect(wrapper.emitted('update:motion')?.at(-1)).toEqual([cursorMotionPreset('smooth')]);
    expect(wrapper.find('#cursor-motion-advanced-panel').exists()).toBe(false);

    await wrapper.setProps({ motion: { ...motion, preset: 'custom' } });
    expect(wrapper.get('[aria-controls="cursor-motion-advanced-panel"]').attributes('aria-expanded')).toBe('true');
    await wrapper.get('[aria-controls="cursor-motion-advanced-panel"]').trigger('click');
    expect(wrapper.find('#cursor-motion-advanced-panel').exists()).toBe(false);
    await wrapper.setProps({ motion: cursorMotionPreset('focused') });
    expect(wrapper.find('#cursor-motion-advanced-panel').exists()).toBe(false);
  });

  it('opens an existing custom motion on mount and forwards appearance edits', async () => {
    const wrapper = mountPanel({ motion: { ...createDefaultCursorMotionSettings(), preset: 'custom' } });
    expect(wrapper.find('#cursor-motion-advanced-panel').exists()).toBe(true);
    await wrapper.get('.cursor-size-control').trigger('click');
    await cursorColorControl(wrapper)!.trigger('click');
    await wrapper.get('#cursor-shadow-options .cursor-slider').trigger('click');
    await wrapper.get('#cursor-shadow-options .cursor-color').trigger('click');
    await wrapper.get('.shadow-direction').trigger('click');
    await wrapper.get('.shadow-options .cursor-switch').trigger('click');
    expect(wrapper.emitted('update:cursorSize')).toEqual([[30]]);
    expect(wrapper.emitted('update:cursorColor')).toEqual([['#fff']]);
    expect(wrapper.emitted('update:shadowBlur')).toEqual([[30]]);
    expect(wrapper.emitted('update:shadowColor')).toEqual([['#fff']]);
    expect(wrapper.emitted('update:shadowDirection')).toEqual([['top-left']]);
    expect(wrapper.emitted('update:enableShadow')).toEqual([[false]]);
  });

  it('lets Spotlight focus a visible shadow property without editing the cursor', async () => {
    const wrapper = mount(CursorPanel, {
      props: baseProps(),
      global,
      attrs: { class: 'properties-island' },
      attachTo: document.body,
    });
    try {
      expect(wrapper.find('#cursor-shadow-options').exists()).toBe(true);
      const pending = focusEditorProperty('Shadow Blur');
      await flushPromises();
      expect(await pending).toBe(true);
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Shadow Blur');
      expect(wrapper.emitted('update:shadowBlur')).toBeUndefined();
      expect(wrapper.emitted('update:motion')).toBeUndefined();
      expect(wrapper.emitted('update:enableShadow')).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps auto-hide disabled by default and reveals its delay slider only when enabled', async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-cursor-section="visibility"] .accordion-trigger').trigger('click');
    const autoHideSwitch = wrapper
      .findAll('.cursor-switch')
      .find((control) => control.attributes('aria-label') === 'Auto-hide cursor')!;
    expect(autoHideSwitch.attributes('data-model-value')).toBe('false');
    expect(wrapper.findAll('.cursor-slider').some((slider) => slider.attributes('data-label') === 'Hide after')).toBe(
      false,
    );

    await autoHideSwitch.trigger('click');
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

  it('enables the stop spring by default and preserves its strength when switched off', async () => {
    const wrapper = mountPanel();
    await wrapper.get('[data-cursor-section="motion"] .accordion-trigger').trigger('click');
    await wrapper.get('[aria-controls="cursor-motion-advanced-panel"]').trigger('click');
    const stopSwitch = wrapper.get('[aria-label="Spring when stopping"]');
    expect(stopSwitch.attributes('data-model-value')).toBe('true');
    const strengthSlider = () =>
      wrapper.findAll('.cursor-slider').find((slider) => slider.attributes('data-label') === 'Spring strength');
    expect(strengthSlider()?.attributes('data-model-value')).toBe('0.45');

    await stopSwitch.trigger('click');
    expect(wrapper.emitted('update:motion')?.at(-1)?.[0]).toMatchObject({
      preset: 'custom',
      stopSpringEnabled: false,
      stopSpringStrength: 0.45,
    });
    await wrapper.setProps({ motion: { ...createDefaultCursorMotionSettings(), stopSpringEnabled: false } });
    expect(strengthSlider()).toBeUndefined();

    await wrapper.setProps({ motion: { ...createDefaultCursorMotionSettings(), stopSpringStrength: 0.6 } });
    await strengthSlider()!.trigger('click');
    expect(wrapper.emitted('update:motion')?.at(-1)?.[0]).toMatchObject({
      preset: 'custom',
      stopSpringEnabled: true,
      stopSpringStrength: 0.3,
    });
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
