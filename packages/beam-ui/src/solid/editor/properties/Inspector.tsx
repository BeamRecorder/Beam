import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import { InputField, type WidgetTheme } from '@argui/widgets/solid';
import { Select } from '../../shared/base-ui/select';
import { Button } from '../../shared/base-ui/button';
import { ChoiceTabs } from '../../shared/base-ui/choiceTabs';
import { useTR } from '../../shared/i18n';
import { Panel } from '../shared/Panel';
import type { EditorState } from '../shared/useEditor';
import { PropertyRow, PropertySection } from './PropertyRow';
import { TitleControls } from './TitleControls';
import { ClipControls } from './ClipControls';
import { EffectStack } from './EffectStack';
import { ParameterControl } from './ParameterControl';
import { TransitionControls } from './TransitionControls';
import { RecordingControls } from './RecordingControls';
import { definitionLabel } from './definitionLabels';
import { PresetControls } from './PresetControls';

/** Every effect and generator is described by the same Rust catalog used by scripts. */
export function Inspector(props: { editor:EditorState; width:number }) {
  const theme=useTheme<WidgetTheme>(),TR=useTR('NativeEditor'),[name,setName]=createSignal(''),[tab,setTab]=createSignal('clip');
  const canvas=()=>props.editor.snapshot()?.project.canvas;
  createEffect(()=>setName(props.editor.snapshot()?.project.name ?? ''));
  const clipId=createMemo(()=>props.editor.selected());
  createEffect(()=>{clipId();setTab('clip');});
  createEffect(()=>{if(props.editor.selectedEffect())setTab('effects');if(props.editor.selectedTransition())setTab('transitions');});
  const generatorDefinition=()=>props.editor.snapshot()?.project.definitions?.find(d=>d.id===props.editor.clip()?.generator?.definitionId && d.version===props.editor.clip()?.generator?.definitionVersion);
  return <Panel width="100%" header={<Show when={props.editor.placement()} fallback={<text fontSize={13} weight={500} color={theme().foreground} text={TR('project')} />}>
    <ChoiceTabs id="editor-clip-tabs" label={TR('clip')} width={props.width-16} value={tab()} options={['clip','effects','transitions'].map(id=>({id,label:TR(id)}))} onChange={setTab} />
  </Show>}>
    <scrollView width="100%" grow={1} minHeight={0}><column width="100%" gap={0}>
      <Show when={props.editor.clip()} fallback={<Show when={!props.editor.clipLoading()} fallback={<container width="100%" padding={14}><text fontSize={12} color={theme().mutedForeground} text={TR('loading')} /></container>}><Show when={!props.editor.placement()} fallback={<column width="100%" padding={14} gap={8}>
        <text width="100%" fontSize={12} color={theme().mutedForeground} text={props.editor.error() || TR('unavailable')} />
        <Button disabled={props.editor.busy()} onClick={()=>void props.editor.refresh()}>{TR('retry')}</Button>
      </column>}><>
        <PropertySection label={TR('project')}><PropertyRow label={TR('name')}><InputField accessibleName={TR('projectName')} value={name()} onValueChange={setName}
          onSubmit={value=>void props.editor.edit({type:'rename',name:value})} disabled={!canvas() || props.editor.busy()} /></PropertyRow></PropertySection>
        <PropertySection label={TR('canvas')}>
          <PropertyRow label={TR('resolution')}><Select id="editor-resolution" label={TR('resolution')} value={`${canvas()?.width}x${canvas()?.height}`} disabled={!canvas() || props.editor.busy()}
            options={[{value:'1920x1080',label:'1920 × 1080'},{value:'1080x1920',label:'1080 × 1920'},{value:'1080x1080',label:'1080 × 1080'}]}
            onValueChange={value=>{const [width,height]=value.split('x').map(Number);void props.editor.edit({type:'canvas',canvas:{...canvas()!,width,height}});}} /></PropertyRow>
          <PropertyRow label={TR('frameRate')}><Select id="editor-frame-rate" label={TR('frameRate')} value={`${canvas()?.fps}/${canvas()?.fpsDenominator ?? 1}`}
            options={[[24,1],[24000,1001],[25,1],[30,1],[30000,1001],[50,1],[60,1],[60000,1001]].map(([fps,denominator])=>({value:`${fps}/${denominator}`,label:denominator===1 ? `${fps}` : `${(fps/denominator).toFixed(3)} (${fps}/${denominator})`}))}
            onValueChange={value=>{const [fps,fpsDenominator]=value.split('/').map(Number);void props.editor.edit({type:'canvas',canvas:{...canvas()!,fps,fpsDenominator}});}} /></PropertyRow>
        </PropertySection>
        <RecordingControls editor={props.editor} />
      </></Show></Show>}>
        <Show when={tab()==='clip'}>
          <ClipControls editor={props.editor} />
          <Show when={props.editor.clip()?.title}><TitleControls editor={props.editor} /></Show>
          <Show when={props.editor.clip()?.generator && generatorDefinition()}><PropertySection label={definitionLabel(generatorDefinition()!.label,TR)}>
            <For each={generatorDefinition()!.parameters}>{parameter=><ParameterControl editor={props.editor} instance={props.editor.clip()!.generator!} parameter={parameter} />}</For>
            <PresetControls editor={props.editor} instance={props.editor.clip()!.generator!} target={{kind:'generator',clipId:props.editor.clip()!.id,instanceId:props.editor.clip()!.generator!.id}} />
          </PropertySection></Show>
          <Show when={props.editor.asset()?.recording}><RecordingControls editor={props.editor} clip /></Show>
        </Show>
        <Show when={tab()==='effects'}><EffectStack editor={props.editor} /></Show>
        <Show when={tab()==='transitions'}><column width="100%" padding={14}><TransitionControls editor={props.editor} /></column></Show>
      </Show>
    </column></scrollView>
  </Panel>;
}
