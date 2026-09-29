import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import { mergeProps } from 'solid-js'
import { Select as ArguiSelect, type SelectProps, type WidgetTheme } from '@argui/widgets/solid'
import { mediaAssets } from '../../../../assets.generated'
import { Icon } from './icon'

/** Fills its form cell by default; compact triggers can request a wider readable menu. */
export function Select(props: SelectProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <ArguiSelect {...mergeProps({ width: '100%' as const, minWidth: 0, maxWidth: '100%' as const }, props)}
    variant="shadcn" allowClear={props.allowClear ?? false} selectedIcon={mediaAssets['icons/check.svg']}
    trailing={<Icon name="chevron-down" size={12} color={theme().mutedForeground} />} />
}
