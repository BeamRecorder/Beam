import { Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { useTR } from '../i18n'
import { CopyButton } from './copyButton'
import type { ErrorNoticeProps } from './errorNoticeTypes'

/** Every error keeps its full diagnostic available through the shared copy action. */
export function ErrorNotice(props: ErrorNoticeProps) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('CopyButton')
  const fontSize = () => props.fontSize ?? 11
  const lines = () => props.lineClamp ?? 2
  return <Show when={props.message}>
    <row width="100%" gap={6} alignItems="center" shrink={0}>
      <container width={0} grow={1} minWidth={0} maxHeight={lines() > 0 ? fontSize() * 1.25 * lines() : undefined} clip>
        <text width="100%" color={theme().destructive} fontSize={fontSize()}
          lineClamp={lines()} textOverflow="ellipsis" role="alert" text={props.message} />
      </container>
      <CopyButton value={props.message} onCopy={props.onCopy} label={TR('copyError')} copiedLabel={TR('copied')} errorLabel={TR('copyFailed')} />
    </row>
  </Show>
}
