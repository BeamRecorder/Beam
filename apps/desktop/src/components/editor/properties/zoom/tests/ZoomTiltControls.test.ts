import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '@vue/compiler-sfc';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import { i18n, setCurrentLocale } from '~/i18n';
import BigSlider from '~/ui/slider/BigSlider.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import ZoomTiltControls from '../ZoomTiltControls.vue';
import ZoomTiltPreview from '../../../zoom/ZoomTiltPreview.vue';
import { ZOOM_TILT_PRESETS, applyZoomTiltPreset } from '@beam/engine/zoom/zoom-tilt-presets';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

enableAutoUnmount(afterEach);
const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 0,
  endMs: 1000,
  depth: 2,
  focus: { cx: 0.5, cy: 0.5 },
  mode: 'manual',
  projection: '3d',
};
const controls = (value: ZoomElement = zoom) => mount(ZoomTiltControls, { props: { zoom: value } });

describe('compact 3D tilt controls', () => {
  it('offers six small SVG thumbnails and an accessible Custom control with closed sliders', () => {
    const wrapper = controls();
    expect(wrapper.findAll('[data-tilt-preset]')).toHaveLength(6);
    expect(wrapper.findAllComponents(ZoomTiltPreview)).toHaveLength(6);
    expect(wrapper.findAll('.zoom-tilt-presets button')).toHaveLength(7);
    expect(wrapper.findAllComponents(BigSlider)).toHaveLength(0);
    expect(
      wrapper.findAll('[data-tilt-preset]').every((button) => button.attributes('aria-label') && button.text() === ''),
    ).toBe(true);
    expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(wrapper.get('.custom-tilt').attributes('aria-label')).toBe('Custom');
  });

  it.each(ZOOM_TILT_PRESETS)('applies $id and collapses Advanced', async (preset) => {
    const wrapper = controls({
      ...zoom,
      tiltPreset: 'custom',
      tiltIntensity: 0.8,
    });
    expect(wrapper.find('.zoom-tilt-advanced').exists()).toBe(true);
    await wrapper.get(`[data-tilt-preset="${preset.id}"]`).trigger('click');
    const emitted = wrapper.emitted('update')!.at(-1)![0] as ZoomElement;
    expect(emitted).toEqual(applyZoomTiltPreset({ ...zoom, tiltPreset: 'custom', tiltIntensity: 0.8 }, preset));
    await wrapper.setProps({ zoom: emitted });
    expect(wrapper.find('.zoom-tilt-advanced').exists()).toBe(false);
    expect(wrapper.get(`[data-tilt-preset="${preset.id}"]`).attributes('aria-pressed')).toBe('true');
  });

  it('opens Advanced from a preset without changing it, then opens Custom with preserved controls', async () => {
    const value = applyZoomTiltPreset(zoom, ZOOM_TILT_PRESETS[2]!);
    const wrapper = controls(value);
    await wrapper.getComponent(AdvancedButton).get('button').trigger('click');
    expect(wrapper.findAllComponents(BigSlider)).toHaveLength(3);
    expect(wrapper.emitted('update')).toBeUndefined();
    await wrapper.getComponent(AdvancedButton).get('button').trigger('click');
    expect(wrapper.find('.zoom-tilt-advanced').exists()).toBe(false);
    await wrapper.get('.custom-tilt').trigger('click');
    expect(wrapper.findAllComponents(BigSlider)).toHaveLength(3);
    expect(wrapper.emitted('update')!.at(-1)).toEqual([{ ...value, tiltPreset: 'custom' }]);
  });

  it('opens custom sliders on selection/restoration and allows closing and reopening them', async () => {
    const wrapper = controls();
    await wrapper.setProps({
      zoom: {
        ...zoom,
        id: 'other',
        tiltPreset: 'custom',
        tiltHorizontal: -0.2,
        tiltVertical: 0.8,
      },
    });
    expect(wrapper.findAllComponents(BigSlider)).toHaveLength(3);
    await wrapper.getComponent(AdvancedButton).get('button').trigger('click');
    expect(wrapper.find('.zoom-tilt-advanced').exists()).toBe(false);
    await wrapper.get('.custom-tilt').trigger('click');
    expect(wrapper.find('.zoom-tilt-advanced').exists()).toBe(true);
    await wrapper.setProps({
      zoom: applyZoomTiltPreset({ ...zoom, id: 'third' }, ZOOM_TILT_PRESETS[0]!),
    });
    expect(wrapper.find('.zoom-tilt-advanced').exists()).toBe(false);
  });

  it.each([-200, 35, 200])('clamps intensity edits at %s and marks the result Custom', (value) => {
    const wrapper = controls({ ...zoom, tiltPreset: 'custom' });
    wrapper.findAllComponents(BigSlider)[0]!.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update')!.at(-1)).toEqual([
      {
        ...zoom,
        tiltPreset: 'custom',
        tiltIntensity: Math.max(0, Math.min(1, value / 100)),
      },
    ]);
  });

  it.each(['tiltHorizontal', 'tiltVertical'] as const)(
    'clamps signed %s edits and formats negative, zero and positive values',
    (axis) => {
      const wrapper = controls({ ...zoom, tiltPreset: 'custom' });
      const slider = wrapper.findAllComponents(BigSlider)[axis === 'tiltHorizontal' ? 1 : 2]!;
      for (const value of [-200, 25, 200]) {
        slider.vm.$emit('update:modelValue', value);
        expect(wrapper.emitted('update')!.at(-1)).toEqual([
          {
            ...zoom,
            tiltPreset: 'custom',
            [axis]: Math.max(-1, Math.min(1, value / 100)),
          },
        ]);
      }
      const format = slider.props('formatValue') as (value: number) => string;
      expect([-50, 0, 25].map(format)).toEqual(['-50%', '0%', '+25%']);
      const formatIntensity = wrapper.findAllComponents(BigSlider)[0]!.props('formatValue') as (
        value: number,
      ) => string;
      expect(formatIntensity(42)).toBe('42%');
    },
  );

  it('uses distinct Advanced panel IDs for multiple controls', async () => {
    const host = mount(
      defineComponent({
        setup: () => () => [
          h(ZoomTiltControls, { zoom: { ...zoom, tiltPreset: 'custom' } }),
          h(ZoomTiltControls, { zoom: { ...zoom, tiltPreset: 'custom' } }),
        ],
      }),
    );
    const [first, second] = host.findAllComponents(ZoomTiltControls);
    expect(first!.getComponent(AdvancedButton).props('controls')).not.toBe(
      second!.getComponent(AdvancedButton).props('controls'),
    );
    expect(first!.get('.zoom-tilt-advanced').attributes('id')).toBe(
      first!.getComponent(AdvancedButton).props('controls'),
    );
  });

  it('draws six distinct perspectives with the outline above the illustration content', () => {
    const wrapper = controls();
    const previews = wrapper.findAllComponents(ZoomTiltPreview);
    expect(new Set(previews.map((preview) => preview.get('path.screen').attributes('d'))).size).toBe(6);
    for (const preview of previews) {
      expect(preview.get('svg').attributes('aria-hidden')).toBe('true');
      expect(preview.findAll('path').at(-1)!.classes()).toContain('outline');
      expect(preview.get('path.outline').attributes('d')).toBe(preview.get('path.screen').attributes('d'));
    }
  });

  it('keeps thumbnails close to Clip layout size and maintains a visible unscaled border', () => {
    const style = parse(
      readFileSync(resolve(process.cwd(), 'apps/desktop/src/components/editor/zoom/ZoomTiltPreview.vue'), 'utf8'),
    ).descriptor.styles[0]!.content;
    expect(style).toContain('width: 34px');
    expect(style).toContain('height: 24px');
    expect(style).toContain('stroke: var(--text-secondary)');
    expect(style).toContain('vector-effect: non-scaling-stroke');
    expect(style).toContain('stroke-width: 1.25');
  });

  it.each(SUPPORTED_LOCALES)('names every preset in %s', async (locale) => {
    await setCurrentLocale(locale);
    expect(i18n.global.t('ZoomPanel.projectionDesc')).toMatch(/^[^\n]+[.。।]\n\S/);
    const wrapper = controls();
    for (const preset of ZOOM_TILT_PRESETS) {
      expect(i18n.global.te(`ZoomPanel.${preset.labelKey}`, locale)).toBe(true);
      expect(wrapper.get(`[data-tilt-preset="${preset.id}"]`).attributes('aria-label')).toBe(
        i18n.global.t(`ZoomPanel.${preset.labelKey}`),
      );
    }
  });
});
