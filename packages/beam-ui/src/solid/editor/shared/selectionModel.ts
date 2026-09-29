import type { ClipPlacement, Operation } from './editorTypes';

/** Group representatives keep linked operations from being applied twice. */
export function representatives(clips: ClipPlacement[], ids: string[]): ClipPlacement[] {
  const selected = new Set(ids), groups = new Set<string>();
  return clips.filter(clip => {
    if (!selected.has(clip.id)) return false;
    if (clip.linkGroup && groups.has(clip.linkGroup)) return false;
    if (clip.linkGroup) groups.add(clip.linkGroup);
    return true;
  });
}
export function moveSelection(clips: ClipPlacement[], ids: string[], primary: string, startMs: number): Operation[] {
  const source = clips.find(clip => clip.id === primary);
  if (!source) return [];
  const selected = clips.filter(clip => ids.includes(clip.id));
  const delta = Math.max(-Math.min(...selected.map(clip => clip.startMs), source.startMs), Math.round(startMs-source.startMs));
  return representatives(clips, ids.includes(primary) ? ids : [primary]).map(clip => ({type:'edit',edit:{type:'move',id:clip.id,trackId:clip.trackId,startMs:clip.startMs+delta}}));
}
export function removeSelection(clips: ClipPlacement[], ids: string[]): Operation[] {
  return representatives(clips,ids).map(clip => ({type:'edit',edit:{type:'remove',id:clip.id}}));
}
