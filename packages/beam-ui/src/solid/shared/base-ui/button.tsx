import type { JSX } from '@argui/solid/jsx-runtime'
import { mergeProps } from 'solid-js'
import { Button as ArguiButton } from '@argui/widgets/solid'
import type { ButtonProps } from '@argui/widgets/solid'

/** Beam's shared native button; ordinary controls use the 28 px theme metric. */
export function Button(props: ButtonProps): JSX.Element {
  return <ArguiButton {...mergeProps({ size: 'sm' as const }, props)} />
}
