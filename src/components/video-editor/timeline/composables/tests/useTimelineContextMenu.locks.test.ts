import { defineComponent, h, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioClip, Clip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { COMPOSITION_SCHEMA_VERSION } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ZoomElement } from '../../../zoom/zoom-types';
import type { TimelineTracksEmits } from '../timeline-tracks-types';
import { useTimelineClipboard } from '../useTimelineClipboard';
import { useTimelineClipboardShortcuts } from '../useTimelineClipboardShortcuts';
import { useTimelineContextMenu } from '../useTimelineContextMenu';

const asset: MediaAsset = {
  id: 'asset-1',
  kind: 'video',
  name: 'Demo recording',
  fileName: 'demo-recording.mp4',
  durationMs: 10_000,
  width: 1_920,
  height: 1_080,
  src: '/media/demo-recording.mp4',
  origin: 'project',
};

const clip = (id: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: asset.id,
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: 'video-track',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const zoom = (id: string, overrides: Partial<ZoomElement> = {}): ZoomElement => ({
  id,
  sessionId: 'session-1',
  startMs: 2_000,
  endMs: 3_500,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
  ...overrides,
});

const composition = (clips: Clip[]): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [asset],
  clips,
  keyboardCaptionSessions: [],
});

const contextMenuEvent = () => new MouseEvent('contextmenu', { clientX: 120, clientY: 80 });

const dispatchPaste = (target: EventTarget, items: Array<{ kind: string; type: string }> = []) => {
  // jsdom does not expose ClipboardEvent, so use it when available and retain the
  // same cancelable event shape in the test environment.
  const event = globalThis.ClipboardEvent
    ? new globalThis.ClipboardEvent('paste', { bubbles: true, cancelable: true })
    : new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { configurable: true, value: { items } });
  target.dispatchEvent(event);
  return event;
};

const createMenu = (overrides: Partial<Parameters<typeof useTimelineContextMenu>[0]> = {}) => {
  const clips = [clip('clip-1')];
  const sourceZoom = zoom('zoom-1');
  const emitSpy = vi.fn();
  const options = {
    scopeId: ref('project-a'),
    currentTimeMs: ref(1_000),
    composition: ref(composition(clips)),
    zoomElements: ref([sourceZoom]),
    selectedClipId: ref<string | null>(clips[0].id),
    selectedClipIds: ref([clips[0].id]),
    selectedZoomId: ref<string | null>(null),
    selectedZoomIds: ref<string[]>([]),
    assetFor: (candidate: Clip) => ('assetId' in candidate && candidate.assetId === asset.id ? asset : null),
    emit: emitSpy as unknown as TimelineTracksEmits,
    t: (key: string) =>
      ({ copy: 'Copy', delete: 'Delete', holdSegment: 'Hold', lock: 'Lock', unlock: 'Unlock' })[key] ?? key,
    ...overrides,
  };
  return { ...useTimelineContextMenu(options), options, emitSpy, clips, sourceZoom };
};

let shortcutWrapper: VueWrapper | undefined;

const mountClipboardShortcuts = (menu: ReturnType<typeof createMenu>) => {
  const Harness = defineComponent({
    setup() {
      useTimelineClipboardShortcuts({
        composition: () => menu.options.composition.value,
        selectedClipId: () => menu.options.selectedClipId.value,
        selectedZoomId: () => menu.options.selectedZoomId.value,
        disabled: () => false,
        copySelected: menu.copySelected,
        cutSelected: menu.cutSelected,
        canPaste: menu.canPasteClipboard,
        pasteClipboard: menu.pasteClipboard,
      });
      return () => h('div');
    },
  });
  shortcutWrapper = mount(Harness);
  return shortcutWrapper;
};

const item = (menu: ReturnType<typeof createMenu>, id: string) => {
  const found = menu.contextMenuItems.value.find((entry) => !('isDivider' in entry) && entry.id === id);
  return found && !('isDivider' in found) ? found : undefined;
};

afterEach(() => {
  shortcutWrapper?.unmount();
  shortcutWrapper = undefined;
  useTimelineClipboard().clearClipboard();
});

describe('useTimelineContextMenu lock actions', () => {
  it('labels a multi-selection with Lock and its item count, then emits the selection', () => {
    const first = clip('first');
    const second = clip('second', { timelineStartMs: 2_500 });
    const menu = createMenu({
      composition: ref(composition([first, second])),
      selectedClipId: ref(first.id),
      selectedClipIds: ref([first.id, second.id]),
    });

    menu.openClipContextMenu(contextMenuEvent(), first);

    expect(item(menu, 'lock')).toEqual(expect.objectContaining({ label: 'Lock (2)' }));
    expect(item(menu, 'unlock')).toBeUndefined();
    menu.handleContextMenuSelect('lock');

    expect(menu.emitSpy).toHaveBeenCalledWith('lock:selection', {
      clipIds: [first.id, second.id],
      zoomIds: [],
      locked: true,
    });
  });

  it('labels an all-locked selection with Unlock and its item count', () => {
    const first = clip('first', { locked: true });
    const second = clip('second', { timelineStartMs: 2_500, locked: true });
    const menu = createMenu({
      composition: ref(composition([first, second])),
      selectedClipId: ref(first.id),
      selectedClipIds: ref([first.id, second.id]),
    });

    menu.openClipContextMenu(contextMenuEvent(), first);

    expect(item(menu, 'unlock')).toEqual(expect.objectContaining({ label: 'Unlock (2)' }));
    expect(item(menu, 'lock')).toBeUndefined();
    menu.handleContextMenuSelect('unlock');

    expect(menu.emitSpy).toHaveBeenCalledWith('lock:selection', {
      clipIds: [first.id, second.id],
      zoomIds: [],
      locked: false,
    });
  });

  it('uses Lock with the full count for a mixed locked and unlocked selection', () => {
    const free = clip('free');
    const locked = clip('locked', { timelineStartMs: 2_500, locked: true });
    const menu = createMenu({
      composition: ref(composition([free, locked])),
      selectedClipId: ref(free.id),
      selectedClipIds: ref([free.id, locked.id]),
    });

    menu.openClipContextMenu(contextMenuEvent(), free);

    expect(item(menu, 'lock')).toEqual(expect.objectContaining({ label: 'Lock (2)' }));
    expect(item(menu, 'unlock')).toBeUndefined();
    menu.handleContextMenuSelect('lock');
    expect(menu.emitSpy).toHaveBeenCalledWith('lock:selection', {
      clipIds: [free.id, locked.id],
      zoomIds: [],
      locked: true,
    });
  });

  it('keeps the lock count at one for an explicitly selected grouped clip', () => {
    const selected = clip('selected', { groupId: 'recording' });
    const companion = clip('companion', { groupId: 'recording', timelineStartMs: 2_500 });
    const menu = createMenu({
      composition: ref(composition([selected, companion])),
      selectedClipId: ref(selected.id),
      selectedClipIds: ref([selected.id]),
    });

    menu.openClipContextMenu(contextMenuEvent(), selected);

    expect(item(menu, 'lock')).toEqual(expect.objectContaining({ label: 'Lock' }));
    menu.handleContextMenuSelect('lock');
    expect(menu.emitSpy).toHaveBeenCalledWith('lock:selection', {
      clipIds: [selected.id],
      zoomIds: [],
      locked: true,
    });
  });

  it('disables edits for a locked clip while keeping copy available', () => {
    const locked = clip('locked', { locked: true });
    const menu = createMenu({
      composition: ref(composition([locked])),
      selectedClipId: ref(locked.id),
      selectedClipIds: ref([locked.id]),
    });

    menu.openClipContextMenu(contextMenuEvent(), locked);

    expect(item(menu, 'hold')).toEqual(expect.objectContaining({ disabled: true }));
    expect(item(menu, 'delete')).toEqual(expect.objectContaining({ disabled: true }));
    expect(item(menu, 'ripple-delete')).toEqual(expect.objectContaining({ disabled: true }));
    expect(item(menu, 'copy')).toEqual(expect.objectContaining({ disabled: false }));

    menu.handleContextMenuSelect('delete');
    menu.handleContextMenuSelect('hold');
    expect(menu.emitSpy).not.toHaveBeenCalledWith('delete:selection', expect.anything());
    expect(menu.emitSpy).not.toHaveBeenCalledWith('hold:clip', expect.anything());

    menu.handleContextMenuSelect('copy');
    expect(menu.emitSpy).toHaveBeenCalledWith('clipboard:copied', expect.objectContaining({ type: 'clip' }));
  });

  it('pastes the internal timeline clipboard from a paste event without image data', () => {
    const menu = createMenu();
    useTimelineClipboard().copyClip('project-a', menu.clips[0]!);
    mountClipboardShortcuts(menu);

    const event = dispatchPaste(window);

    expect(event.defaultPrevented).toBe(true);
    expect(menu.emitSpy).toHaveBeenCalledWith(
      'paste:item',
      expect.objectContaining({
        item: expect.objectContaining({ type: 'clip' }),
        timeMs: 1_000,
        target: { category: 'visual', trackId: 'video-track', placement: 'new-layer' },
      }),
    );
  });

  it('leaves image paste events unclaimed for the image handler', () => {
    const menu = createMenu();
    useTimelineClipboard().copyClip('project-a', menu.clips[0]!);
    mountClipboardShortcuts(menu);

    const event = dispatchPaste(window, [{ kind: 'file', type: 'image/png' }]);

    expect(event.defaultPrevented).toBe(false);
    expect(menu.emitSpy).not.toHaveBeenCalledWith('paste:item', expect.anything());
  });

  it('leaves Ctrl+X and the existing clipboard untouched when any selected item is locked', () => {
    const free = clip('free');
    const locked = clip('locked', { timelineStartMs: 2_500, locked: true });
    const menu = createMenu({
      composition: ref(composition([free, locked])),
      selectedClipId: ref(free.id),
      selectedClipIds: ref([free.id, locked.id]),
    });
    const clipboard = useTimelineClipboard();
    const previous = clipboard.copyClip('project-a', clip('previously-copied'));
    mountClipboardShortcuts(menu);

    const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(clipboard.getClipboardItem()).toEqual(previous);
    expect(menu.emitSpy).not.toHaveBeenCalledWith('clipboard:copied', expect.anything());
    expect(menu.emitSpy).not.toHaveBeenCalledWith('delete:selection', expect.anything());
  });

  it('blocks Ctrl+X when a linked recording sidecar is locked', () => {
    const sessionId = 'session-1';
    const screenAsset: MediaAsset = { ...asset, id: 'screen-asset', sessionId };
    const microphoneAsset: MediaAsset = {
      ...asset,
      id: 'microphone-asset',
      kind: 'audio',
      name: 'Microphone',
      fileName: 'microphone.wav',
      width: null,
      height: null,
      sessionId,
    };
    const screen = clip('screen-recording', {
      kind: 'screen',
      assetId: screenAsset.id,
      appearance: createDefaultClipAppearance('screen'),
    });
    const lockedMicrophone: AudioClip = {
      id: 'locked-microphone',
      kind: 'audio',
      name: 'Microphone',
      assetId: microphoneAsset.id,
      timelineStartMs: 3_000,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
      enabled: true,
      order: 1,
      role: 'microphone',
      volume: 100,
      locked: true,
      recordingClipId: screen.id,
    };
    const menu = createMenu({
      composition: ref({
        ...composition([screen, lockedMicrophone]),
        assets: [screenAsset, microphoneAsset],
      }),
      selectedClipId: ref(screen.id),
      selectedClipIds: ref([screen.id]),
    });
    const clipboard = useTimelineClipboard();
    const previous = clipboard.copyClip('project-a', clip('previously-copied'));
    mountClipboardShortcuts(menu);

    const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(clipboard.getClipboardItem()).toEqual(previous);
    expect(menu.emitSpy).not.toHaveBeenCalledWith('clipboard:copied', expect.anything());
    expect(menu.emitSpy).not.toHaveBeenCalledWith('delete:selection', expect.anything());
  });

  it('cuts an unlocked clip and zoom bundle with one delete-selection emission', () => {
    const first = clip('first');
    const second = clip('second', { timelineStartMs: 2_500 });
    const selectedZoom = zoom('selected-zoom');
    const menu = createMenu({
      composition: ref(composition([first, second])),
      zoomElements: ref([selectedZoom]),
      selectedClipId: ref(second.id),
      selectedClipIds: ref([first.id, second.id]),
      selectedZoomIds: ref([selectedZoom.id]),
    });
    mountClipboardShortcuts(menu);

    const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(menu.emitSpy).toHaveBeenCalledTimes(2);
    expect(menu.emitSpy).toHaveBeenCalledWith('clipboard:copied', expect.objectContaining({ type: 'selection' }));
    expect(menu.emitSpy).toHaveBeenCalledWith('delete:selection', {
      clipIds: [first.id, second.id],
      zoomIds: [selectedZoom.id],
      mode: 'lift',
    });
    expect(useTimelineClipboard().getClipboardItem()).toMatchObject({
      type: 'selection',
      primaryIndex: 1,
      entries: [
        expect.objectContaining({ type: 'clip', clip: expect.objectContaining({ id: first.id }) }),
        expect.objectContaining({ type: 'clip', clip: expect.objectContaining({ id: second.id }) }),
        expect.objectContaining({ type: 'zoom', zoom: expect.objectContaining({ id: selectedZoom.id }) }),
      ],
    });
  });

  it('targets every clip in a visual header lane instead of the current selection', () => {
    const laneLocked = clip('lane-locked', { trackId: 'visual-lane', locked: true });
    const laneFree = clip('lane-free', { trackId: 'visual-lane', timelineStartMs: 2_500 });
    const other = clip('other', { trackId: 'other-lane', timelineStartMs: 5_000 });
    const menu = createMenu({
      composition: ref(composition([laneLocked, laneFree, other])),
      selectedClipId: ref(other.id),
      selectedClipIds: ref([other.id]),
    });

    menu.openTrackContextMenu(contextMenuEvent(), 'visual', 'visual-lane');

    expect(menu.contextMenuState.value).toMatchObject({
      category: 'visual',
      trackId: 'visual-lane',
      clipIds: [laneLocked.id, laneFree.id],
      zoomIds: [],
    });
    expect(item(menu, 'lock')).toEqual(expect.objectContaining({ label: 'Lock (2)' }));
    expect(item(menu, 'delete')).toEqual(expect.objectContaining({ disabled: true }));
    menu.handleContextMenuSelect('lock');

    expect(menu.emitSpy).toHaveBeenCalledWith('lock:selection', {
      clipIds: [laneLocked.id, laneFree.id],
      zoomIds: [],
      locked: true,
    });
  });
});
