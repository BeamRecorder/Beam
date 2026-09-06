import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { COMPOSITION_SCHEMA_VERSION } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ZoomElement } from '../../../zoom/zoom-types';
import type { TimelineTracksEmits } from '../timeline-tracks-types';
import { useTimelineClipboard } from '../useTimelineClipboard';
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

const item = (menu: ReturnType<typeof createMenu>, id: string) => {
  const found = menu.contextMenuItems.value.find((entry) => !('isDivider' in entry) && entry.id === id);
  return found && !('isDivider' in found) ? found : undefined;
};

afterEach(() => {
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
