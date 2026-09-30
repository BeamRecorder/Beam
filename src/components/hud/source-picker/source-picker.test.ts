import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import SourcePicker from './SourcePicker.vue';
import SourcePickerApp from './SourcePickerApp.vue';
import SourceArtwork from './SourceArtwork.vue';
import { adjacentSourceId, filterSources } from './source-picker-model';
import { developmentSources } from './development-sources';
import type { SourcePickerState, SourcePickerSource } from '~/api/types/source-picker';

let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  delete window.capture;
  vi.useRealTimers();
  history.replaceState(null, '', '/');
});
const initial = (sources = developmentSources, development = true): SourcePickerState => ({
  kind: 'window',
  sources,
  development,
  selectedId: null,
  highlightedId: null,
  error: null,
});
const render = (state = initial()) => (wrapper = mount(SourcePicker, { props: { state }, attachTo: document.body }));
const nativeSource: SourcePickerSource = {
  id: 'sck:window:42',
  kind: 'window',
  name: 'Actual window',
  app: 'Actual app',
  detail: '1280 × 720',
  aspect: 16 / 9,
  thumbnail: 'data:image/jpeg;base64,aGVsbG8=',
  appIcon: 'data:image/png;base64,aGVsbG8=',
};

describe('source selection data', () => {
  it('filters by kind, title, application and dimensions without fabricating sources', () => {
    expect(filterSources(developmentSources, 'screen', '')).toHaveLength(3);
    expect(filterSources(developmentSources, 'window', '')).toHaveLength(21);
    expect(filterSources(developmentSources, 'window', ' FIGMA ')).toHaveLength(2);
    expect(filterSources(developmentSources, 'window', 'Untitled')).toHaveLength(2);
    expect(filterSources(developmentSources, 'screen', '1080')).toHaveLength(1);
    expect(filterSources(developmentSources, 'screen', 'Figma')).toHaveLength(0);
    expect(filterSources([], 'window', '')).toHaveLength(0);
    expect(filterSources([nativeSource], 'window', 'actual app')).toEqual([nativeSource]);
  });
  it('navigates empty lists, unknown IDs, wrapping and grid steps', () => {
    const sources = filterSources(developmentSources, 'screen', '');
    expect(adjacentSourceId([], null, 1)).toBeNull();
    expect(adjacentSourceId(sources, null, 1)).toBe(sources[0]!.id);
    expect(adjacentSourceId(sources, 'missing', -1)).toBe(sources[2]!.id);
    expect(adjacentSourceId(sources, sources[2]!.id, 1)).toBe(sources[0]!.id);
    expect(adjacentSourceId(sources, sources[0]!.id, -1)).toBe(sources[2]!.id);
    expect(adjacentSourceId(sources, sources[0]!.id, 7)).toBe(sources[1]!.id);
  });
  it('renders native thumbnails and unavailable sources through the same artwork boundary', async () => {
    wrapper = mount(SourceArtwork, { props: { source: nativeSource } });
    expect(wrapper.get('img').attributes('src')).toBe(nativeSource.thumbnail);
    expect(wrapper.find('.artwork').exists()).toBe(false);
    await wrapper.setProps({ source: { ...nativeSource, thumbnail: null, kind: 'screen' } });
    expect(wrapper.find('.unavailable').exists()).toBe(true);
    await wrapper.setProps({ source: { ...nativeSource, thumbnail: null } });
    expect(wrapper.find('.unavailable').exists()).toBe(true);
  });
});

describe('shared source picker', () => {
  it('uses real data without development artwork or a development label', () => {
    const picker = render(initial([nativeSource], false));
    expect(picker.findAll('.source-card')).toHaveLength(1);
    expect(picker.find('.development-badge').exists()).toBe(false);
    expect(picker.find('.development-note').exists()).toBe(false);
    expect(picker.find('.artwork').exists()).toBe(false);
    expect(picker.find('.app-icon').exists()).toBe(true);
    expect(picker.get('.picker-footer button').attributes('disabled')).toBeDefined();
  });
  it('uses development sources in the same layout and separates hover, selection and confirmation', async () => {
    const state = initial();
    const picker = render(state);
    expect(picker.findAll('.source-card')).toHaveLength(21);
    expect(picker.find('.development-badge').exists()).toBe(true);
    const first = picker.get('[data-source-id="demo-window-1"]');
    await first.trigger('mouseenter');
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'hover', id: 'demo-window-1' }]);
    await picker.setProps({ state: { ...state, highlightedId: 'demo-window-1' } });
    expect(first.attributes('aria-pressed')).toBe('false');
    await first.trigger('click');
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'select', id: 'demo-window-1' }]);
    await picker.setProps({ state: { ...state, highlightedId: 'demo-window-2', selectedId: 'demo-window-1' } });
    expect(first.attributes('aria-pressed')).toBe('true');
    expect(picker.get('.selection-summary').text()).toContain('Product launch');
    await picker.get('.picker-footer button').trigger('click');
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'confirm' }]);
  });
  it('filters, shows empty results and resets search on kind change', async () => {
    const picker = render();
    await picker.get('input').setValue('no such window');
    expect(picker.findAll('.source-card')).toHaveLength(0);
    expect(picker.get('.empty-state').text()).toContain('No sources match');
    await picker.get('.kind-tabs button').trigger('click');
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'kind', kind: 'screen' }]);
    await picker.setProps({ state: { ...initial(), kind: 'screen' } });
    expect(picker.findAll('.source-card')).toHaveLength(3);
    expect(picker.get('input').element.value).toBe('');
  });
  it('handles all arrow keys, Home, End, empty lists and preserves text-input navigation', async () => {
    const picker = render();
    const first = picker.get('[data-source-id="demo-window-1"]');
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
      await first.trigger('keydown', { key });
      expect(picker.emitted('action')?.at(-1)).toEqual([expect.objectContaining({ type: 'hover' })]);
    }
    const before = picker.emitted('action')?.length;
    await picker.get('input').trigger('keydown', { key: 'ArrowLeft' });
    await first.trigger('keydown', { key: 'a' });
    expect(picker.emitted('action')).toHaveLength(before!);
    await picker.get('input').trigger('keydown', { key: 'Escape' });
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'cancel' }]);
    await picker.setProps({ state: initial([]) });
    await picker.get('main').trigger('keydown', { key: 'End' });
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'cancel' }]);
  });
  it('keeps Tab focus inside the dialog in both directions', async () => {
    const picker = render({ ...initial(), selectedId: 'demo-window-1' });
    const first = picker.get('.picker-header button');
    const last = picker.get('.picker-footer button');
    (first.element as HTMLElement).focus();
    await first.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last.element);
    await last.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first.element);
    await picker.get('input').trigger('keydown', { key: 'Tab' });
  });
  it('shows missing preview and actionable native errors without hiding the selectable source', async () => {
    const state = initial([{ ...nativeSource, thumbnail: null }], false);
    const picker = render(state);
    await picker.setProps({ state: { ...state, selectedId: nativeSource.id, error: 'Accessibility access required' } });
    expect(picker.get('.preview-error').text()).toContain('Accessibility');
    expect(picker.find('.unavailable').exists()).toBe(true);
    expect(picker.get('.picker-footer button').attributes('disabled')).toBeUndefined();
  });
  it('consumes native state, acknowledges readiness and unsubscribes after teardown', async () => {
    let listener: ((state: SourcePickerState) => void) | undefined;
    const unsubscribe = vi.fn();
    const bridge = {
      sourcePickerAction: vi.fn(),
      notifySourcePickerReady: vi.fn(),
      onSourcePickerState: vi.fn((callback) => {
        listener = callback;
        return unsubscribe;
      }),
    };
    Object.defineProperty(window, 'capture', { configurable: true, value: bridge });
    wrapper = mount(SourcePickerApp);
    expect(bridge.notifySourcePickerReady).toHaveBeenCalledOnce();
    listener?.(initial([nativeSource], false));
    await nextTick();
    await wrapper.get('.source-card').trigger('click');
    expect(bridge.sourcePickerAction).toHaveBeenCalledWith({ type: 'select', id: nativeSource.id });
    wrapper.unmount();
    wrapper = undefined;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('source picker entry surfaces', () => {
  const nativeHost = (role: string) => {
    history.replaceState(null, '', `/?role=${role}`);
    let listener: ((state: SourcePickerState) => void) | undefined;
    Object.defineProperty(window, 'capture', {
      configurable: true,
      value: {
        onSourcePickerState: (callback: (state: SourcePickerState) => void) => {
          listener = callback;
          return vi.fn();
        },
        notifySourcePickerReady: vi.fn(),
      },
    });
    wrapper = mount(SourcePickerApp);
    return async (state: SourcePickerState) => {
      listener?.(state);
      await nextTick();
    };
  };
  it('presents the selected aura independently of the hovered window, including screen bounds', async () => {
    const update = nativeHost('aura');
    expect(wrapper!.find('.selection-aura').exists()).toBe(false);
    await update({ ...initial(), highlightedId: 'demo-window-2' });
    expect(wrapper!.get('.selection-aura').classes()).not.toContain('screen');
    await update({ ...initial(), highlightedId: 'demo-window-2', selectedId: developmentSources[0]!.id });
    expect(wrapper!.get('.selection-aura').classes()).toContain('screen');
  });
  it('presents only the current target and releases live timers on unmount', async () => {
    vi.useFakeTimers();
    const update = nativeHost('target');
    expect(wrapper!.find('.native-target').exists()).toBe(false);
    await update({ ...initial(), highlightedId: 'demo-window-1' });
    const before = wrapper!.get('.live-clock').text();
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper!.get('.live-clock').text()).not.toBe(before);
    expect(wrapper!.find('.picker-panel').exists()).toBe(false);
    wrapper!.unmount();
    wrapper = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('browser inspection feeds fixture data into the shared component and retains selection on hover', async () => {
    history.replaceState(null, '', '/?kind=screen');
    wrapper = mount(SourcePickerApp, { props: { initialSources: developmentSources } });
    expect(wrapper.findAll('.source-card')).toHaveLength(3);
    const screens = developmentSources.filter((source) => source.kind === 'screen');
    await wrapper.get(`[data-source-id="${screens[0]!.id}"]`).trigger('mouseenter');
    expect(wrapper.find('.browser-target').exists()).toBe(true);
    await wrapper.get(`[data-source-id="${screens[0]!.id}"]`).trigger('click');
    await wrapper.get(`[data-source-id="${screens[1]!.id}"]`).trigger('mouseenter');
    expect(wrapper.get('.selection-summary').text()).toContain(screens[0]!.name);
    await wrapper.findAll('.kind-tabs button')[1]!.trigger('click');
    expect(wrapper.findAll('.source-card')).toHaveLength(21);
    expect(wrapper.find('.browser-target').exists()).toBe(false);
    await wrapper.get('[data-source-id="demo-window-3"]').trigger('click');
    await wrapper.get('.picker-footer button').trigger('click');
    expect(wrapper.find('.picker-panel').exists()).toBe(false);
    expect(wrapper.find('.browser-target').exists()).toBe(false);
  });
  it('browser cancellation closes the shared selector and native actions tolerate a detached bridge', async () => {
    wrapper = mount(SourcePickerApp, { props: { initialSources: developmentSources } });
    await wrapper.get('.picker-header button').trigger('click');
    expect(wrapper.find('.picker-panel').exists()).toBe(false);
    wrapper.unmount();
    wrapper = mount(SourcePickerApp);
    wrapper.findComponent(SourcePicker).vm.$emit('action', { type: 'cancel' });
    await nextTick();
    expect(wrapper.find('.picker-panel').exists()).toBe(true);
  });
  it('native windows without icons use the standard window glyph', () => {
    render(initial([{ ...nativeSource, appIcon: null }], false));
    expect(wrapper!.find('.app-icon').exists()).toBe(false);
    expect(wrapper!.find('.source-label svg').exists()).toBe(true);
  });
});
