import { For, Show, createMemo } from 'solid-js';
import { VirtualList } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import { NumberField, PropertyRow } from './PropertyRow';
import { ValueControl } from './ValueControl';
import type { Binding, Instance, Keyframe, Parameter, Tangent } from '../shared/generated/editorContracts';
import type { EditorState } from '../shared/useEditor';

export function KeyframeControls(props: { editor:EditorState; instance:Instance; parameter:Parameter; binding:Extract<Binding,{kind:'curve'}> }) {
  const TR = useTR('NativeEditor');
  const update = (keyframe:Keyframe) => void props.editor.execute([{type:'keyframeUpdate',clip:props.editor.clip()!.id,instance:props.instance.id,parameter:props.parameter.key,keyframe}]);
  function tangent(key:Keyframe, side:'outgoing'|'incoming', field:keyof Tangent, value:number) {
    if (key.interpolation.kind === 'bezier') update({...key,interpolation:{...key.interpolation,[side]:{...key.interpolation[side],[field]:value}}});
  }
  return <column width="100%" gap={8}>
    <VirtualList id={`keyframes-${props.instance.id}-${props.parameter.key}`} width="100%" height={Math.min(300,props.binding.keys.length*160)} count={props.binding.keys.length}
      estimate={160} variable dataVersion={props.editor.snapshot()?.revision} itemKey={index=>props.binding.keys[index].id}
      renderItem={index => {const key=createMemo(()=>props.binding.keys[index]); return <column width="100%" gap={5} padding={6}>
      <PropertyRow label={TR('keyframeTime')}><NumberField label={TR('keyframeTime')} value={key().time.ticks/key().time.timescale} min={-Number.MAX_SAFE_INTEGER/1000000} max={Number.MAX_SAFE_INTEGER/1000000}
        onChange={value => update({...key(),time:{ticks:Math.round(value*1000000),timescale:1000000}})} /></PropertyRow>
      <ValueControl id={`keyframe-value-${key().id}`} parameter={props.parameter} value={key().value} onChange={value => update({...key(),value})} />
      <Select id={`interpolation-${key().id}`} label={TR('interpolation')} value={key().interpolation.kind} options={[
        {value:'constant',label:TR('hold')},
        ...(['boolean','choice','text'].includes(key().value.kind) ? [] : [{value:'linear',label:TR('linear')},{value:'bezier',label:TR('bezier')}]),
      ]} onValueChange={kind => update({...key(),interpolation:kind === 'bezier' ? {kind:'bezier',outgoing:{time:0.33,value:0},incoming:{time:0.33,value:0}} : {kind:kind as 'constant'|'linear'}})} />
      <Show when={key().interpolation.kind === 'bezier'}><For each={['outgoing','incoming'] as const}>{side => <row width="100%" gap={4}>
        <For each={['time','value'] as const}>{field => <container grow={1} minWidth={0}><NumberField label={TR(`${side}${field === 'time' ? 'Time' : 'Value'}`)} min={0} max={1}
          value={key().interpolation.kind === 'bezier' ? (key().interpolation as Extract<Keyframe['interpolation'],{kind:'bezier'}>)[side][field] : 0} onChange={value => tangent(key(),side,field,value)} /></container>}</For>
      </row>}</For></Show>
      <Button variant="ghost" size="xs" onClick={() => void props.editor.execute([{type:'keyframeRemove',clip:props.editor.clip()!.id,instance:props.instance.id,parameter:props.parameter.key,keyframeId:key().id}])}>{TR('delete')}</Button>
    </column>; }} />
  </column>;
}
