import type { Asset, Clip, Effects, Project } from '../shared/editorTypes';
import type { EffectPreset, MediaFilter } from './libraryTypes';

export const filters: readonly EffectPreset[] = [
  { id: 'original', values: { brightness: 0, saturation: 1 } },
  { id: 'vivid', values: { brightness: 0.03, saturation: 1.3 } },
  { id: 'monochrome', values: { brightness: 0, saturation: 0 } },
  { id: 'soft', values: { brightness: 0.08, saturation: 0.75 } },
];
export const effects: readonly EffectPreset[] = [
  { id: 'automatic', values: { autoZoom: true } },
  { id: 'staticFrame', values: { autoZoom: false } },
  { id: 'transparent', values: { opacity: 0.5 } },
  { id: 'fullOpacity', values: { opacity: 1 } },
];

/** Filters actual source metadata; recordings are the generated capture shelf. */
export function mediaFor(assets: readonly Asset[], filter: MediaFilter, query = ''): Asset[] {
  return assets.filter(asset =>
    (filter === 'all' || (filter === 'video' && asset.hasVideo && !asset.isImage) || (filter === 'audio' && asset.hasAudio && !asset.hasVideo)
      || (filter === 'images' && asset.isImage) || (filter === 'recordings' && asset.recording))
    && asset.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
}

/** Selects a compatible lane and its first free append position. */
export function insertion(project: Project, asset: Asset): { trackId: string; startMs: number } | undefined {
  const track = project.tracks.find(track => track.kind === (asset.hasVideo ? 'video' : 'audio'));
  if (!track) return;
  return { trackId: track.id, startMs: Math.max(0, ...project.clips.filter(clip => clip.trackId === track.id).map(clip => clip.startMs + clip.durationMs)) };
}

/** Presets retain the clip's unrelated settings and fit fade durations to the actual clip. */
export function presetEffects(clip: Clip, values: Partial<Effects>): Effects {
  const next = { ...clip.effects, ...values };
  const duration = clip.durationMs;
  next.fadeInMs = Math.max(0, Math.min(duration, next.fadeInMs ?? 0));
  next.fadeOutMs = Math.max(0, Math.min(duration - next.fadeInMs, next.fadeOutMs ?? 0));
  return next;
}
