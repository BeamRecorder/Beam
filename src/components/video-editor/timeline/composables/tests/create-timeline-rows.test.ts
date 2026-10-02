import { describe, expect, it } from 'vitest';
import { createTimelineRows } from '../create-timeline-rows';
import { groupVisualTimelineTracks } from '../visual-timeline-tracks';
import { groupImportedAudioTimelineTracks } from '../audio-timeline-tracks';
import { groupTextCaptionLayers } from '../../../composition/engine/caption-layer-layout';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import type { CaptionClip, AudioClip } from '~/media/shared/composition-types';
import type { TimelineRowsOptions } from '../timeline-virtualization-types';
import { videoClip } from '~/media/playback/tests/media-playback-engine.fixtures';

const empty = (): TimelineRowsOptions => ({
  visualTracks: [],
  zooms: [],
  keyboard: [],
  textLayers: [],
  system: [],
  microphone: [],
  voiceovers: [],
  importedAudio: [],
  canvasTransition: false,
  voiceoverDraft: false,
});
const audio = (id: string, role: AudioClip['role']): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId: 'audio',
  role,
  volume: 100,
  order: 0,
  enabled: true,
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
});
const caption = (id: string, layer: string): CaptionClip => ({
  id,
  kind: 'caption',
  name: id,
  captionLayerId: layer,
  order: 0,
  enabled: true,
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  caption: { type: 'text', style: createDefaultCaptionStyle(), sentences: [] },
});
describe('shared timeline row model', () => {
  it('reserves the empty zoom and caption lanes without fabricating media', () => {
    expect(createTimelineRows(empty())).toEqual([
      { id: 'zoom', kind: 'effect', clips: [], zooms: [] },
      { id: 'caption:empty', kind: 'effect', clips: [] },
    ]);
  });
  it('preserves category order and the correct height category across every audio lane and canvas transitions', () => {
    const visual = groupVisualTimelineTracks([videoClip('video', 'asset-1', { trackId: 'lane' })]);
    const imported = groupImportedAudioTimelineTracks([audio('imported', 'imported')]);
    const rows = createTimelineRows({
      ...empty(),
      visualTracks: visual,
      keyboard: [caption('keyboard', 'keyboard')],
      system: [audio('system', 'system')],
      microphone: [audio('mic', 'microphone')],
      voiceovers: [audio('voice', 'voiceover')],
      importedAudio: imported,
      canvasTransition: true,
      voiceoverDraft: true,
    });
    expect(rows.map((row) => row.id)).toEqual([
      'canvas',
      'visual:lane',
      'zoom',
      'keyboard',
      'caption:empty',
      'system',
      'microphone',
      'voiceover:voice',
      'draft',
      `imported:${imported[0]!.id}`,
    ]);
    expect(rows[0]!.kind).toBe('visual');
    expect(rows.slice(5).every((row) => row.kind === 'audio')).toBe(true);
  });
  it('uses complete immutable caption and visual lane arrays for global selection', () => {
    const visual = groupVisualTimelineTracks([videoClip('video', 'asset-1', { trackId: 'lane' })]);
    const textLayers = groupTextCaptionLayers([
      caption('one', 'text'),
      { ...caption('two', 'text'), timelineStartMs: 1000 },
    ]);
    const rows = createTimelineRows({ ...empty(), visualTracks: visual, textLayers });
    expect(rows.find((row) => row.id === 'visual:lane')!.clips).toBe(visual[0]!.clips);
    expect(rows.find((row) => row.id === `caption:${textLayers[0]!.id}`)!.clips).toBe(textLayers[0]!.clips);
    expect(rows.some((row) => row.id === 'caption:empty')).toBe(false);
  });
});
