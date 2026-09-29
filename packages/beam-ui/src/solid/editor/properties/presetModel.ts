import type {Instance,Preset,Query,Response} from '../shared/generated/editorContracts';

export function compatiblePresets(presets:readonly Preset[],instance?:Instance):Preset[] {
  return presets.filter(preset=>preset.definitionId===instance?.definitionId && preset.definitionVersion===instance.definitionVersion);
}
export function presetKey(preset:Preset):string{return `${preset.id}@${preset.version}`;}

/** Page through the shared catalogue; no built-in decisions are duplicated in the UI. */
export async function readPresets(query:(query:Query)=>Promise<Response>):Promise<Preset[]> {
  const values:Preset[]=[];let offset=0,revision:number|undefined;
  for(;;) {
    const response=await query({kind:'presets',offset,limit:128});
    if(response.type==='error')throw new Error(response.error.message);
    if(response.type!=='presets')throw new Error('The editor returned an invalid preset catalogue');
    const page=response.page;
    if(revision!==undefined && page.revision!==revision)throw new Error('Preset catalogue changed while being read');
    revision=page.revision;values.push(...page.items);
    if(page.next===null || page.next===undefined)return values;
    if(page.next<=offset || page.next!==offset+page.items.length || page.next>=page.total)throw new Error('The editor returned invalid preset pagination');
    offset=page.next;
  }
}
