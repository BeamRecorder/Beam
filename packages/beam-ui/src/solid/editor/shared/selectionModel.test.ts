import { expect, it } from 'vitest';
import { moveSelection, representatives, removeSelection } from './selectionModel';
import { defaultEffects } from './defaults';
import type { Clip } from './editorTypes';
const a:Clip={id:'a',assetId:'asset',trackId:'video',startMs:1000,sourceInMs:0,durationMs:1000,effects:defaultEffects,linkGroup:'av'};
const b:Clip={...a,id:'b',trackId:'audio'}, c:Clip={...a,id:'c',startMs:3000,linkGroup:null};
it('submits each linked group once, retaining independent selected clips',()=>expect(representatives([a,b,c],['a','b','c'])).toEqual([a,c]));
it('uses a selected linked member even when the first group member was not selected',()=>expect(representatives([a,b,c],['b','missing'])).toEqual([b]));
it('does no work for an empty selection',()=>{expect(representatives([a,b],[])).toEqual([]);expect(removeSelection([a,b],[])).toEqual([]);});
it('moves selected groups by one common delta and clamps the earliest start',()=>{
  const operations=moveSelection([a,b,c],['a','b','c'],'c',0);
  expect(operations).toEqual([{type:'edit',edit:{type:'move',id:'a',trackId:'video',startMs:0}},{type:'edit',edit:{type:'move',id:'c',trackId:'video',startMs:2000}}]);
});
it('moves an unselected primary alone and rejects a missing primary',()=>{
  expect(moveSelection([a,b,c],['c'],'a',2000)).toEqual([{type:'edit',edit:{type:'move',id:'a',trackId:'video',startMs:2000}}]);
  expect(moveSelection([a],['a'],'missing',2000)).toEqual([]);
});
it('deletes group representatives only, preserving all other decisions',()=>expect(removeSelection([a,b,c],['a','b'])).toEqual([{type:'edit',edit:{type:'remove',id:'a'}}]));
