import {expect,it,vi} from 'vitest';
import type {Instance,Preset,Response} from '../shared/generated/editorContracts';
import {compatiblePresets,presetKey,readPresets} from './presetModel';
const preset:Preset={id:'demo.warm',version:1,label:'Warm',definitionId:'beam.color',definitionVersion:1,parameters:{}};
const instance:Instance={id:'instance',definitionId:'beam.color',definitionVersion:1,enabled:true,parameters:{}};
it('matches preset definition versions and preserves independently versioned catalogue entries',()=>{
  const other={...preset,version:2,definitionVersion:2};
  expect(compatiblePresets([preset,other],instance)).toEqual([preset]);
  expect(compatiblePresets([preset])).toEqual([]);expect(presetKey(other)).toBe('demo.warm@2');
});
it('reads every page through typed queries without a catalogue count ceiling',async()=>{
  const next={...preset,id:'demo.fade'};
  const query=vi.fn().mockResolvedValueOnce({type:'presets',page:{revision:7,items:[preset],next:1,total:2}}).mockResolvedValueOnce({type:'presets',page:{revision:7,items:[next],next:null,total:2}});
  expect(await readPresets(query)).toEqual([preset,next]);
  expect(query.mock.calls).toEqual([[{kind:'presets',offset:0,limit:128}],[{kind:'presets',offset:1,limit:128}]]);
  expect(await readPresets(async()=>({type:'presets',page:{revision:7,items:[],total:0}}))).toEqual([]);
});
it('rejects service failures, wrong envelopes, stale revisions and invalid pagination',async()=>{
  await expect(readPresets(async()=>({type:'error',error:{code:'invalidRequest',message:'missing catalogue'}}))).rejects.toThrow('missing catalogue');
  await expect(readPresets(async()=>({type:'acknowledged'}))).rejects.toThrow('invalid preset catalogue');
  const query=vi.fn().mockResolvedValueOnce({type:'presets',page:{revision:7,items:[preset],next:1,total:2}}).mockResolvedValueOnce({type:'presets',page:{revision:8,items:[preset],next:null,total:2}});
  await expect(readPresets(query)).rejects.toThrow('changed');
  for(const next of [0,2,3]){
    const response:Response={type:'presets',page:{revision:7,items:[preset],next,total:2}};
    await expect(readPresets(async()=>response)).rejects.toThrow('invalid preset pagination');
  }
});
