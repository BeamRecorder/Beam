import type { TimelineVirtualRow, TimelineRowsOptions } from './timeline-virtualization-types';

export function createTimelineRows(options: TimelineRowsOptions): TimelineVirtualRow[] {
  const rows: TimelineVirtualRow[] = [];
  if (options.canvasTransition) rows.push({ id: 'canvas', kind: 'visual', clips: [] });
  for (const track of options.visualTracks) rows.push({ id: `visual:${track.id}`, kind: 'visual', clips: track.clips });
  rows.push({ id: 'zoom', kind: 'effect', clips: [], zooms: options.zooms });
  if (options.keyboard.length) rows.push({ id: 'keyboard', kind: 'effect', clips: options.keyboard });
  for (const layer of options.textLayers)
    rows.push({
      id: `caption:${layer.id}`,
      kind: 'effect',
      clips: layer.clips,
    });
  if (!options.textLayers.length) rows.push({ id: 'caption:empty', kind: 'effect', clips: [] });
  if (options.system.length) rows.push({ id: 'system', kind: 'audio', clips: options.system });
  if (options.microphone.length) rows.push({ id: 'microphone', kind: 'audio', clips: options.microphone });
  for (const clip of options.voiceovers) rows.push({ id: `voiceover:${clip.id}`, kind: 'audio', clips: [clip] });
  if (options.voiceoverDraft) rows.push({ id: 'draft', kind: 'audio', clips: [] });
  for (const track of options.importedAudio)
    rows.push({
      id: `imported:${track.id}`,
      kind: 'audio',
      clips: track.clips,
    });
  return rows;
}
