import { For, Show } from 'solid-js';
import { useTheme } from '@argui/solid';
import { Switch, VirtualList, type WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import { NumberField, PropertyRow, PropertySection } from './PropertyRow';
import { ValueControl } from './ValueControl';
import { CursorControls } from './CursorControls';
import type { CursorStyle, CursorStyleOverride, Parameter, RecordingStyle } from '../shared/generated/editorContracts';
import type { EditorState } from '../shared/useEditor';

/** Missing override fields continue inheriting subsequent sequence style changes. */
export function RecordingControls(props: {editor:EditorState;clip?:boolean}) {
  const theme=useTheme<WidgetTheme>(),TR=useTR('NativeEditor');
  const profile=()=>props.editor.snapshot()?.project.recordingStyle;
  const override=()=>props.editor.clip()?.cursorStyle;
  const cursor=():CursorStyle|undefined=>{const style=profile()?.cursor;if(!style)return;return {...style,...Object.fromEntries(Object.entries(override() ?? {}).filter(([,value])=>value!=null))};};
  const available=()=>!props.clip || props.editor.asset()?.cursorMode==='separated';
  function setCursor<K extends keyof CursorStyle>(key:K,value:CursorStyle[K]) {
    if(props.clip)void props.editor.edit({type:'cursorStyle',id:props.editor.clip()!.id,style:{...override(),[key]:value} as CursorStyleOverride});
    else if(profile())void props.editor.edit({type:'recordingStyle',style:{...profile()!,cursor:{...profile()!.cursor,[key]:value}}});
  }
  const setZoom=<K extends keyof RecordingStyle['zoom']>(key:K,value:RecordingStyle['zoom'][K])=>{if(profile())void props.editor.edit({type:'recordingStyle',style:{...profile()!,zoom:{...profile()!.zoom,[key]:value}}});};
  const colorParameter=(key:'color'|'borderColor'):Parameter=>({key,label:key==='color' ? 'Color' : 'Border color',group:'Cursor',unit:'',valueType:{kind:'color'},default:{kind:'color',value:cursor()![key]},animatable:false});
  return <Show when={profile()}>
    <PropertySection label={TR(props.clip ? 'cursorStyle' : 'recordingProfile')}>
      <Show when={available()} fallback={<text fontSize={11} color={theme().mutedForeground} lineClamp={4} text={TR(`cursorMode${props.editor.asset()?.cursorMode ?? 'unknown'}`)} />}>
        <Show when={props.clip}><Button variant="secondary" size="xs" width="100%" onClick={()=>void props.editor.edit({type:'cursorStyle',id:props.editor.clip()!.id,style:null})}>{TR('inheritCursor')}</Button></Show>
        <PropertyRow label={TR('enabled')}><Switch accessibleName={TR('cursorStyle')} value={cursor()!.enabled} onValueChange={value=>setCursor('enabled',value)} /></PropertyRow>
        <PropertyRow label={TR('shape')}><Select id={`cursor-shape-${props.clip ? 'clip' : 'sequence'}`} label={TR('shape')} value={cursor()!.shape}
          options={(['pointer','dot'] as const).map(value=>({value,label:TR(value)}))} onValueChange={value=>setCursor('shape',value as CursorStyle['shape'])} /></PropertyRow>
        <PropertyRow label={TR('cursorSize')}><NumberField label={TR('cursorSize')} value={cursor()!.size} min={1} max={256} onChange={value=>setCursor('size',value)} /></PropertyRow>
        <For each={['color','borderColor'] as const}>{key=><PropertyRow label={TR(key)}><ValueControl id={`cursor-${key}`} parameter={colorParameter(key)} value={{kind:'color',value:cursor()![key]}}
          onChange={value=>{if(value.kind==='color')setCursor(key,value.value);}} /></PropertyRow>}</For>
        <PropertyRow label={TR('autoHide')}><NumberField label={TR('autoHide')} value={cursor()!.hideAfterMs} min={0} max={60000} onChange={value=>setCursor('hideAfterMs',Math.round(value))} /></PropertyRow>
        <PropertyRow label={TR('clicks')}><Switch accessibleName={TR('clicks')} value={cursor()!.clicks} onValueChange={value=>setCursor('clicks',value)} /></PropertyRow>
        <CursorControls editor={props.editor} style={cursor()!} onChange={value => {
          if (props.clip) void props.editor.edit({type:'cursorStyle',id:props.editor.clip()!.id,style:{...override(),...value} as CursorStyleOverride});
          else void props.editor.edit({type:'recordingStyle',style:{...profile()!,cursor:{...cursor()!,...value}}});
        }} />
      </Show>
    </PropertySection>
    <Show when={!props.clip}><PropertySection label={TR('zoomDefaults')}>
      <PropertyRow label={TR('scale')}><NumberField label={TR('scale')} value={profile()!.zoom.scale} min={1} max={5} onChange={value=>setZoom('scale',value)} /></PropertyRow>
      <PropertyRow label={TR('entry')}><NumberField label={TR('entry')} value={profile()!.zoom.entryMs} min={0} max={10000} onChange={value=>setZoom('entryMs',Math.round(value))} /></PropertyRow>
      <PropertyRow label={TR('exit')}><NumberField label={TR('exit')} value={profile()!.zoom.exitMs} min={0} max={10000} onChange={value=>setZoom('exitMs',Math.round(value))} /></PropertyRow>
      <PropertyRow label={TR('followCursor')}><Switch accessibleName={TR('followCursor')} value={profile()!.zoom.followCursor} onValueChange={value=>setZoom('followCursor',value)} /></PropertyRow>
    </PropertySection></Show>
    <Show when={props.clip && props.editor.asset()?.zoomCount}><PropertySection label={TR('zoomSuggestions')}>
      <VirtualList id="editor-zoom-suggestions" width="100%" height={Math.min(240,(props.editor.asset()?.zoomCount ?? 0)*32)} count={props.editor.asset()?.zoomCount ?? 0}
        estimate={32} variable={false} itemKey={index=>`${props.editor.asset()?.id}-${index}`} renderItem={index=><container width="100%" height={32}><Button variant="secondary" size="xs" width="100%"
          onClick={()=>void props.editor.edit({type:'applySuggestion',clipId:props.editor.clip()!.id,index})}>{TR('applyZoomSuggestion',{index:index+1})}</Button></container>} />
    </PropertySection></Show>
  </Show>;
}
