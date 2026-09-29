import { expect, it } from 'vitest';
import { dragRegion, regionWindow } from './regionModel';
import { defaultEffects } from '../shared/defaults';
import type { Clip } from '../shared/editorTypes';
const clip: Clip = { id:'clip',assetId:'asset',trackId:'video',startMs:1000,sourceInMs:0,durationMs:3000,effects:defaultEffects };
it('draws rational sequence ranges without changing their stored clocks',()=>{
  const region={id:'fx',target:{kind:'clip' as const,sequenceId:'sequence',clipId:'clip'},definitionId:'beam.camera.zoom',definitionVersion:1,name:null,enabled:true,kind:'effect' as const,start:{ticks:30000,timescale:30000},end:{ticks:90000,timescale:30000}};
  expect(regionWindow(region)).toEqual({startMs:1000,endMs:3000});
  expect(region.start).toEqual({ticks:30000,timescale:30000});
});
it.each([['move',1000,2000,4000],['move',-1000,1000,3000],['move',100,1600,3600],['start',-5000,1000,3500],['start',5000,3499,3500],['start',100,1600,3500],['end',5000,1500,4000],['end',-5000,1500,1501],['end',100,1500,3600]] as const)
  ('bounds %s by the visible clip without replacing animation space', (gesture,delta,startMs,endMs)=>expect(dragRegion({startMs:1500,endMs:3500},clip,delta,gesture)).toEqual({startMs,endMs}));
it('preserves a submillisecond range when a handle reaches the other edge',()=>{
  expect(dragRegion({startMs:1500,endMs:1500.5},clip,100,'start')).toEqual({startMs:1500,endMs:1500.5});
  expect(dragRegion({startMs:1500,endMs:1500.5},clip,-100,'end')).toEqual({startMs:1500,endMs:1500.5});
});
