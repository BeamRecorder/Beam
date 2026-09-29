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
import { effects, filters, presetEffects } from './libraryModel';

/** Shelves expose Beam's actual title, fade, GPU effect and canvas preset operations. */
export function LibraryShelf(props: { page: LibraryPage; editor: EditorState }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const selected = () => !!props.editor.clip() && !props.editor.busy();
  const apply = (values: Parameters<typeof presetEffects>[1]) => {
    const clip = props.editor.clip();
    if (clip) void props.editor.edit({ type: 'effects', id: clip.id, effects: presetEffects(clip, values) });
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
          <For each={['fadeIn', 'fadeOut', 'fadeBoth', 'noFade']}>{id =>
            <Button variant="secondary" width="100%" disabled={!selected()} onClick={() => apply({
              fadeInMs: id === 'fadeIn' || id === 'fadeBoth' ? 500 : 0,
              fadeOutMs: id === 'fadeOut' || id === 'fadeBoth' ? 500 : 0,
            })}><Icon name="link" size={15} color={theme().mutedForeground} />{TR(id)}</Button>
          }</For>
          <text fontSize={11} color={theme().mutedForeground} lineClamp={3} text={TR('fadeHint')} />
        </Match>
        <Match when={props.page === 'effects' || props.page === 'filters'}>
          <For each={props.page === 'filters' ? filters : effects}>{preset =>
            <Button variant="secondary" width="100%" contentAlign="start"
              disabled={!selected() || (!props.editor.asset()?.hasVideo && !props.editor.clip()?.title)
                || (preset.id === 'automatic' && !props.editor.asset()?.hasCursor)}
              onClick={() => apply(preset.values)}>
              <Icon name={props.page === 'filters' ? 'blend' : 'sparkles'} size={15} color={theme().mutedForeground} />{TR(preset.id)}
            </Button>
          }</For>
        </Match>
        <Match when={props.page === 'templates'}>
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
