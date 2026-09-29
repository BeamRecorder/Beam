import { For, Show, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import { Switch, type WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import { NumberField, PropertyRow } from './PropertyRow';
import { ParameterControl } from './ParameterControl';
import { definitionLabel } from './definitionLabels';
import { transitionPair } from './transitionModel';
import { PresetControls } from './PresetControls';
import type { EditorState } from '../shared/useEditor';

export function TransitionControls(props: {editor:EditorState}) {
  const theme=useTheme<WidgetTheme>(),TR=useTR('NativeEditor'),[definition,setDefinition]=createSignal('');
  const project=()=>props.editor.snapshot()?.project;
  const definitions=()=>project()?.definitions?.filter(d=>d.domain==='transition') ?? [];
  const pair=()=>transitionPair(project(),props.editor.selectedIds());
  const transition=()=>project()?.transitions?.find(t=>t.instance.id===props.editor.selectedTransition());
  const currentDefinition=()=>definitions().find(d=>d.id===transition()?.instance.definitionId && d.version===transition()?.instance.definitionVersion);
  function add() {const d=definitions().find(d=>`${d.id}@${d.version}`===definition()),inputs=pair();if(d && inputs) void props.editor.execute([{type:'transitionAdd',fromClip:inputs[0],toClip:inputs[1],definitionId:d.id,definitionVersion:d.version,durationMs:500}]);}
  return <column width="100%" gap={8}>
    <row width="100%" gap={5}>
      <container grow={1} minWidth={0}><Select id="editor-transition-definition" label={TR('transitions')} value={definition()}
        options={definitions().map(d=>({value:`${d.id}@${d.version}`,label:definitionLabel(d.label,TR)}))} onValueChange={setDefinition} /></container>
      <Button size="xs" disabled={!definition() || !pair()} onClick={add}>{TR('add')}</Button>
    </row>
    <text fontSize={11} color={theme().mutedForeground} lineClamp={3} text={TR('transitionHint')} />
    <For each={project()?.transitions?.filter(t=>t.fromClip===props.editor.clip()?.id || t.toClip===props.editor.clip()?.id) ?? []}>{t=>
      <Button variant="ghost" size="xs" width="100%" pressed={props.editor.selectedTransition()===t.instance.id} onClick={()=>props.editor.selectTransition(t.instance.id)}>
        {definitionLabel(definitions().find(d=>d.id===t.instance.definitionId && d.version===t.instance.definitionVersion)?.label ?? t.instance.definitionId,TR)}
      </Button>
    }</For>
    <Show when={transition()}>
      <PropertyRow label={TR('enabled')}><Switch accessibleName={TR('enabled')} value={transition()!.instance.enabled}
        onValueChange={enabled=>void props.editor.edit({type:'transitionUpdate',transition:{...transition()!,instance:{...transition()!.instance,enabled}}})} /></PropertyRow>
      <PropertyRow label={TR('duration')}><NumberField label={TR('duration')} value={transition()!.durationMs/1000} min={0.001} max={21600}
        onChange={value=>void props.editor.edit({type:'transitionUpdate',transition:{...transition()!,durationMs:Math.round(value*1000)}})} /></PropertyRow>
      <For each={currentDefinition()?.parameters ?? []}>{parameter=><ParameterControl editor={props.editor} instance={transition()!.instance} parameter={parameter} />}</For>
      <PresetControls editor={props.editor} instance={transition()!.instance} target={{kind:'transition',instanceId:transition()!.instance.id}} />
      <Button variant="ghost" size="xs" onClick={()=>void props.editor.edit({type:'transitionRemove',id:transition()!.instance.id})}>{TR('removeEffect')}</Button>
    </Show>
  </column>;
}
