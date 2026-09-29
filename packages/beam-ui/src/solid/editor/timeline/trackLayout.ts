import type { Clip, Project } from '../shared/editorTypes';

/** Text and audio rows remain compact; video rows reserve room for real source thumbnails. */
export function trackLayout(project?: Project) {
  let y = 28;
  return (project?.tracks ?? []).map(track => {
    const clips = project!.clips.filter(clip => clip.trackId === track.id);
    const text = clips.length > 0 && clips.every(clip => !!clip.title);
    const height = track.kind === 'audio' ? 54 : text ? 44 : 102;
    const row = { track, height, y, text }; y += height; return row;
  });
}
export function clipLabel(clip: Clip, project: Project): string {
  return clip.title?.text ?? project.assets.find(asset => asset.id === clip.assetId)?.name ?? '';
}
