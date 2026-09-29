import { Show, createEffect, createSignal } from 'solid-js';
import { Button } from '../../shared/base-ui/button';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import { PropertyRow } from './PropertyRow';
import { ValueControl } from './ValueControl';
import { KeyframeControls } from './KeyframeControls';
import { bindingValue } from './instanceModel';
import { definitionLabel } from './definitionLabels';
import type { Binding, Instance, Interpolation, Parameter, TimeSpace, Value } from '../shared/generated/editorContracts';
import type { EditorState } from '../shared/useEditor';

/** Parameter values at the playhead come from the Rust evaluator shared with rendering. */
export function ParameterControl(props: { editor:EditorState; instance:Instance; parameter:Parameter }) {
  const TR = useTR('NativeEditor'), binding = () => props.instance.parameters[props.parameter.key];
  const [value,setValue] = createSignal<Value>(bindingValue(binding(),props.parameter));
  const [expanded,setExpanded] = createSignal(false), [space,setSpace] = createSignal<TimeSpace>('clipLocal');
  createEffect(() => setValue(props.editor.parameterValues()[props.instance.id]?.[props.parameter.key] ?? bindingValue(binding(),props.parameter)));
  const submit = () => void props.editor.execute([{type:'parameterSet',clip:props.editor.clip()!.id,instance:props.instance.id,
    parameter:props.parameter.key,binding:{kind:'constant',value:value()}}]);
  const keyframe = () => void props.editor.execute([{type:'keyframeAt',clip:props.editor.clip()!.id,instance:props.instance.id,
    parameter:props.parameter.key,space:binding()?.kind === 'curve' ? (binding() as Extract<Binding,{kind:'curve'}>).space : space(),
    sequenceTime:{ticks:props.editor.transport().positionMs,timescale:1000},value:value(),
    interpolation:{kind:['boolean','choice','text'].includes(value().kind) ? 'constant' : 'linear'} as Interpolation}]);
  return <column width="100%" gap={6}>
    <PropertyRow label={definitionLabel(props.parameter.label,TR)}>
      <ValueControl id={`parameter-${props.instance.id}-${props.parameter.key}`} parameter={props.parameter} value={value()} onChange={setValue} />
    </PropertyRow>
    <Show when={props.parameter.animatable}><Select id={`space-${props.instance.id}-${props.parameter.key}`} label={TR('timeSpace')}
      value={binding()?.kind === 'curve' ? (binding() as Extract<Binding,{kind:'curve'}>).space : space()}
      options={(['source','clipLocal','sequence'] as const).map(value => ({value,label:TR(value)}))}
      onValueChange={value => {if (binding()?.kind === 'curve') void props.editor.execute([{type:'curveSpace',clip:props.editor.clip()!.id,instance:props.instance.id,parameter:props.parameter.key,space:value as TimeSpace}]);else setSpace(value as TimeSpace);}} /></Show>
    <row width="100%" gap={5}>
      <Button variant="secondary" size="xs" grow={1} onClick={submit}>{TR(binding()?.kind === 'curve' ? 'replaceCurve' : 'setValue')}</Button>
      <Show when={props.parameter.animatable}><Button variant="secondary" size="xs" grow={1} onClick={keyframe}>{TR('addKeyframe')}</Button></Show>
      <Show when={binding()?.kind === 'curve'}><Button variant="ghost" size="xs" onClick={() => setExpanded(!expanded())}>{TR('keys')}</Button></Show>
    </row>
    <Show when={expanded() && binding()?.kind === 'curve'}>
      <KeyframeControls editor={props.editor} instance={props.instance} parameter={props.parameter} binding={binding() as Extract<Binding,{kind:'curve'}>} />
    </Show>
  </column>;
}
