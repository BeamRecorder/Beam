import { computed, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useHudCaptureActions } from '../useHudCaptureActions';
import type { HudCaptureActionsOptions } from '../hud-state-types';
const fixture = (platform = 'darwin') => {
  const busy = ref(false);
  const options: HudCaptureActionsOptions = {
    platform,
    blocked: computed(() => busy.value),
    activeTab: ref('screen'),
    sources: ref([{ id: 'native:display', kind: 'display', label: 'Display', isDefault: true }]),
    windowPreviews: ref([{ id: 'window:42:0', name: 'Window', thumbnail: '', appIcon: null }]),
    selectedScreenId: ref(null),
    selectedSourceId: ref(null),
    resetRegion: vi.fn(),
    selectRegion: vi.fn().mockResolvedValue(true),
    refreshSources: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
  };
  return { options, busy, actions: useHudCaptureActions(options) };
};
describe('HUD capture actions', () => {
  it.each(['screen', 'window'] as const)('opens real %s choices before starting the selected source', async (kind) => {
    const { options, actions } = fixture();
    await actions.chooseCapture(kind);
    expect(actions.sourcePicker.value).toBe(kind);
    expect(options.start).not.toHaveBeenCalled();
    expect(options.refreshSources).toHaveBeenCalledWith(kind);
    const id = kind === 'screen' ? 'native:display' : 'window:42:0';
    await actions.selectCaptureSource(id);
    expect(kind === 'screen' ? options.selectedScreenId.value : options.selectedSourceId.value).toBe(id);
    expect(options.start).toHaveBeenCalledOnce();
    expect(actions.sourcePicker.value).toBeNull();
  });
  it('ignores missing sources and a canceled picker', async () => {
    const { options, actions } = fixture();
    await actions.selectCaptureSource('native:display');
    await actions.chooseCapture('screen');
    await actions.selectCaptureSource('gone');
    await actions.chooseCapture('window');
    await actions.selectCaptureSource('gone');
    expect(options.start).not.toHaveBeenCalled();
  });
  it('accepts a native window whose thumbnail is unavailable', async () => {
    const { options, actions } = fixture();
    options.sources.value.push({ id: 'sck:window:9', kind: 'window', label: 'Window', isDefault: false });
    await actions.chooseCapture('window');
    await actions.selectCaptureSource('sck:window:9');
    expect(options.selectedSourceId.value).toBe('sck:window:9');
    expect(options.start).toHaveBeenCalledOnce();
  });
  it.each(['screen', 'window'] as const)('uses the Linux Portal for %s', async (kind) => {
    const { options, actions } = fixture('linux');
    await actions.chooseCapture(kind);
    expect(options.activeTab.value).toBe(kind);
    expect(options.start).toHaveBeenCalledOnce();
    expect(options.refreshSources).not.toHaveBeenCalled();
    expect(actions.sourcePicker.value).toBeNull();
  });
  it('starts a region only after confirmation and preserves its crop', async () => {
    const { options, actions } = fixture();
    await actions.chooseCapture('region');
    expect(options.selectRegion).toHaveBeenCalledOnce();
    expect(options.resetRegion).not.toHaveBeenCalled();
    expect(options.start).toHaveBeenCalledOnce();
  });
  it('leaves canceled region selection idle', async () => {
    const { options, actions } = fixture();
    vi.mocked(options.selectRegion).mockResolvedValue(false);
    await actions.chooseCapture('region');
    expect(options.start).not.toHaveBeenCalled();
    expect(actions.choosingSource.value).toBe(false);
  });
  it('blocks rapid duplicate actions while the selection is in flight', async () => {
    const { options, actions, busy } = fixture();
    busy.value = true;
    await actions.chooseCapture('region');
    expect(options.selectRegion).not.toHaveBeenCalled();
    busy.value = false;
    let finish!: (value: boolean) => void;
    vi.mocked(options.selectRegion).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = actions.chooseCapture('region');
    await nextTick();
    await actions.chooseCapture('screen');
    expect(options.refreshSources).not.toHaveBeenCalled();
    finish(true);
    await first;
    expect(options.start).toHaveBeenCalledOnce();
  });
  it('releases pending state after a selection or capture error', async () => {
    const { options, actions } = fixture();
    vi.mocked(options.selectRegion).mockRejectedValueOnce(new Error('Selection failed'));
    await expect(actions.chooseCapture('region')).rejects.toThrow('Selection failed');
    expect(actions.choosingSource.value).toBe(false);
    await actions.chooseCapture('window');
    vi.mocked(options.start).mockRejectedValueOnce(new Error('Capture failed'));
    await expect(actions.selectCaptureSource('window:42:0')).rejects.toThrow('Capture failed');
    expect(actions.choosingSource.value).toBe(false);
    expect(actions.sourcePicker.value).toBe('window');
  });
  it('ignores source clicks while capture is blocked or already pending', async () => {
    const { options, actions, busy } = fixture();
    await actions.chooseCapture('screen');
    busy.value = true;
    await actions.selectCaptureSource('native:display');
    expect(options.start).not.toHaveBeenCalled();
    busy.value = false;
    let finish!: () => void;
    vi.mocked(options.start).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = actions.selectCaptureSource('native:display');
    await nextTick();
    await actions.selectCaptureSource('native:display');
    expect(options.start).toHaveBeenCalledOnce();
    finish();
    await first;
  });
});
