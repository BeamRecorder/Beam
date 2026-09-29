import { createEffect, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import { InputField, Popover, type WidgetTheme } from '@argui/widgets/solid';
import { Tabs } from '../../shared/base-ui/tabs';
import { Icon } from '../../shared/base-ui/icon';
import { IconButton } from '../../shared/base-ui/iconButton';
import { Button } from '../../shared/base-ui/button';
import { useTR } from '../../shared/i18n';
import type { EditorState } from '../shared/useEditor';

/** Sequence navigation occupies its own row, separate from the editing toolbar. */
export function TimelineTabs(props: { editor: EditorState; width: number }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const sequences = () => props.editor.snapshot()?.sequences ?? [];
  const active = () => props.editor.snapshot()?.activeSequence ?? '';
  const [name, setName] = createSignal('');
  createEffect(() => setName(sequences().find(sequence => sequence.id === active())?.name ?? ''));
  return <row id="editor-sequence-bar" width="100%" height={42} shrink={0}
    padding={{ start: 8, end: 8 }} gap={6} alignItems="center">
    <scrollView grow={1} minWidth={0} height={32} scrollX scrollY={false} scrollbarVisible={false}>
      <Tabs id="editor-sequences" label={TR('timelines')} value={active()} contentAlign="start"
        width={Math.max(120, sequences().length * 140)} disabled={props.editor.busy()}
        options={sequences().map(sequence => ({ ...sequence, label: sequence.name, icon: 'film' as const }))}
        onChange={id => { if (id !== active()) void props.editor.edit({ type: 'selectSequence', id }); }} />
    </scrollView>
    <IconButton id="editor-add-sequence" icon="plus" label={TR('addTimeline')}
      disabled={!props.editor.snapshot() || props.editor.busy() || sequences().length >= 16}
      onClick={() => void props.editor.edit({ type: 'addSequence', name: `${TR('timeline')} ${sequences().length + 1}` })} />
    <Popover trigger="" width={26} contentWidth={240} accessibleLabel={TR('timelineOptions')}
      leading={<Icon name="chevron-down" size={13} color={theme().mutedForeground} />}>
      <column width="100%" gap={8}>
        <InputField accessibleName={TR('timelineName')} value={name()} onValueChange={setName}
          onSubmit={value => { if (value.trim()) void props.editor.edit({ type: 'renameSequence', id: active(), name: value }); }} />
        <Button width="100%" disabled={!name().trim() || props.editor.busy()}
          onClick={() => void props.editor.edit({ type: 'renameSequence', id: active(), name: name() })}>{TR('renameTimeline')}</Button>
        <Button variant="ghost" width="100%" disabled={sequences().length <= 1 || props.editor.busy()}
          onClick={() => void props.editor.edit({ type: 'removeSequence', id: active() })}>{TR('removeTimeline')}</Button>
      </column>
    </Popover>
  </row>;
}
