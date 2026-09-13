import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clip, ShapeClip } from '~/media/shared/composition-types';
import { defaultShapePresetFor, normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import type { ShapeLayerFamily } from '~/media/shared/shape-layer-types';
import TimelineTrackHeaders from '../TimelineTrackHeaders.vue';
import type { VisualTimelineTrack } from '../composables/timeline-tracks-types';

const wrappers: VueWrapper[] = [];

const makeElement = (family: ShapeLayerFamily): ShapeClip => {
  const id = `${family}-element`;
  return {
    ...normalizeShapeLayerStyle({ family, preset: defaultShapePresetFor(family) }),
    id,
    kind: 'shape',
    name: `${family} layer`,
    trackId: id,
    assetId: '',
    timelineStartMs: 0,
    timelineDurationMs: 1_000,
    sourceInMs: 0,
    sourceDurationMs: 1_000,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.3 },
  };
};

const mountHeader = (clip: ShapeClip) => {
  const track: VisualTimelineTrack = {
    id: clip.trackId!,
    clips: [clip],
    representative: clip,
    order: clip.order,
  };
  const selectTrack = vi.fn((_clips: Clip[], _trackName: string, _event?: MouseEvent) => undefined);
  const wrapper = mount(TimelineTrackHeaders, {
    props: {
      visualTracks: [track],
      keyboardCaptionClips: [],
      textCaptionLayers: [],
      systemAudioClips: [],
      microphoneClips: [],
      voiceoverClips: [],
      hasVoiceoverDraft: false,
      importedAudioTracks: [],
      includeAudioInExport: true,
      draggedTrackId: null,
      draggedCaptionId: null,
      zoomElements: [],
      selectedClipIds: [],
      selectedZoomIds: [],
      selectTrack,
      selectZoomTrack: vi.fn(),
      beginReorder: vi.fn(),
      beginCaptionReorder: vi.fn(),
      openTrackContextMenu: vi.fn(),
    },
  });
  wrappers.push(wrapper);
  return { wrapper, selectTrack, clip };
};

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('TimelineTrackHeaders element families', () => {
  it.each([
    ['shape', 'Shape', 'lucide-shapes'],
    ['arrow', 'Arrow', 'lucide-arrow-right'],
    ['text', 'Text', 'lucide-type'],
    ['drawing', 'Draw', 'lucide-pencil'],
  ] as const)('shows the %s family label and icon and passes the label when selected', async (family, label, icon) => {
    const mounted = mountHeader(makeElement(family));
    const header = mounted.wrapper.get('.visual-track');

    expect(header.get('.track-title').text()).toBe(label);
    expect(header.get('.track-icon').classes()).toContain(icon);

    await header.get('button.track-info').trigger('click');

    expect(mounted.selectTrack.mock.calls[0]?.[0]).toEqual([mounted.clip]);
    expect(mounted.selectTrack.mock.calls[0]?.[1]).toBe(label);
  });
});
