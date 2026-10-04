import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { PreferencePatch, PreferenceSettings } from '~/api/types/capture-api';
import { COMPOSITION_POSITION_KEY, MAX_COMPOSITION_BODY_HEIGHT } from '../composition-panel-position';
import {
  dispatchClick,
  dispatchPointer,
  installFrameScheduler,
  mountPanelPositionHarness,
  resetTestResizeObservers,
  TestResizeObserver,
  unmountTracked,
  type PanelGeometry,
} from './composition-panel-position.test-support';

const mocks = vi.hoisted(() => ({
  settings: vi.fn<() => PreferenceSettings | null>(),
  update: vi.fn<(patch: PreferencePatch) => Promise<PreferenceSettings>>(),
}));

vi.mock('~/stores/preferences', () => ({
  usePreferencesStore: () => ({
    get settings() {
      return mocks.settings();
    },
    update: mocks.update,
  }),
}));

const baseGeometry: PanelGeometry = {
  workspaceWidth: 500,
  workspaceHeight: 400,
  panelWidth: 200,
  headerHeight: 80,
  scale: 1,
  contentHeight: 100,
  layerRowsScrollHeight: 40,
  layerRowsClientHeight: 40,
};

const makePreferences = (extras: Record<string, unknown> = {}): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'system',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: true, noticeDismissed: true },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras,
});

const wrappers: VueWrapper[] = [];
let frames!: ReturnType<typeof installFrameScheduler>;

const mountHarness = (geometry: PanelGeometry = { ...baseGeometry }) => {
  const harness = mountPanelPositionHarness(geometry);
  wrappers.push(harness.wrapper);
  return harness;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockReturnValue(makePreferences());
  mocks.update.mockResolvedValue(makePreferences());
  resetTestResizeObservers();
  frames = installFrameScheduler();
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useCompositionPanelPosition', () => {
  it('restores the normalized position from the bootstrapped preferences snapshot', async () => {
    mocks.settings.mockReturnValue(
      makePreferences({
        [COMPOSITION_POSITION_KEY]: { x: 0.25, y: 0.25 },
        retained: 'from-bootstrap',
      }),
    );
    const { panel, state } = mountHarness();

    await nextTick();

    expect(state.ready.value).toBe(true);
    expect(panel.style.transform).toBe('translate3d(83px, 88px, 0)');
    expect(panel.style.getPropertyValue('--composition-body-height')).toBe('100px');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    ['missing preferences snapshot', null],
    ['invalid normalized position', makePreferences({ [COMPOSITION_POSITION_KEY]: { x: 2, y: 0.5 } })],
  ] as const)('uses the default position for %s', async (_label, settings) => {
    mocks.settings.mockReturnValue(settings);
    const { panel, state } = mountHarness();

    await nextTick();

    expect(state.ready.value).toBe(true);
    expect(panel.style.transform).toBe('translate3d(284px, 16px, 0)');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('caps the measured open body height at the exported maximum', async () => {
    const geometry = { ...baseGeometry, workspaceHeight: 1_000, headerHeight: 56, contentHeight: 1_000 };
    const { panel } = mountHarness(geometry);

    await nextTick();

    expect(panel.style.getPropertyValue('--composition-body-height')).toBe(`${MAX_COMPOSITION_BODY_HEIGHT}px`);
    expect(geometry.headerHeight + Number.parseFloat(panel.style.getPropertyValue('--composition-body-height'))).toBe(
      416,
    );
  });

  it('preserves the bootstrapped preference snapshot when the panel unmounts without moving', async () => {
    const position = { x: 0.25, y: 0.25 };
    const snapshot = makePreferences({ [COMPOSITION_POSITION_KEY]: position, retained: 'same-object' });
    mocks.settings.mockReturnValue(snapshot);
    const { wrapper } = mountHarness();

    await nextTick();
    unmountTracked(wrappers, wrapper);

    expect(snapshot.extras[COMPOSITION_POSITION_KEY]).toBe(position);
    expect(snapshot.extras.retained).toBe('same-object');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('coalesces pointer moves into one animation frame and saves the normalized position only on release', async () => {
    const { panel, header, state, pointerCapture } = mountHarness();
    await nextTick();

    dispatchPointer(header, 'pointerdown', { pointerId: 7, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 7, clientX: 80, clientY: 120 });
    dispatchPointer(window, 'pointermove', { pointerId: 7, clientX: 70, clientY: 130 });

    expect(state.dragging.value).toBe(true);
    expect(pointerCapture.setPointerCapture).toHaveBeenCalledOnce();
    expect(frames.request).toHaveBeenCalledOnce();
    expect(panel.style.transform).toBe('translate3d(284px, 16px, 0)');
    expect(mocks.update).not.toHaveBeenCalled();

    frames.flush();
    expect(panel.style.transform).toBe('translate3d(254px, 46px, 0)');
    expect(mocks.update).not.toHaveBeenCalled();

    dispatchPointer(window, 'pointerup', { pointerId: 7, clientX: 70, clientY: 130 });
    await flushPromises();

    expect(state.dragging.value).toBe(false);
    expect(pointerCapture.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({
      extras: {
        [COMPOSITION_POSITION_KEY]: { x: 1 - 30 / 268, y: 30 / 288 },
      },
    });
  });

  it('applies the final pointerup coordinates and cancels an unpainted animation frame', async () => {
    const { panel, header } = mountHarness();
    await nextTick();

    dispatchPointer(header, 'pointerdown', { pointerId: 8, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 8, clientX: 80, clientY: 100 });
    expect(frames.pending.size).toBe(1);

    dispatchPointer(window, 'pointerup', { pointerId: 8, clientX: 60, clientY: 110 });
    await flushPromises();

    expect(panel.style.transform).toBe('translate3d(244px, 26px, 0)');
    expect(frames.cancel).toHaveBeenCalledOnce();
    expect(frames.pending.size).toBe(0);
    expect(mocks.update).toHaveBeenCalledWith({
      extras: {
        [COMPOSITION_POSITION_KEY]: { x: 1 - 40 / 268, y: 10 / 288 },
      },
    });
  });

  it('clamps a pointer-captured drag to the parent canvas edges', async () => {
    const { panel, header, state } = mountHarness();
    await nextTick();

    dispatchPointer(header, 'pointerdown', { pointerId: 9, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 9, clientX: -900, clientY: 1_100 });
    dispatchPointer(window, 'pointerup', { pointerId: 9, clientX: -900, clientY: 1_100 });
    await flushPromises();

    expect(state.upward.value).toBe(false);
    expect(panel.style.transform).toBe('translate3d(16px, 204px, 0)');
    expect(mocks.update).toHaveBeenCalledWith({
      extras: { [COMPOSITION_POSITION_KEY]: { x: 0, y: 1 - 100 / 288 } },
    });
  });

  it('converts physical pointer deltas through the measured editor UI scale', async () => {
    const geometry = { ...baseGeometry, scale: 2 };
    const { panel, header } = mountHarness(geometry);
    await nextTick();

    dispatchPointer(header, 'pointerdown', { pointerId: 10, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 10, clientX: 80, clientY: 120 });
    dispatchPointer(window, 'pointerup', { pointerId: 10, clientX: 80, clientY: 120 });
    await flushPromises();

    expect(panel.style.transform).toBe('translate3d(274px, 26px, 0)');
    expect(mocks.update).toHaveBeenCalledWith({
      extras: {
        [COMPOSITION_POSITION_KEY]: { x: 1 - 10 / 268, y: 10 / 288 },
      },
    });
  });

  it('does not toggle after a drag, while mouse and keyboard clicks still toggle', async () => {
    const { header, toggle } = mountHarness();
    await nextTick();

    dispatchPointer(header, 'pointerdown', { pointerId: 11, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 11, clientX: 80, clientY: 100 });
    dispatchPointer(window, 'pointerup', { pointerId: 11, clientX: 80, clientY: 100 });

    const dragClick = dispatchClick(header, 1);
    expect(dragClick.defaultPrevented).toBe(true);
    expect(toggle).not.toHaveBeenCalled();

    dispatchClick(header, 0);
    expect(toggle).toHaveBeenCalledOnce();
    dispatchClick(header, 1);
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it('does not capture or suppress a click when pointer movement stays below the drag threshold', async () => {
    const { header, toggle, pointerCapture, state } = mountHarness();
    await nextTick();

    dispatchPointer(header, 'pointerdown', { pointerId: 12, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 12, clientX: 103, clientY: 100 });
    dispatchPointer(window, 'pointerup', { pointerId: 12, clientX: 103, clientY: 100 });
    dispatchClick(header, 1);

    expect(state.dragging.value).toBe(false);
    expect(pointerCapture.setPointerCapture).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('ignores non-primary, non-left, and competing pointers', async () => {
    const { header, state, pointerCapture } = mountHarness();
    await nextTick();

    dispatchPointer(header, 'pointerdown', { pointerId: 13, button: 2, clientX: 100, clientY: 100 });
    dispatchPointer(header, 'pointerdown', { pointerId: 13, isPrimary: false, clientX: 100, clientY: 100 });
    expect(pointerCapture.setPointerCapture).not.toHaveBeenCalled();

    dispatchPointer(header, 'pointerdown', { pointerId: 13, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 13, clientX: 90, clientY: 100 });
    dispatchPointer(header, 'pointerdown', { pointerId: 14, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 14, clientX: 0, clientY: 100 });
    expect(state.dragging.value).toBe(true);
    expect(frames.request).toHaveBeenCalledOnce();

    dispatchPointer(window, 'pointerup', { pointerId: 14, clientX: 0, clientY: 100 });
    dispatchPointer(window, 'pointerup', { pointerId: 13, clientX: 90, clientY: 100 });
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it.each(['pointercancel', 'Escape', 'blur', 'lostpointercapture'] as const)(
    'rolls back the draft and direction after %s',
    async (reason) => {
      mocks.settings.mockReturnValue(makePreferences({ [COMPOSITION_POSITION_KEY]: { x: 0.5, y: 0.9 } }));
      const { panel, header, state, pointerCapture } = mountHarness();
      await nextTick();
      expect(state.upward.value).toBe(true);

      dispatchPointer(header, 'pointerdown', { pointerId: 15, clientX: 100, clientY: 300 });
      dispatchPointer(window, 'pointermove', { pointerId: 15, clientX: 100, clientY: 0 });
      frames.flush();
      expect(state.upward.value).toBe(true);
      expect(panel.style.getPropertyValue('--composition-body-height')).toBe('100px');

      if (reason === 'pointercancel') dispatchPointer(window, 'pointercancel', { pointerId: 15 });
      else if (reason === 'Escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      else if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      else dispatchPointer(header, 'lostpointercapture', { pointerId: 15 });
      await flushPromises();

      expect(state.dragging.value).toBe(false);
      expect(state.upward.value).toBe(true);
      expect(panel.style.transform).toBe('translate3d(150px, 275.2px, 0)');
      expect(pointerCapture.releasePointerCapture).toHaveBeenCalledWith(15);
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it('cancels a pending gesture, disconnects observers, and ignores a later pointerup on unmount', async () => {
    const { wrapper, header, state } = mountHarness();
    await nextTick();
    expect(TestResizeObserver.instances).toHaveLength(2);

    dispatchPointer(header, 'pointerdown', { pointerId: 16, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 16, clientX: 80, clientY: 100 });
    expect(state.dragging.value).toBe(true);
    unmountTracked(wrappers, wrapper);
    dispatchPointer(window, 'pointerup', { pointerId: 16, clientX: 80, clientY: 100 });
    await flushPromises();

    expect(state.dragging.value).toBe(false);
    expect(frames.cancel).toHaveBeenCalledOnce();
    expect(TestResizeObserver.instances.every((observer) => observer.disconnected)).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('re-measures the workspace and cancels an in-progress drag on resize', async () => {
    const geometry = { ...baseGeometry };
    const { panel, header, state, workspace } = mountHarness(geometry);
    await nextTick();
    const panelObserver = TestResizeObserver.instances[0];
    if (!panelObserver) throw new Error('Expected the panel ResizeObserver.');

    expect(panelObserver.observed).toEqual(new Set([workspace, panel]));
    dispatchPointer(header, 'pointerdown', { pointerId: 17, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 17, clientX: 0, clientY: 100 });
    frames.flush();
    expect(state.dragging.value).toBe(true);

    geometry.workspaceWidth = 600;
    panelObserver.trigger();

    expect(state.dragging.value).toBe(false);
    expect(panel.style.transform).toBe('translate3d(384px, 16px, 0)');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('measures clipped rows while keeping the open direction and header anchor fixed', async () => {
    mocks.settings.mockReturnValue(makePreferences({ [COMPOSITION_POSITION_KEY]: { x: 0.5, y: 0.6 } }));
    const geometry = { ...baseGeometry };
    const { wrapper, content, panel, state } = mountHarness(geometry);
    await nextTick();
    const contentObserver = TestResizeObserver.instances[1];
    const controls = wrapper.get('.compositing-controls').element;
    const layerList = wrapper.get('.layer-list').element;
    const layerRows = wrapper.get('.layer-rows').element;
    if (!contentObserver) throw new Error('Expected the content ResizeObserver.');

    expect(contentObserver.observed).toEqual(new Set([content, controls, layerList, layerRows]));
    const anchorTransform = `translate3d(150px, ${16 + 0.6 * 288}px, 0)`;
    expect(panel.style.transform).toBe(anchorTransform);
    expect(state.upward.value).toBe(false);
    expect(panel.style.getPropertyValue('--composition-body-height')).toBe('100px');

    geometry.layerRowsScrollHeight = 90;
    contentObserver.trigger();

    expect(state.upward.value).toBe(false);
    expect(panel.style.transform).toBe(anchorTransform);
    expect(Number.parseFloat(panel.style.getPropertyValue('--composition-body-height'))).toBeCloseTo(115.2);

    geometry.contentHeight = 400;
    contentObserver.trigger();

    expect(state.upward.value).toBe(false);
    expect(panel.style.transform).toBe(anchorTransform);
    expect(Number.parseFloat(panel.style.getPropertyValue('--composition-body-height'))).toBeCloseTo(115.2);
    unmountTracked(wrappers, wrapper);
    expect(contentObserver.disconnected).toBe(true);
  });

  it('locks an open panel while dragging, then lets its collapsed header reach the bottom and reopen upward', async () => {
    const { wrapper, panel, header, state, collapsed, geometry } = mountHarness();
    await nextTick();
    expect(collapsed.value).toBe(false);
    expect(state.upward.value).toBe(false);
    expect(panel.style.getPropertyValue('--composition-body-height')).toBe('100px');

    dispatchPointer(header, 'pointerdown', { pointerId: 20, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 20, clientX: 100, clientY: 300 });
    frames.flush();

    expect(state.dragging.value).toBe(true);
    expect(state.upward.value).toBe(false);
    const openTransform = panel.style.transform;
    const openHeaderTop = Number.parseFloat(openTransform.split(', ')[1] ?? 'NaN');
    expect(openHeaderTop).toBeCloseTo(204);
    expect(Number.parseFloat(panel.style.getPropertyValue('--composition-body-height'))).toBeCloseTo(100);
    expect(openHeaderTop + geometry.headerHeight + 100).toBeLessThanOrEqual(geometry.workspaceHeight - 16);

    dispatchPointer(window, 'pointerup', { pointerId: 20, clientX: 100, clientY: 300 });
    await flushPromises();
    expect(mocks.update).toHaveBeenLastCalledWith({
      extras: { [COMPOSITION_POSITION_KEY]: { x: 1, y: 188 / 288 } },
    });

    const contentObserver = TestResizeObserver.instances[1];
    if (!contentObserver) throw new Error('Expected the content ResizeObserver.');
    geometry.layerRowsScrollHeight = 90;
    contentObserver.trigger();
    expect(state.upward.value).toBe(false);
    expect(panel.style.transform).toBe(openTransform);
    expect(panel.style.getPropertyValue('--composition-body-height')).toBe('100px');

    dispatchClick(header, 1);
    dispatchClick(header, 0);
    await nextTick();
    expect(collapsed.value).toBe(true);
    expect(state.upward.value).toBe(true);
    expect(panel.style.transform).toBe(openTransform);
    expect(wrapper.find('.composition-content').exists()).toBe(false);

    dispatchPointer(header, 'pointerdown', { pointerId: 21, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 21, clientX: 100, clientY: 1_100 });
    frames.flush();

    expect(collapsed.value).toBe(true);
    expect(state.upward.value).toBe(true);
    expect(panel.style.transform).toBe('translate3d(284px, 304px, 0)');

    dispatchPointer(window, 'pointerup', { pointerId: 21, clientX: 100, clientY: 1_100 });
    await flushPromises();
    expect(mocks.update).toHaveBeenLastCalledWith({
      extras: { [COMPOSITION_POSITION_KEY]: { x: 1, y: 1 } },
    });

    dispatchClick(header, 1);
    dispatchClick(header, 0);
    await nextTick();

    expect(collapsed.value).toBe(false);
    expect(state.upward.value).toBe(true);
    expect(panel.style.transform).toBe('translate3d(284px, 304px, 0)');
    expect(panel.style.getPropertyValue('--composition-body-height')).toBe('150px');
    expect(wrapper.find('.composition-content').exists()).toBe(true);
  });

  it('handles a failed preference write without breaking later interaction', async () => {
    mocks.update.mockRejectedValueOnce(new Error('settings unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { header } = mountHarness();
    await nextTick();

    dispatchPointer(header, 'pointerdown', { pointerId: 18, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 18, clientX: 80, clientY: 100 });
    dispatchPointer(window, 'pointerup', { pointerId: 18, clientX: 80, clientY: 100 });
    await flushPromises();

    dispatchPointer(header, 'pointerdown', { pointerId: 19, clientX: 100, clientY: 100 });
    dispatchPointer(window, 'pointermove', { pointerId: 19, clientX: 80, clientY: 100 });
    dispatchPointer(window, 'pointerup', { pointerId: 19, clientX: 80, clientY: 100 });
    await flushPromises();

    expect(warning).toHaveBeenCalledWith(
      'Unable to save screenshot Composition position',
      expect.objectContaining({ message: 'settings unavailable' }),
    );
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.calls[1]?.[0]).toEqual({
      extras: { [COMPOSITION_POSITION_KEY]: { x: 1 - 40 / 268, y: 0 } },
    });
  });
});
