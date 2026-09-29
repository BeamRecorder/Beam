import type { Project } from '../shared/editorTypes';

/** UI selects two inputs; the domain validates media handles and processor support. */
export function transitionPair(project:Project|undefined, selected:readonly string[]):[string,string]|undefined {
  if(!project || selected.length<1 || selected.length>2)return;
  const first=project.clips.find(c=>c.id===selected[0]);if(!first)return;
  const second=selected.length===2 ? project.clips.find(c=>c.id===selected[1])
    : project.clips.find(c=>c.trackId===first.trackId && c.startMs===first.startMs+first.durationMs);
  if(!second || first.trackId!==second.trackId)return;
  const [from,to]=first.startMs<second.startMs ? [first,second] : [second,first];
  return from.startMs+from.durationMs===to.startMs ? [from.id,to.id] : undefined;
}
