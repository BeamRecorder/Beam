import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import { Select as ArguiSelect, type SelectProps, type WidgetTheme } from '@argui/widgets/solid'
import { mediaAssets } from '../../../../assets.generated'
import { Icon } from './icon'

/** All Beam selects use the same variant and match their actual trigger width. */
export function Select(props: SelectProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <ArguiSelect {...props} variant="shadcn" contentWidth={undefined} allowClear={props.allowClear ?? false} selectedIcon={mediaAssets['icons/check.svg']}
    trailing={<Icon name="chevron-down" size={12} color={theme().mutedForeground} />} />
}
