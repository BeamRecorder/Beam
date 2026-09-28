import { For, Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { WidgetTheme } from '@argui/widgets/solid'
import { Icon, type IconName } from './icon'
import { shortcutKeys } from './shortcutKeys'

const icons: Record<string, IconName> = {
  Shift: 'arrow-big-up', Alt: 'option', Super: 'command', Meta: 'command', Command: 'command',
  Enter: 'corner-down-left', Space: 'space',
}
const labels: Record<string, string> = { Control: 'Ctrl', CmdOrCtrl: 'Ctrl', CommandOrControl: 'Ctrl', Equal: '+', Minus: '−' }

/** One reusable native keyboard cap, with Lucide modifier symbols. */
export function Kbd(props: { value: string }): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <rectangle minWidth={23} height={24} padding={{ left: 5, right: 5 }} radii={5}
    background={theme().muted} border={{ width: 1, color: theme().border }} accessibleName={props.value}>
    <row height="100%" alignItems="center" justifyContent="center">
    <Show when={icons[props.value]} fallback={<text fontSize={11} weight={500} color={theme().foreground}>
      {labels[props.value] ?? props.value}
    </text>}>{icon => <Icon name={icon()} size={14} color={theme().foreground} />}</Show>
    </row>
  </rectangle>
}

/** Displays a saved chord as individually readable keyboard caps. */
export function KbdGroup(props: { value: string }): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <row gap={4} alignItems="center">
    <For each={shortcutKeys(props.value)}>{(key, index) => <>
      <Show when={index() > 0}><text fontSize={10} color={theme().mutedForeground}>+</text></Show>
      <Kbd value={key} />
    </>}</For>
  </row>
}
