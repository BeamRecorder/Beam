import type { JSX } from '@argui/solid/jsx-runtime'
import { mergeProps } from 'solid-js'
import { useTheme } from '@argui/solid'
import { Button as ArguiButton } from '@argui/widgets/solid'
import type { ButtonProps, WidgetTheme } from '@argui/widgets/solid'

/** Beam's shared native button; ordinary controls use the 28 px theme metric. */
export function Button(props: ButtonProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <ArguiButton {...mergeProps({ size: 'sm' as const, get radius() { return theme().radius } }, props)} />
}
