import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import SourcePicker from './SourcePicker.vue';
import SourcePickerApp from './SourcePickerApp.vue';
import SourceArtwork from './SourceArtwork.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
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
const render = (state = initial()) => {
  const picker = mount(SourcePicker, {
    props: { state },
    attachTo: document.body,
  });
  wrapper = picker;
  return picker;
};
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
    await wrapper.setProps({
      source: { ...nativeSource, thumbnail: null, kind: 'screen' },
    });
    expect(wrapper.find('.unavailable').exists()).toBe(true);
    await wrapper.setProps({ source: { ...nativeSource, thumbnail: null } });
    expect(wrapper.find('.unavailable').exists()).toBe(true);
  });
});

describe('shared source picker', () => {
  it.each([
    { kind: 'window' as const, id: 'demo-window-1', selectedId: null },
    {
      kind: 'screen' as const,
      id: developmentSources[0]!.id,
      selectedId: null,
    },
    {
      kind: 'window' as const,
      id: 'demo-window-1',
      selectedId: 'demo-window-2',
    },
  ])('one click confirms the exact $kind source without waiting for native state', async ({ kind, id, selectedId }) => {
    const picker = render({ ...initial(), kind, selectedId });
    await picker.get(`[data-source-id="${id}"]`).trigger('click');
    expect(picker.emitted('action')).toEqual([[{ type: 'select', id }], [{ type: 'confirm' }]]);
    expect((picker.props('state') as SourcePickerState).selectedId).toBe(selectedId);
    expect(picker.find('.picker-confirm').exists()).toBe(false);
  });
  it.each(['dblclick', 'keydown'] as const)('also confirms the exact source with %s', async (event) => {
    const picker = render({ ...initial(), highlightedId: 'demo-window-2' });
    await picker.get('[data-source-id="demo-window-1"]').trigger(event, event === 'keydown' ? { key: 'Enter' } : {});
    expect(picker.emitted('action')).toEqual([[{ type: 'select', id: 'demo-window-1' }], [{ type: 'confirm' }]]);
  });
  it.each([
    { scrollLeft: 0, scrollWidth: 500, left: false, right: true },
    { scrollLeft: 150, scrollWidth: 500, left: true, right: true },
    { scrollLeft: 300, scrollWidth: 500, left: true, right: false },
    { scrollLeft: 0, scrollWidth: 200, left: false, right: false },
  ])('shows scroll fades from real horizontal overflow: %j', async ({ scrollLeft, scrollWidth, left, right }) => {
    const picker = render();
    const shadow = picker.getComponent(ScrollShadow);
    Object.defineProperties(shadow.get('.scroll-shadow-viewport').element, {
      clientWidth: { value: 200, configurable: true },
      scrollWidth: { value: scrollWidth, configurable: true },
      scrollLeft: { value: scrollLeft, configurable: true },
    });
    (shadow.vm as unknown as { updateShadows: () => void }).updateShadows();
    await nextTick();
    expect(shadow.vm.hasLeftShadow).toBe(left);
    expect(shadow.vm.hasRightShadow).toBe(right);
  });
  it.each(['screen', 'window'] as const)(
    'shows only %s sources without footer, Play or an embedded preview',
    (kind) => {
      const picker = render({ ...initial(), kind });
      expect(picker.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
      expect(picker.findAll('.source-card')).toHaveLength(kind === 'screen' ? 3 : 21);
      for (const removed of [
        '.kind-tabs',
        '.preview-panel',
        '.source-preview',
        '.development-badge',
        '.development-note',
        '.source-count',
        '.keyboard-hint',
        '.picker-footer',
        '.picker-play',
      ]) {
        expect(picker.find(removed).exists()).toBe(false);
      }
      expect(picker.findAll('.picker-header button')).toHaveLength(1);
      expect(picker.get('.picker-header button').attributes('aria-label')).toBe('Close');
    },
  );
  it('focuses search and moves into the first card with ArrowDown', async () => {
    const picker = render();
    expect(document.activeElement).toBe(picker.get('input').element);
    await picker.get('input').trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(picker.get('[data-source-id="demo-window-1"]').element);
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'hover', id: 'demo-window-1' }]);
  });
  it('keeps selection after hover exits and retains the selected card marker', async () => {
    vi.useFakeTimers();
    const picker = render({
      ...initial(),
      selectedId: 'demo-window-1',
      highlightedId: 'demo-window-2',
    });
    expect(picker.get('[data-source-id="demo-window-1"]').classes()).toContain('is-selected');
    await picker.get('[data-source-id="demo-window-2"]').trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(80);
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'hover', id: null }]);
    expect(picker.get('[data-source-id="demo-window-1"]').attributes('aria-pressed')).toBe('true');
  });
  it.each(['mouseleave', 'blur'] as const)('clears transient hover on card %s', async (event) => {
    vi.useFakeTimers();
    const picker = render({ ...initial(), highlightedId: 'demo-window-1' });
    await picker.get('.source-card').trigger(event);
    expect(picker.emitted('action')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(80);
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'hover', id: null }]);
  });
  it.each(['mouseenter', 'focus'] as const)(
    'bridges card gaps without hiding the preview before the next %s',
    async (event) => {
      vi.useFakeTimers();
      const picker = render();
      const cards = picker.findAll('.source-card');
      await cards[0]!.trigger(event);
      await cards[0]!.trigger(event === 'focus' ? 'blur' : 'mouseleave');
      await vi.advanceTimersByTimeAsync(40);
      await cards[1]!.trigger(event);
      await vi.advanceTimersByTimeAsync(200);
      expect(picker.emitted('action')).toEqual([
        [{ type: 'hover', id: 'demo-window-1' }],
        [{ type: 'hover', id: 'demo-window-2' }],
      ]);
    },
  );
  it('clears immediately on actual surface exit and cancels any pending gap timer', async () => {
    vi.useFakeTimers();
    const picker = render();
    await picker.get('.source-card').trigger('mouseleave');
    await picker.get('main').trigger('mouseleave');
    expect(picker.emitted('action')).toEqual([[{ type: 'hover', id: null }]]);
    await vi.advanceTimersByTimeAsync(200);
    expect(picker.emitted('action')).toHaveLength(1);
  });
  it('does not send delayed hover actions after the chooser closes', async () => {
    vi.useFakeTimers();
    const picker = render();
    await picker.get('.source-card').trigger('mouseleave');
    picker.unmount();
    wrapper = undefined;
    await vi.advanceTimersByTimeAsync(200);
    expect(picker.emitted('action')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears hover on surface exit and focus loss, removing listeners at teardown', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const picker = render();
    await picker.get('main').trigger('mouseleave');
    window.dispatchEvent(new Event('blur'));
    expect(picker.emitted('action')?.slice(-2)).toEqual([[{ type: 'hover', id: null }], [{ type: 'hover', id: null }]]);
    picker.unmount();
    wrapper = undefined;
    expect(remove).toHaveBeenCalledWith('blur', expect.any(Function));
    remove.mockRestore();
  });
  it('filters sources, clears hidden hover and resets search when changing kind', async () => {
    const picker = render({ ...initial(), highlightedId: 'demo-window-1' });
    await picker.get('input').setValue('no such window');
    expect(picker.findAll('.source-card')).toHaveLength(0);
    expect(picker.get('.empty-state').text()).toContain('No sources match');
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'hover', id: null }]);
    await picker.setProps({ state: { ...initial(), kind: 'screen' } });
    expect(picker.findAll('.source-card')).toHaveLength(3);
    expect(picker.get('input').element.value).toBe('');
  });
  it.each([
    { deltaX: 0, deltaY: 50, ctrlKey: false, scrollWidth: 700, expected: 50 },
    { deltaX: 80, deltaY: 10, ctrlKey: false, scrollWidth: 700, expected: 0 },
    { deltaX: 0, deltaY: 50, ctrlKey: true, scrollWidth: 700, expected: 0 },
    { deltaX: 0, deltaY: 50, ctrlKey: false, scrollWidth: 200, expected: 0 },
  ])(
    'scrolls with mouse wheels without consuming horizontal input or zoom: %j',
    async ({ expected, scrollWidth, ...event }) => {
      const picker = render();
      const viewport = picker.get('.scroll-shadow-viewport').element;
      Object.defineProperties(viewport, {
        clientWidth: { value: 200, configurable: true },
        scrollWidth: { value: scrollWidth, configurable: true },
        scrollLeft: { value: 0, writable: true, configurable: true },
      });
      picker.get('.source-scroll').element.dispatchEvent(
        new WheelEvent('wheel', {
          ...event,
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();
      expect(viewport.scrollLeft).toBe(expected);
    },
  );
  it('navigates arrows, Home and End while preserving text input and closing on Escape', async () => {
    const picker = render();
    const first = picker.get('.source-card');
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
  it('traps Tab in both directions without a confirmation control', async () => {
    const picker = render();
    const first = picker.get('input');
    const last = picker.findAll('.source-card').at(-1)!;
    (first.element as HTMLElement).focus();
    await first.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last.element);
    await last.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first.element);
    await first.trigger('keydown', { key: 'Tab' });
  });
  it('shows native unavailable data and errors while retaining selectable sources and close', async () => {
    const picker = render({
      ...initial([{ ...nativeSource, thumbnail: null }], false),
      error: 'Accessibility access required',
    });
    expect(picker.get('.picker-error').text()).toContain('Accessibility');
    expect(picker.find('.unavailable').exists()).toBe(true);
    expect(picker.find('.artwork').exists()).toBe(false);
    expect(picker.find('.app-icon').exists()).toBe(true);
    await picker.get('.picker-header button').trigger('click');
    expect(picker.emitted('action')?.at(-1)).toEqual([{ type: 'cancel' }]);
  });
  it('uses the standard glyph for native windows without icons', () => {
    const picker = render(initial([{ ...nativeSource, appIcon: null }], false));
    expect(picker.find('.app-icon').exists()).toBe(false);
    expect(picker.find('.source-label svg').exists()).toBe(true);
  });
});

describe('source picker entry surfaces', () => {
  const nativeHost = (role = 'chooser') => {
    history.replaceState(null, '', `/html/source-picker.html?role=${role}`);
    let listener: ((state: SourcePickerState) => void) | undefined;
    const bridge = {
      sourcePickerAction: vi.fn(),
      notifySourcePickerReady: vi.fn(),
      onSourcePickerState: vi.fn((callback) => {
        listener = callback;
        return vi.fn();
      }),
    };
    Object.defineProperty(window, 'capture', {
      configurable: true,
      value: bridge,
    });
    wrapper = mount(SourcePickerApp);
    return {
      bridge,
      update: async (state: SourcePickerState) => {
        listener?.(state);
        await nextTick();
      },
    };
  };
  it('acknowledges native readiness and sends one-click selection/confirmation', async () => {
    const { bridge, update } = nativeHost();
    expect(bridge.notifySourcePickerReady).toHaveBeenCalledOnce();
    await update(initial([nativeSource], false));
    await wrapper!.get('.source-card').trigger('click');
    expect(bridge.sourcePickerAction.mock.calls).toEqual([
      [{ type: 'select', id: nativeSource.id }],
      [{ type: 'confirm' }],
    ]);
    const unsubscribe = bridge.onSourcePickerState.mock.results[0]!.value;
    wrapper!.unmount();
    wrapper = undefined;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('keeps selected development windows behind the chooser, overriding only during hover', async () => {
    vi.useFakeTimers();
    const { update } = nativeHost('target');
    expect(wrapper!.find('.target-window').exists()).toBe(false);
    await update({ ...initial(), selectedId: 'demo-window-1' });
    expect(wrapper!.get('.target-window .app-chrome').text()).toContain('Chrome');
    await update({
      ...initial(),
      selectedId: 'demo-window-1',
      highlightedId: 'demo-window-2',
    });
    expect(wrapper!.get('.target-window .app-chrome').text()).toContain('Visual Studio Code');
    await update({ ...initial(), selectedId: 'demo-window-1' });
    expect(wrapper!.get('.target-window .app-chrome').text()).toContain('Chrome');
    expect(wrapper!.find('.picker-panel').exists()).toBe(false);
    await update(initial());
    await vi.advanceTimersByTimeAsync(50);
    expect(wrapper!.find('.target-window').exists()).toBe(false);
    wrapper!.unmount();
    wrapper = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['window', 'screen'] as const)(
    'reuses the same %s preview component and readiness handshake across sources',
    async (kind) => {
      vi.useFakeTimers();
      const { bridge, update } = nativeHost('target');
      const sources = developmentSources.filter((source) => source.kind === kind);
      await update({
        ...initial(sources),
        kind,
        highlightedId: sources[0]!.id,
      });
      const artwork = wrapper!.getComponent(SourceArtwork).element;
      const container = wrapper!.get('.target-window').element;
      for (const source of sources.slice(1)) {
        await update({ ...initial(sources), kind, highlightedId: source.id });
        expect(wrapper!.getComponent(SourceArtwork).element).toBe(artwork);
        expect(wrapper!.get('.target-window').element).toBe(container);
      }
      expect(bridge.notifySourcePickerReady).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(1);
    },
  );
  it.each(['screen', 'window'] as const)(
    'browser inspection puts the %s behind the component and closes on click',
    async (kind) => {
      history.replaceState(null, '', `/?kind=${kind}`);
      wrapper = mount(SourcePickerApp, {
        props: { initialSources: developmentSources },
      });
      const card = wrapper.get('.source-card');
      await card.trigger('mouseenter');
      const chooser = wrapper.getComponent(SourcePicker);
      expect(wrapper.find('.target-window').exists()).toBe(true);
      expect(chooser.element.contains(wrapper.get('.target-window').element)).toBe(false);
      expect(chooser.find('.source-preview').exists()).toBe(false);
      await card.trigger('click');
      expect(wrapper.find('.picker-panel').exists()).toBe(false);
      expect(wrapper.find('.target-window').exists()).toBe(false);
    },
  );
  it.each(['screen', 'window'] as const)('resets selection when switching to %s in a browser preview', async (kind) => {
    wrapper = mount(SourcePickerApp, {
      props: { initialSources: developmentSources },
    });
    wrapper.getComponent(SourcePicker).vm.$emit('action', { type: 'select', id: 'demo-window-1' });
    await nextTick();
    wrapper.getComponent(SourcePicker).vm.$emit('action', { type: 'kind', kind });
    await nextTick();
    expect(wrapper.findAll('.source-card')).toHaveLength(kind === 'screen' ? 3 : 21);
    expect(wrapper.find('.target-window').exists()).toBe(false);
  });
  it('cancels browser inspection and tolerates a detached native bridge', async () => {
    wrapper = mount(SourcePickerApp, {
      props: { initialSources: developmentSources },
    });
    await wrapper.get('.picker-header button').trigger('click');
    expect(wrapper.find('.picker-panel').exists()).toBe(false);
    wrapper.unmount();
    wrapper = mount(SourcePickerApp);
    wrapper.getComponent(SourcePicker).vm.$emit('action', { type: 'cancel' });
    await nextTick();
    expect(wrapper.find('.picker-panel').exists()).toBe(true);
  });
});
