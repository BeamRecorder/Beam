import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { Button } from './button'
import { Icon } from './icon'
import { Tooltip } from './tooltip'
import { useCopyText } from './useCopyText'
import type { CopyButtonProps } from './copyButtonTypes'

/** Shared copy action with native clipboard writes and success/failure feedback. */
export function CopyButton(props: CopyButtonProps) {
  const theme = useTheme<WidgetTheme>()
  const state = useCopyText(() => props.value, text => props.onCopy(text))
  const label = () => state.error() ? `${props.errorLabel}: ${state.error()}` : state.copied() ? props.copiedLabel : props.label
  return <Button variant="ghost" size="icon-xs" iconOnly shrink={0} accessibleName={label()}
    disabled={state.pending() || !props.value} onClick={() => void state.copy()}>
    <Tooltip content={label()} width="100%" height="100%" mouseCursor={state.pending() ? 'notAllowed' : 'pointer'}>
      <Icon name={state.copied() ? 'check' : 'copy'} size={14} color={state.error() ? theme().destructive : theme().mutedForeground} />
    </Tooltip>
  </Button>
}
