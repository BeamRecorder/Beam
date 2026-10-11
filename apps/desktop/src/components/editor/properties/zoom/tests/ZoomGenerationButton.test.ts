import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import Button from '~/ui/button/Button.vue';
import ZoomGenerationButton from '../ZoomGenerationButton.vue';
import type { ZoomGenerationButtonProps } from '../zoom-panel-types';

enableAutoUnmount(afterEach);
type Recording = NonNullable<ZoomGenerationButtonProps['editorData']>;
const recording = (available = true): Recording => ({
  sessionId: 'recording',
  cursor: { available, telemetry: [], events: [], catalog: {}, shapes: {}, missing: [] },
});
const create = (props: Partial<ZoomGenerationButtonProps> = {}) =>
  mount(ZoomGenerationButton, {
    attachTo: document.body,
    props: { canGenerate: false, hasAutomaticZooms: false, ...props },
  });
const tooltip = () => document.body.querySelector('[role="tooltip"]');
const messages = import.meta.glob('../../../../../i18n/*/editor.json', {
  eager: true,
  import: 'default',
}) as Record<string, { ZoomPanel: Record<string, string> }>;
const cases = [
  { editorData: undefined, key: 'autoZoomNoRecording' },
  { editorData: null, key: 'autoZoomNoRecording' },
  { editorData: { ...recording(), sessionId: '' }, key: 'autoZoomNoRecording' },
  { editorData: recording(false), key: 'autoZoomNoCursor' },
  { editorData: recording(), key: 'autoZoomNoClicks' },
  {
    editorData: {
      ...recording(),
      cursor: {
        ...recording().cursor,
        telemetry: [{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: 'move' as const }],
      },
    },
    key: 'autoZoomNoClicks',
  },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('automatic zoom unavailable explanation', () => {
  it.each(cases)('explains $key using the actual recording data', async ({ editorData, key }) => {
    const wrapper = create({ editorData });
    const action = wrapper.get('.zoom-generation-button');
    const reason = i18n.global.t(`ZoomPanel.${key}`);
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    expect(action.attributes('aria-description')).toBe(reason);
    expect(wrapper.get('button').attributes('aria-description')).toBe(reason);
    expect(tooltip()).toBeNull();
    await action.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(299);
    expect(tooltip()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(tooltip()?.textContent).toContain(reason);
    expect(tooltip()?.classList.contains('tooltip-error')).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('exposes the reason and a focusable disabled action to keyboard users', async () => {
    const wrapper = create({ editorData: recording(false), hasAutomaticZooms: true });
    const action = wrapper.get('.zoom-generation-button');
    expect(action.attributes('tabindex')).toBe('0');
    expect(action.attributes('aria-disabled')).toBe('true');
    expect(action.attributes('aria-label')).toBe('Regenerate Auto Zooms');
    (action.element as HTMLElement).focus();
    await vi.advanceTimersByTimeAsync(300);
    expect(document.activeElement).toBe(action.element);
    expect(tooltip()?.textContent).toContain('no cursor data');
    await action.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('click')).toBeUndefined();
    (action.element as HTMLElement).blur();
    await nextTick();
    expect(tooltip()).toBeNull();
  });

  it('closes on mouse leave and cancels a pending hover', async () => {
    const wrapper = create();
    const action = wrapper.get('.zoom-generation-button');
    await action.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(150);
    await action.trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(300);
    expect(tooltip()).toBeNull();
    await action.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    expect(tooltip()).not.toBeNull();
    await action.trigger('mouseleave');
    expect(tooltip()).toBeNull();
  });

  it('updates the reason and removes the hint and extra tab stop as data becomes available', async () => {
    const wrapper = create();
    const action = wrapper.get('.zoom-generation-button');
    await action.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    expect(tooltip()?.textContent).toContain('requires a Beam recording');
    await wrapper.setProps({ editorData: recording(false) });
    expect(tooltip()?.textContent).toContain('no cursor data');
    await wrapper.setProps({ editorData: recording() });
    expect(tooltip()?.textContent).toContain('no recorded clicks');
    await wrapper.setProps({ canGenerate: true });
    expect(tooltip()).toBeNull();
    expect(action.attributes('tabindex')).toBeUndefined();
    expect(action.attributes('role')).toBeUndefined();
    expect(action.attributes('aria-description')).toBeUndefined();
    expect(action.attributes('aria-disabled')).toBeUndefined();
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    await action.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    expect(tooltip()).toBeNull();
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('click')).toEqual([[]]);
  });

  it('keeps the regeneration action and blocks stale activation after becoming unavailable', async () => {
    const wrapper = create({ canGenerate: true, hasAutomaticZooms: true });
    expect(wrapper.get('button').text()).toBe('Regenerate Auto Zooms');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    await wrapper.setProps({ canGenerate: false, editorData: recording() });
    wrapper.getComponent(Button).vm.$emit('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    await wrapper.get('.zoom-generation-button').trigger('focusin');
    await vi.advanceTimersByTimeAsync(300);
    expect(tooltip()?.textContent).toContain('no recorded clicks');
  });

  it('disposes a pending hint when the inspector closes', async () => {
    const wrapper = create();
    await wrapper.get('.zoom-generation-button').trigger('mouseenter');
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(300);
    expect(tooltip()).toBeNull();
  });

  it.each(SUPPORTED_LOCALES)('renders all three translated explanations in %s', async (locale) => {
    const strings = messages[`../../../../../i18n/${locale}/editor.json`]!.ZoomPanel;
    const english = messages['../../../../../i18n/en/editor.json']!.ZoomPanel;
    await setCurrentLocale(locale);
    const wrapper = create();
    const action = wrapper.get('.zoom-generation-button');
    await action.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    for (const { editorData, key } of cases) {
      expect(strings[key]?.trim()).toBeTruthy();
      if (locale !== 'en') expect(strings[key]).not.toBe(english[key]);
      await wrapper.setProps({ editorData });
      expect(tooltip()?.textContent).toContain(strings[key]);
      expect(action.attributes('aria-description')).toBe(strings[key]);
    }
  });
});
