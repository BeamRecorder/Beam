import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Clip,Snapshot} from './editorTypes';
import {defaultEffects} from './defaults';
import {disposers,flush,mount} from './useEditor.testSupport';

beforeEach(()=>{vi.useFakeTimers();vi.spyOn(console,'error').mockImplementation(()=>undefined);});
afterEach(()=>{for(const dispose of disposers.splice(0))dispose();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
function detail(snapshot:Snapshot,id='clip'):Clip {
  return {...snapshot.project.clips.find(clip=>clip.id===id)!,effects:defaultEffects,instances:[],rate:{numerator:1,denominator:1},animationOffsetMs:0,linkGroup:null,generator:null,cursorStyle:null,title:null};
}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((done,failed)=>{resolve=done;reject=failed;});return {promise,resolve,reject};}

it('coordinates additive selection, scoped gestures and native multi-clip commands',async()=>{
  const {editor,call,setDocument}=mount();await flush();const before=editor.snapshot()!;
  const other={...before.project.clips[0],id:'other',startMs:1000};
  setDocument({...before,project:{...before.project,clips:[...before.project.clips,other]}});await editor.open();
  editor.modifiers(true);expect(editor.additive()).toBe(true);editor.select('clip');editor.select('other',true);
  expect(editor.selectedIds()).toEqual(['clip','other']);editor.select('other',true);expect(editor.selectedIds()).toEqual(['clip']);
  editor.selectAll();expect(editor.selectedIds()).toEqual(['clip','other']);expect(editor.selected()).toBe('other');
  editor.cancelGesture();expect(editor.gestureVersion()).toBe(1);
  await editor.moveSelection('clip',250);await editor.removeSelection();
  const batches=call.mock.calls.filter(call=>call[1]==='commands').map(call=>call[2]?.commands);
  expect(batches).toEqual([
    [{commandId:'command-0',operation:{type:'edit',edit:{type:'move',id:'clip',trackId:'video',startMs:250}}},{commandId:'command-1',operation:{type:'edit',edit:{type:'move',id:'other',trackId:'video',startMs:1250}}}],
    [{commandId:'command-0',operation:{type:'edit',edit:{type:'remove',id:'clip'}}},{commandId:'command-1',operation:{type:'edit',edit:{type:'remove',id:'other'}}}],
  ]);
  editor.select(undefined);expect(editor.selectedIds()).toEqual([]);expect(editor.removeSelection()).toBeUndefined();
  editor.reportError('native diagnostics');expect(editor.error()).toBe('native diagnostics');
});

it('copies across sequences using explicit lane maps and creates missing compatible lanes',async()=>{
  const {editor,call,setDocument}=mount();await flush();expect(editor.paste()).toBeUndefined();editor.copy();
  editor.select('clip');editor.copy();await editor.paste();
  let commands=call.mock.calls.filter(call=>call[1]==='commands').at(-1)![2]?.commands;
  expect(commands).toEqual([{commandId:'command-0',operation:{type:'pasteMapped',clips:['clip'],sourceSequence:'sequence',trackMap:{video:'video'},startMs:0}}]);
  const current=editor.snapshot()!;
  setDocument({...current,activeSequence:'other',project:{...current.project,tracks:[{...current.project.tracks[0],id:'mapped'}]}});await editor.open();await editor.paste();
  commands=call.mock.calls.filter(call=>call[1]==='commands').at(-1)![2]?.commands;
  expect(commands).toEqual([{commandId:'command-0',operation:{type:'pasteMapped',clips:['clip'],sourceSequence:'sequence',trackMap:{video:'mapped'},startMs:0}}]);
  setDocument({...current,activeSequence:'empty',project:{...current.project,clips:[],tracks:[]}});await editor.open();await editor.paste();
  commands=call.mock.calls.filter(call=>call[1]==='commands').at(-1)![2]?.commands;
  expect(commands).toEqual([
    {commandId:'command-0',operation:{type:'edit',edit:{type:'addTrack',name:'Video',kind:'video'}}},
    {commandId:'command-1',operation:{type:'pasteMapped',clips:['clip'],sourceSequence:'sequence',trackMap:{video:{createdBy:'command-0'}},startMs:0}},
  ]);
});

it('hydrates an instance selected from the timeline and clears removed instances on revision changes',async()=>{
  const {editor,responses}=mount();await flush();const before=editor.snapshot()!;const clip=detail(before);
  const instance={id:'effect',definitionId:'beam.opacity',definitionVersion:1,enabled:true,range:null,parameters:{opacity:{kind:'constant',value:{kind:'number',value:0.5}}}} as const;
  responses.set('query',async payload=>payload?.kind==='clip'?{type:'clip',revision:editor.snapshot()!.revision,clip:{...clip,instances:[instance]}}:{type:'parameterValues',values:{effect:{opacity:{kind:'number',value:0.5}}}});
  editor.selectEffect('clip','effect');await flush();expect(editor.selectedEffect()).toBe('effect');expect(editor.clip()?.instances?.[0].id).toBe('effect');expect(editor.parameterValues().effect.opacity).toEqual({kind:'number',value:0.5});
  responses.set('query',async payload=>payload?.kind==='clip'?{type:'clip',revision:editor.snapshot()!.revision,clip}:{type:'parameterValues',values:{}});
  await editor.edit({type:'effectRemove',clipId:'clip',instanceId:'effect'});await flush();expect(editor.selectedEffect()).toBeUndefined();
});

it('selects a real two-input transition and preserves only transitions still present after a commit',async()=>{
  const {editor,setDocument}=mount();await flush();const before=editor.snapshot()!;
  const transition={fromClip:'clip',toClip:'next',durationMs:500,instance:{id:'transition',definitionId:'beam.crossfade',definitionVersion:1,enabled:true,range:null,parameters:{}}};
  setDocument({...before,project:{...before.project,transitions:[transition]}});await editor.open();
  editor.selectTransition('missing');expect(editor.selectedTransition()).toBeUndefined();editor.selectTransition('transition');await flush();
  expect(editor.selected()).toBe('clip');expect(editor.selectedTransition()).toBe('transition');await editor.edit({type:'rename',name:'Same transition'});await flush();expect(editor.selectedTransition()).toBe('transition');
  setDocument({...editor.snapshot()!,project:{...editor.snapshot()!.project,transitions:[]}});await editor.open();expect(editor.selectedTransition()).toBeUndefined();
});

it('rejects stale clip details after the selected clip or accepted revision changes',async()=>{
  const {editor,responses,setDocument}=mount();await flush();const before=editor.snapshot()!;
  const pending=deferred<unknown>();responses.set('query',async payload=>payload?.kind==='clip'?pending.promise:{type:'parameterValues',values:{}});
  editor.select('clip');await flush();expect(editor.clipLoading()).toBe(true);expect(editor.placement()?.id).toBe('clip');expect(editor.clip()).toBeUndefined();
  const other={...before.project.clips[0],id:'other'};setDocument({...before,revision:1,project:{...before.project,clips:[other]}});await editor.open();editor.select('other');await flush();
  responses.set('query',async()=>({type:'clip',revision:editor.snapshot()!.revision,clip:detail({...before,project:{...before.project,clips:[other]}},'other')}));
  pending.resolve({type:'clip',revision:editor.snapshot()!.revision,clip:detail(before)});await flush();expect(editor.clip()).toBeUndefined();expect(editor.selected()).toBe('other');
  setDocument({...editor.snapshot()!,revision:2});await editor.refresh();await flush();expect(editor.clip()?.id).toBe('other');expect(editor.clipLoading()).toBe(false);
});

it.each(['error','invalid','rejected'] as const)('reports %s inspector responses and releases loading without replacing placement',async mode=>{
  const {editor,responses}=mount();await flush();
  responses.set('query',async()=>{
    if(mode==='rejected')throw new Error('missing FX page');
    return mode==='error'?{type:'error',error:{message:'damaged FX payload'}}:{type:'transport',transport:{}};
  });
  editor.select('clip');await flush();expect(editor.clip()).toBeUndefined();expect(editor.placement()?.id).toBe('clip');expect(editor.clipLoading()).toBe(false);
  expect(editor.error()).toMatch(/missing FX page|damaged FX payload|invalid clip response/);
});

it('drops late inspector errors and values after selection cleanup and disposal',async()=>{
  const {editor,responses}=mount();await flush();const before=editor.snapshot()!;const pending=deferred<unknown>();
  responses.set('query',()=>pending.promise);editor.select('clip');await flush();editor.select(undefined);pending.reject(new Error('obsolete failure'));await flush();expect(editor.error()).toBe('');
  const next=deferred<unknown>();responses.set('query',()=>next.promise);editor.select('clip');await flush();disposers.pop()!();next.resolve({type:'clip',revision:editor.snapshot()!.revision,clip:detail(before)});await flush();expect(editor.clip()).toBeUndefined();
  editor.reportError('after disposal');expect(editor.error()).toBe('');await editor.edit({type:'undo'});expect(editor.snapshot()?.revision).toBe(0);
});

it('reports parameter evaluation errors and hides stale values when the window is hidden',async()=>{
  const {editor,responses,event}=mount();await flush();const clip=detail(editor.snapshot()!);
  responses.set('query',async payload=>{if(payload?.kind==='clip')return {type:'clip',revision:editor.snapshot()!.revision,clip};throw new Error('evaluation failed');});
  editor.select('clip');await flush();expect(editor.error()).toContain('evaluation failed');
  responses.set('query',async payload=>payload?.kind==='clip'?{type:'clip',revision:editor.snapshot()!.revision,clip}:{type:'parameterValues',values:{effect:{opacity:{kind:'number',value:0.8}}}});
  await editor.seek(200);await flush();expect(editor.parameterValues().effect.opacity).toEqual({kind:'number',value:0.8});
  event({type:'windowVisibility',window:'main',visible:false});await flush();expect(editor.parameterValues()).toEqual({});
});

it.each(['error','invalid'] as const)('reports a structured %s parameter response without showing fabricated values',async mode=>{
  const {editor,responses}=mount();await flush();const clip=detail(editor.snapshot()!);
  responses.set('query',async payload=>payload?.kind==='clip'?{type:'clip',revision:editor.snapshot()!.revision,clip}:mode==='error'?{type:'error',error:{message:'curve page is damaged'}}:{type:'transport',transport:{}});
  editor.select('clip');await flush();expect(editor.parameterValues()).toEqual({});
  expect(editor.error()).toContain(mode==='error'?'curve page is damaged':'invalid parameter response');
});

it('refreshes the accepted snapshot before showing details from a newer writer revision',async()=>{
  const {editor,responses,setDocument,call}=mount();await flush();const before=editor.snapshot()!;
  const next={...before,revision:3};setDocument(next);
  responses.set('query',async payload=>payload?.kind==='clip'?{type:'clip',revision:3,clip:detail(next)}:{type:'parameterValues',values:{}});
  editor.select('clip');await flush();expect(editor.snapshot()?.revision).toBe(3);expect(editor.clip()?.id).toBe('clip');
  expect(call.mock.calls.filter(call=>call[1]==='snapshot')).toHaveLength(1);
});

it.each(['identity','revision'] as const)('rejects a mismatched clip %s without showing incorrect inspector values',async field=>{
  const {editor,responses,setDocument}=mount();await flush();const before=editor.snapshot()!;const current={...before,revision:2};
  setDocument(current);await editor.open();
  responses.set('query',async()=>({type:'clip',revision:field==='revision'?1:2,clip:{...detail(current),id:field==='identity'?'other':'clip'}}));
  editor.select('clip');await flush();expect(editor.clip()).toBeUndefined();expect(editor.placement()?.id).toBe('clip');expect(editor.clipLoading()).toBe(false);
  expect(editor.error()).toContain(field==='identity'?'different clip':'stale clip details');
});

it('refreshes a paused editor from an accepted external writer notification and preserves selection',async()=>{
  const {editor,event,setDocument,call}=mount();await flush();editor.select('clip');await flush();const before=editor.snapshot()!;
  setDocument({...before,revision:2,project:{...before.project,name:'External writer'}});
  event({type:'editorChanged',projectId:before.project.id,sequenceId:before.activeSequence,revision:2});await flush();
  expect(editor.snapshot()?.revision).toBe(2);expect(editor.snapshot()?.project.name).toBe('External writer');expect(editor.selected()).toBe('clip');
  expect(call.mock.calls.filter(call=>call[1]==='snapshot')).toHaveLength(1);
});

it('ignores other projects, stale revisions and malformed editor notifications',async()=>{
  const {editor,event,call,setDocument}=mount();await flush();const before=editor.snapshot()!;setDocument({...before,revision:3});await editor.open();
  for(const value of [{projectId:'other',sequenceId:'sequence',revision:4},{projectId:before.project.id,sequenceId:'other',revision:2},{projectId:before.project.id,sequenceId:'sequence',revision:-1},{projectId:before.project.id,sequenceId:'sequence',revision:NaN}]){event({type:'editorChanged',...value});await flush();}
  expect(editor.snapshot()?.revision).toBe(3);expect(call.mock.calls.filter(call=>call[1]==='snapshot')).toHaveLength(0);
});

it('coalesces external changes while hidden and refreshes once when the native window becomes visible',async()=>{
  const {editor,event,call,setDocument}=mount();await flush();const before=editor.snapshot()!;
  event({type:'windowVisibility',window:'main',visible:false});await flush();setDocument({...before,revision:5});
  for(const revision of [3,5,4])event({type:'editorChanged',projectId:before.project.id,sequenceId:before.activeSequence,revision});await flush();
  expect(call.mock.calls.filter(call=>call[1]==='snapshot')).toHaveLength(0);
  event({type:'windowVisibility',window:'main',visible:true});await flush();expect(editor.snapshot()?.revision).toBe(5);
  expect(call.mock.calls.filter(call=>call[1]==='snapshot')).toHaveLength(1);
});

it('waits for a pending native edit before applying a newer external writer snapshot',async()=>{
  const {editor,event,responses,setDocument,call}=mount();await flush();const before=editor.snapshot()!;const pending=deferred<Snapshot>();
  responses.set('edit',()=>pending.promise);const editing=editor.edit({type:'rename',name:'Own write'});await flush();setDocument({...before,revision:2});
  event({type:'editorChanged',projectId:before.project.id,sequenceId:before.activeSequence,revision:2});await flush();expect(call.mock.calls.filter(call=>call[1]==='snapshot')).toHaveLength(0);
  pending.resolve({...before,revision:1});await editing;await flush();expect(editor.snapshot()?.revision).toBe(2);
  expect(call.mock.calls.filter(call=>call[1]==='snapshot')).toHaveLength(1);
});
