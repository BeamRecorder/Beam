import { Show, createEffect, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import { NumberField, PropertyRow, PropertySection } from './PropertyRow';
import type { EditorState } from '../shared/useEditor';
import { frameTimecode } from '../video/timecode';

export function ClipControls(props:{editor:EditorState}) {
  const theme=useTheme<WidgetTheme>(),TR=useTR('NativeEditor'),clip=()=>props.editor.clip()!;
  const [numerator,setNumerator]=createSignal(1),[denominator,setDenominator]=createSignal(1);
  createEffect(()=>{setNumerator(clip().rate?.numerator ?? 1);setDenominator(clip().rate?.denominator ?? 1);});
  const rate=()=>(clip().rate?.numerator ?? 1)/(clip().rate?.denominator ?? 1);
  const durationAvailable=()=>Math.floor(((props.editor.asset()?.durationMs ?? 21600000)-clip().sourceInMs)/rate());
  const trim=(source:number,duration:number)=>void props.editor.edit({type:'trim',id:clip().id,startMs:clip().startMs,sourceInMs:Math.round(source*1000),durationMs:Math.round(duration*1000)});
  function speed() {
    if(!Number.isInteger(numerator()) || !Number.isInteger(denominator()))return;
    const durationMs=Number(BigInt(clip().durationMs)*BigInt(clip().rate?.numerator ?? 1)*BigInt(denominator())/(BigInt(clip().rate?.denominator ?? 1)*BigInt(numerator())));
    void props.editor.edit({type:'retime',id:clip().id,rate:{numerator:numerator(),denominator:denominator()},durationMs});
  }
  return <PropertySection label={TR('timing')}>
    <text fontSize={12} weight={500} color={theme().foreground} lineClamp={1} text={clip().title?.text ?? props.editor.asset()?.name ?? TR('generator')} />
    <text id="editor-clip-integrity" fontSize={11} color={theme().mutedForeground} text={`${frameTimecode(clip().durationMs,props.editor.snapshot()!.project.canvas.fps,props.editor.snapshot()!.project.canvas.fpsDenominator)} · ${TR('nonDestructive')}`} />
    <PropertyRow label={TR('duration')}><NumberField label={TR('duration')} value={clip().durationMs/1000} min={0.001} max={durationAvailable()/1000} onChange={value=>trim(clip().sourceInMs/1000,value)} /></PropertyRow>
    <Show when={props.editor.asset()}><PropertyRow label={TR('sourceIn')}><NumberField label={TR('sourceIn')} value={clip().sourceInMs/1000} min={0}
      max={Math.max(0,((props.editor.asset()?.durationMs ?? 0)-clip().durationMs*rate())/1000)} onChange={value=>trim(value,clip().durationMs/1000)} /></PropertyRow></Show>
    <PropertyRow label={TR('track')}><Select id="editor-clip-track" label={TR('track')} value={clip().trackId}
      options={props.editor.snapshot()!.project.tracks.filter(t=>t.kind===props.editor.snapshot()!.project.tracks.find(lane=>lane.id===clip().trackId)?.kind).map(t=>({value:t.id,label:t.name}))}
      onValueChange={trackId=>void props.editor.edit({type:'move',id:clip().id,trackId,startMs:clip().startMs})} /></PropertyRow>
    <Show when={props.editor.asset() && !props.editor.asset()?.isImage}>
      <PropertyRow label={TR('speedNumerator')}><NumberField label={TR('speedNumerator')} value={numerator()} min={1} max={4294967295} onChange={setNumerator} /></PropertyRow>
      <PropertyRow label={TR('speedDenominator')}><NumberField label={TR('speedDenominator')} value={denominator()} min={1} max={4294967295} onChange={setDenominator} /></PropertyRow>
      <Button variant="secondary" size="xs" width="100%" onClick={speed}>{TR('applySpeed')}</Button>
    </Show>
  </PropertySection>;
}
