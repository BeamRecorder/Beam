import { Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { WidgetTheme } from '@argui/widgets/solid'

/** Shared two-column settings layout: description left, compact control right. */
export function SettingRow(props: { label: string; description?: string; children: JSX.Element }): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <row width="100%" minHeight={46} gap={12} alignItems="center">
    <column grow={1} minWidth={0} gap={4}>
      <text fontSize={12} color={theme().foreground}>{props.label}</text>
      <Show when={props.description}><text fontSize={11} color={theme().mutedForeground}>{props.description ?? ''}</text></Show>
    </column>
    <container width={164} shrink={0}>{props.children}</container>
  </row>
}
