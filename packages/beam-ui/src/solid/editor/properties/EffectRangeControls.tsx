import { createEffect, createSignal, Show } from 'solid-js';
import { Button } from '../../shared/base-ui/button';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import { NumberField, PropertyRow } from './PropertyRow';
import type { Instance, TimeSpace } from '../shared/generated/editorContracts';
import type { EditorState } from '../shared/useEditor';

export function EffectRangeControls(props: {editor:EditorState;instance:Instance;required:boolean}) {
  const TR = useTR('NativeEditor');
  const [start,setStart] = createSignal(0),[end,setEnd] = createSignal(1),[space,setSpace] = createSignal<TimeSpace>('clipLocal');
  createEffect(() => {const range=props.instance.range;setStart(range ? range.start.ticks/range.start.timescale : 0);setEnd(range ? range.end.ticks/range.end.timescale : props.editor.clip()!.durationMs/1000);setSpace(range?.space ?? 'clipLocal');});
  const save = (range:Instance['range']) => void props.editor.edit(props.editor.clip()?.generator?.id === props.instance.id
    ? {type:'generatorUpdate',clipId:props.editor.clip()!.id,instance:{...props.instance,range}}
    : {type:'effectUpdate',clipId:props.editor.clip()!.id,instance:{...props.instance,range}});
  return <column width="100%" gap={6}>
    <Select id={`effect-range-space-${props.instance.id}`} label={TR('timeSpace')} value={space()}
      options={(['source','clipLocal','sequence'] as const).map(value => ({value,label:TR(value)}))} onValueChange={value => setSpace(value as TimeSpace)} />
    <PropertyRow label={TR('rangeStart')}><NumberField label={TR('rangeStart')} value={start()} min={-21600} max={21600} onChange={setStart} /></PropertyRow>
    <PropertyRow label={TR('rangeEnd')}><NumberField label={TR('rangeEnd')} value={end()} min={-21600} max={21600} onChange={setEnd} /></PropertyRow>
    <row width="100%" gap={5}>
      <Button size="xs" grow={1} disabled={end() <= start()} onClick={() => save({space:space(),start:{ticks:Math.round(start()*1000000),timescale:1000000},end:{ticks:Math.round(end()*1000000),timescale:1000000}})}>{TR('apply')}</Button>
      <Show when={!props.required}><Button variant="secondary" size="xs" grow={1} onClick={() => save(null)}>{TR('allClip')}</Button></Show>
    </row>
  </column>;
}
