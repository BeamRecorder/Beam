import { For, Match, Show, Switch as Cases } from 'solid-js';
import { InputField, Switch } from '@argui/widgets/solid';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import { NumberField } from './PropertyRow';
import { definitionLabel } from './definitionLabels';
import type { Parameter, Value } from '../shared/generated/editorContracts';

/** All instance and keyframe editors use the same typed metadata controls. */
export function ValueControl(props: { id: string; parameter: Parameter; value: Value; onChange: (value: Value) => void }) {
  const TR = useTR('NativeEditor'), label = () => definitionLabel(props.parameter.label, TR);
  const numeric = () => props.parameter.valueType.kind === 'number' ? props.parameter.valueType : undefined;
  function component(index: number, value: number) {
    const current = props.value;
    if (current.kind === 'point') { const values: [number,number] = [...current.value]; values[index] = value; props.onChange({kind:'point',value:values}); }
    if (current.kind === 'color') { const values: [number,number,number,number] = [...current.value]; values[index] = value; props.onChange({kind:'color',value:values}); }
  }
  return <column width="100%" gap={4}>
    <Cases>
      <Match when={numeric()}><NumberField label={label()} value={props.value.kind === 'number' ? props.value.value : 0}
        min={numeric()!.min} max={numeric()!.max} onChange={value => props.onChange({kind:'number',value})} /></Match>
      <Match when={props.parameter.valueType.kind === 'boolean'}><Switch accessibleName={label()} value={props.value.kind === 'boolean' && props.value.value}
        onValueChange={value => props.onChange({kind:'boolean',value})} /></Match>
      <Match when={props.parameter.valueType.kind === 'choice'}><Select id={props.id} label={label()}
        value={props.value.kind === 'choice' ? props.value.value : ''}
        options={(props.parameter.valueType as Extract<Parameter['valueType'],{kind:'choice'}>).options.map(value => ({value,label:value}))}
        onValueChange={value => props.onChange({kind:'choice',value})} /></Match>
      <Match when={props.parameter.valueType.kind === 'text'}><InputField accessibleName={label()} value={props.value.kind === 'text' ? props.value.value : ''}
        onValueChange={value => props.onChange({kind:'text',value})} /></Match>
    </Cases>
    <Show when={props.value.kind === 'point' || props.value.kind === 'color'}>
      <row width="100%" gap={4}><For each={props.value.kind === 'point' ? [0,1] : [0,1,2,3]}>{index => <container grow={1} minWidth={0}>
        <NumberField label={`${label()} ${index+1}`} value={(props.value.value as number[])[index]}
          min={props.value.kind === 'color' ? 0 : -1000000} max={props.value.kind === 'color' ? 1 : 1000000} onChange={value => component(index,value)} />
      </container>}</For></row>
    </Show>
  </column>;
}
