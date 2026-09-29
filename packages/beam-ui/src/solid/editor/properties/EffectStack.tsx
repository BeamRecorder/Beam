import { For, Show, createMemo, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import { InputField, Switch, VirtualList, type WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { IconButton } from '../../shared/base-ui/iconButton';
import { Select } from '../../shared/base-ui/select';
import { ParameterControl } from './ParameterControl';
import type { EditorState } from '../shared/useEditor';
import { useTR } from '../../shared/i18n';
import { definitionLabel } from './definitionLabels';
import { EffectRangeControls } from './EffectRangeControls';
import { PresetControls } from './PresetControls';
import type { Operation } from '../shared/generated/editorContracts';

/** Only visible stack rows and the selected instance's controls are mounted. */
export function EffectStack(props: { editor: EditorState }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const selected = props.editor.selectedEffect;
  const setSelected = (id:string) => props.editor.selectEffect(props.editor.clip()!.id,id);
  const [definition, setDefinition] = createSignal('');
  const instances = () => props.editor.clip()?.instances ?? [];
  const definitions = () => props.editor.snapshot()?.project.definitions ?? [];
  const available = createMemo(() => definitions().filter(d => d.processor.kind === 'cursor' ? props.editor.asset()?.cursorMode === 'separated'
    : d.domain === 'video' ? props.editor.asset()?.hasVideo || props.editor.clip()?.title || props.editor.clip()?.generator : d.domain === 'audio' && props.editor.asset()?.hasAudio));
  const instance = () => instances().find(i => i.id === selected());
  const currentDefinition = () => definitions().find(d => d.id === instance()?.definitionId && d.version === instance()?.definitionVersion);
  const add = () => {
    const d = available().find(d => `${d.id}@${d.version}` === definition());
    const clip=props.editor.clip();
    if (d && clip) {
      const operations:Operation[]=[{type:'effectAdd',clip:clip.id,definitionId:d.id,definitionVersion:d.version,parameters:{}}];
      if(d.processor.kind==='cameraZoom')operations.push({type:'effectRangeAt',clip:clip.id,instance:{createdBy:'command-0'},start:{ticks:clip.startMs,timescale:1000},end:{ticks:clip.startMs+clip.durationMs,timescale:1000}});
      void props.editor.execute(operations);
    }
  };
  return <column width="100%" padding={14} gap={10}>
    <text fontSize={12} weight={500} color={theme().foreground} text={TR('effectStack')} />
    <row width="100%" gap={5}>
      <container grow={1} minWidth={0}><Select id="editor-effect-definition" label={TR('effects')} value={definition()}
        options={available().map(d => ({ value: `${d.id}@${d.version}`, label: definitionLabel(d.label, TR) }))} onValueChange={setDefinition} /></container>
      <Button size="xs" disabled={!definition()} onClick={add}>{TR('add')}</Button>
    </row>
    <Show when={instances().length} fallback={<text fontSize={11} color={theme().mutedForeground} text={TR('stackHint')} />}>
      <VirtualList id="editor-effect-stack" width="100%" height={Math.min(216, instances().length * 36)} count={instances().length}
        estimate={36} variable={false} dataVersion={props.editor.snapshot()?.revision} itemKey={index => instances()[index].id}
        renderItem={index => { const effect = () => instances()[index]; const d = () => definitions().find(d => d.id === effect().definitionId && d.version === effect().definitionVersion); return <row width="100%" height={36} gap={3} alignItems="center">
          <Switch accessibleName={TR('enabled')} value={effect().enabled} onValueChange={enabled => void props.editor.edit({ type: 'effectUpdate', clipId: props.editor.clip()!.id, instance: { ...effect(), enabled } })} />
          <Button variant="ghost" size="xs" contentAlign="start" grow={1} pressed={selected() === effect().id} onClick={() => setSelected(effect().id)}>{effect().name ?? definitionLabel(d()?.label ?? effect().definitionId, TR)}</Button>
          <IconButton icon="arrow-big-up" label={TR('moveEffectUp')} disabled={index === 0} onClick={() => void props.editor.edit({ type: 'effectReorder', clipId: props.editor.clip()!.id, instanceId: effect().id, index: index - 1 })} />
          <IconButton icon="chevron-down" label={TR('moveEffectDown')} disabled={index === instances().length-1} onClick={() => void props.editor.edit({ type: 'effectReorder', clipId: props.editor.clip()!.id, instanceId: effect().id, index: index + 1 })} />
          <IconButton icon="copy" label={TR('duplicateEffect')} onClick={() => void props.editor.execute([{ type: 'effectDuplicate', clip: props.editor.clip()!.id, instance: effect().id }])} />
          <IconButton icon="trash-2" label={TR('removeEffect')} onClick={() => void props.editor.edit({ type: 'effectRemove', clipId: props.editor.clip()!.id, instanceId: effect().id })} />
        </row>; }} />
    </Show>
    <Show when={instance() && currentDefinition()}>
      <text fontSize={11} color={theme().mutedForeground} text={definitionLabel(currentDefinition()!.label, TR)} />
      <InputField accessibleName={TR('instanceName')} defaultValue={instance()!.name ?? ''} onSubmit={name=>void props.editor.execute([{type:'instanceRename',clip:props.editor.clip()!.id,instance:instance()!.id,name:name.trim() || null}])} />
      <PresetControls editor={props.editor} instance={instance()!} target={{kind:'effect',clipId:props.editor.clip()!.id,instanceId:instance()!.id}} />
      <For each={currentDefinition()!.parameters}>{parameter => <ParameterControl editor={props.editor} instance={instance()!} parameter={parameter} />}</For>
      <EffectRangeControls editor={props.editor} instance={instance()!} required={currentDefinition()?.processor.kind === 'cameraZoom'} />
    </Show>
  </column>;
}
