import {expect,it} from 'vitest';
import type {NativeEventPayload} from '@argui/host';
import {timelineShortcut} from './timelineShortcut';
const key=(key:string,options:Partial<NativeEventPayload<'key'>>={}):NativeEventPayload<'key'>=>({kind:'key',key,state:'pressed',text:null,repeat:false,shift:false,control:false,super:false,alt:false,...options});

it('handles timeline editing accelerators on both primary modifier conventions',()=>{
  for(const modifier of [{control:true},{super:true}]) {
    for(const [input,action] of [['z','undo'],['A','selectAll'],['c','copy'],['v','paste']])expect(timelineShortcut(key(input,modifier),false)).toBe(action);
    expect(timelineShortcut(key('z',{...modifier,shift:true}),false)).toBe('redo');
    expect(timelineShortcut(key('Space',modifier),false)).toBeUndefined();
  }
});
it('handles transport, removal and cancellation without consuming unrelated keys',()=>{
  for(const [input,action] of [['Space','play'],[' ','play'],['Delete','remove'],['Escape','cancel']])expect(timelineShortcut(key(input),false)).toBe(action);
  expect(timelineShortcut(key('Enter'),false)).toBeUndefined();
});
it('ignores released, repeating, alternate and blocked keys',()=>{
  for(const options of [{state:'released' as const},{repeat:true},{alt:true}])expect(timelineShortcut(key('Delete',options),false)).toBeUndefined();
  expect(timelineShortcut(key('Delete'),true)).toBeUndefined();
});
