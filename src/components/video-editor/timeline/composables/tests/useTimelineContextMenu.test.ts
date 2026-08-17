import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
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

const clip = (): VisualClip => ({
  id: 'clip-1',
  kind: 'video',
  name: 'Demo recording',
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
});

const zoom = (id: string, startMs: number): ZoomElement => ({
  id,
  sessionId: 'session-1',
  startMs,
  endMs: startMs + 500,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
});

const composition = (): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [asset],
  clips: [clip()],
  keyboardCaptionSessions: [],
});

const createMenu = (overrides: Partial<Parameters<typeof useTimelineContextMenu>[0]> = {}) => {
  const sourceClip = clip();
  const sourceZoom = zoom('zoom-1', 2_000);
  const emitSpy = vi.fn();
  const options = {
    scopeId: ref('project-a'),
    currentTimeMs: ref(4_000),
    composition: ref(composition()),
    zoomElements: ref([zoom('zoom-before', 0), sourceZoom, zoom('zoom-after', 8_000)]),
    selectedClipId: ref<string | null>(sourceClip.id),
    selectedZoomId: ref<string | null>(null),
    assetFor: (candidate: Clip) => ('assetId' in candidate && candidate.assetId === asset.id ? asset : null),
    emit: emitSpy as unknown as TimelineTracksEmits,
    t: (key: string) => ({ copyUnavailable: 'Select an item.', clipboardEmpty: 'Copy an item first.' })[key] ?? key,
    ...overrides,
  };
  return { ...useTimelineContextMenu(options), options, emitSpy, sourceClip, sourceZoom };
};

afterEach(() => {
  useTimelineClipboard().clearClipboard();
});

describe('useTimelineContextMenu', () => {
  it('emits the copied clip snapshot with its filename descriptor', () => {
    const menu = createMenu();

    menu.openClipContextMenu(new MouseEvent('contextmenu'), menu.sourceClip);
    menu.handleContextMenuSelect('copy');

    expect(menu.emitSpy).toHaveBeenCalledWith('clipboard:copied', expect.objectContaining({ type: 'clip' }));
    const copied = menu.emitSpy.mock.calls.at(-1)?.[1] as { descriptor?: unknown };
    expect(copied.descriptor).toEqual({ kind: 'item', name: 'demo-recording.mp4' });
  });

  it('pastes the copied descriptor at the current playhead and preserves the destination target', () => {
    const menu = createMenu();

    menu.openClipContextMenu(new MouseEvent('contextmenu'), menu.sourceClip);
    menu.handleContextMenuSelect('copy');
    menu.openTrackContextMenu(new MouseEvent('contextmenu'), 'caption');
    menu.handleContextMenuSelect('paste');

    expect(menu.emitSpy).toHaveBeenLastCalledWith(
      'paste:item',
      expect.objectContaining({
        timeMs: 4_000,
        target: { category: 'caption', trackId: null },
        item: expect.objectContaining({ descriptor: { kind: 'item', name: 'demo-recording.mp4' } }),
      }),
    );
  });

  it('captures a stable ordinal for copied zooms', () => {
    const menu = createMenu();

    menu.openZoomContextMenu(new MouseEvent('contextmenu'), menu.sourceZoom);
    menu.handleContextMenuSelect('copy');

    const copied = menu.emitSpy.mock.calls.at(-1)?.[1] as { descriptor?: unknown };
    expect(copied.descriptor).toEqual({ kind: 'zoom', number: 2 });
  });

  it('reports a localized empty-clipboard error before emitting a paste request', () => {
    const menu = createMenu();

    menu.openTrackContextMenu(new MouseEvent('contextmenu'), 'visual', 'video-track');
    menu.handleContextMenuSelect('paste');

    expect(menu.emitSpy).toHaveBeenCalledWith('paste:error', 'Copy an item first.');
    expect(menu.emitSpy).not.toHaveBeenCalledWith('paste:item', expect.anything());
  });
});
