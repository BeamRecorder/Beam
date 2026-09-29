import { For, Match, Switch as MatchSwitch } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Icon } from '../../shared/base-ui/icon';
import { useTR } from '../../shared/i18n';
import { ShelfCard } from '../shared/ShelfCard';
import { defaultTitle } from '../shared/defaults';
import type { EditorState } from '../shared/useEditor';
import type { LibraryPage } from './libraryTypes';
import { filters } from './libraryModel';
import { EffectStack } from '../properties/EffectStack';
import { TransitionControls } from '../properties/TransitionControls';
import { definitionLabel } from '../properties/definitionLabels';

/** Shelves create typed instances and real two-input transitions through the shared service. */
export function LibraryShelf(props: { page: LibraryPage; editor: EditorState }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const selected = () => !!props.editor.clip() && !props.editor.busy();
  const apply = (values: {brightness?:number;saturation?:number}) => {
    const clip = props.editor.clip();
    if (clip) void props.editor.execute([{type:'effectAdd',clip:clip.id,definitionId:'beam.color',definitionVersion:1,
      parameters:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{kind:'constant',value:{kind:'number',value}}]))}]);
  };
  return <scrollView width="100%" grow={1} minHeight={0}>
    <column width="100%" padding={14} gap={10}>
      <text fontSize={12} weight={500} color={theme().foreground} text={TR(props.page)} />
      <MatchSwitch>
        <Match when={props.page === 'text'}>
          <ShelfCard label={TR('addTitle')} height={80} disabled={props.editor.busy() || !props.editor.snapshot()}
            onClick={() => void props.editor.edit({ type: 'insertTitle', title: { ...defaultTitle, text: TR('newTitle') }, startMs: props.editor.transport().positionMs })}>
            <column gap={6} alignItems="center"><Icon name="type" size={24} color={theme().foreground} />
              <text fontSize={12} color={theme().foreground} text={TR('addTitle')} /></column>
          </ShelfCard>
        </Match>
        <Match when={props.page === 'transitions'}>
          <TransitionControls editor={props.editor} />
        </Match>
        <Match when={props.page === 'effects'}><EffectStack editor={props.editor} /></Match>
        <Match when={props.page === 'filters'}>
          <For each={filters}>{preset =>
            <Button variant="secondary" width="100%" contentAlign="start"
              disabled={!selected() || (!props.editor.asset()?.hasVideo && !props.editor.clip()?.title)
                }
              onClick={() => apply(preset.values)}>
              <Icon name={props.page === 'filters' ? 'blend' : 'sparkles'} size={15} color={theme().mutedForeground} />{TR(preset.id)}
            </Button>
          }</For>
        </Match>
        <Match when={props.page === 'templates'}>
          <For each={props.editor.snapshot()?.project.definitions?.filter(d=>d.domain==='generator') ?? []}>{d=><Button variant="secondary" width="100%" disabled={props.editor.busy() || !props.editor.snapshot()?.project.tracks.some(t=>t.kind==='video')}
            onClick={()=>{const track=props.editor.snapshot()?.project.tracks.find(t=>t.kind==='video');if(track)void props.editor.execute([{type:'generatorInsert',track:track.id,definitionId:d.id,definitionVersion:d.version,startMs:props.editor.transport().positionMs,durationMs:3000,parameters:{}}]);}}>{definitionLabel(d.label,TR)}</Button>}</For>
          <For each={[
            { id: 'landscape', width: 1920, height: 1080 },
            { id: 'portrait', width: 1080, height: 1920 },
            { id: 'squareCanvas', width: 1080, height: 1080 },
          ]}>{preset => <ShelfCard label={TR(preset.id)} height={64}
            disabled={props.editor.busy() || !props.editor.snapshot()}
            onClick={() => void props.editor.edit({ type: 'canvas', canvas: { ...props.editor.snapshot()!.project.canvas, width: preset.width, height: preset.height } })}>
            <column gap={4}><text fontSize={12} color={theme().foreground} text={TR(preset.id)} />
              <text fontSize={11} color={theme().mutedForeground} text={`${preset.width} × ${preset.height}`} /></column>
          </ShelfCard>}</For>
          <text fontSize={11} color={theme().mutedForeground} lineClamp={3} text={TR('templateHint')} />
        </Match>
      </MatchSwitch>
      <MatchSwitch><Match when={['transitions', 'effects', 'filters'].includes(props.page) && !props.editor.clip()}>
        <text fontSize={11} color={theme().mutedForeground} lineClamp={3} text={TR('selectHint')} />
      </Match></MatchSwitch>
    </column>
  </scrollView>;
}
