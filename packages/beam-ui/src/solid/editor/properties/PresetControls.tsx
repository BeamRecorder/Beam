import {Show,createEffect,createMemo,createSignal,onCleanup} from 'solid-js';
import {Button} from '../../shared/base-ui/button';
import {Select} from '../../shared/base-ui/select';
import {useTR} from '../../shared/i18n';
import type {EditorState} from '../shared/useEditor';
import type {Instance,Preset,PresetTarget} from '../shared/generated/editorContracts';
import {definitionLabel} from './definitionLabels';
import {compatiblePresets,presetKey,readPresets} from './presetModel';

/** Applying a preset always names an existing occurrence; other stack rows remain independent. */
export function PresetControls(props:{editor:EditorState;instance:Instance;target:PresetTarget}) {
  const TR=useTR('NativeEditor'),[catalog,setCatalog]=createSignal<Preset[]>([]),[selected,setSelected]=createSignal('');
  const key=createMemo(()=>{const snapshot=props.editor.snapshot(),project=snapshot?.project;return project && `${project.id}/${snapshot.revision}/${project.definitions?.map(definition=>`${definition.id}@${definition.version}`).join('/')}`;});
  const identity=createMemo(()=>props.instance.id);
  createEffect(()=>{identity();setSelected('');});
  createEffect(()=>{
    if(!key()){setCatalog([]);return;}
    let obsolete=false;onCleanup(()=>{obsolete=true;});
    void readPresets(query=>props.editor.query(query)).then(presets=>{if(!obsolete)setCatalog(presets);})
      .catch(error=>{if(!obsolete)props.editor.reportError(error);});
  });
  const available=createMemo(()=>compatiblePresets(catalog(),props.instance));
  const apply=()=>{const preset=available().find(preset=>presetKey(preset)===selected());if(preset)void props.editor.execute([{type:'applyPreset',presetId:preset.id,presetVersion:preset.version,target:props.target}]);};
  return <Show when={available().length}><row width="100%" gap={5}>
    <container grow={1} minWidth={0}><Select id={`editor-instance-preset-${props.instance.id}`} label={TR('preset')} value={selected()}
      options={available().map(preset=>({value:presetKey(preset),label:definitionLabel(preset.label,TR)}))} onValueChange={setSelected} /></container>
    <Button size="xs" disabled={!available().some(preset=>presetKey(preset)===selected()) || props.editor.busy()} onClick={apply}>{TR('apply')}</Button>
  </row></Show>;
}
