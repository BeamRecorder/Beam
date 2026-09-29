import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import { Slider, type WidgetTheme } from '@argui/widgets/solid'
import { ControlPopover } from './controlPopover'
import type { SliderPopoverProps } from './sliderPopoverTypes'

/** Shared live numeric adjustment with one keyboard-accessible native slider. */
export function SliderPopover(props: SliderPopoverProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  const format = (value: number) => props.formatValue?.(value) ?? `${Math.round(value * 100) / 100}`
  return <ControlPopover id={props.id} label={props.label} icon={props.icon} open={props.open}
    onOpenChange={props.onOpenChange} disabled={props.disabled} contentWidth={props.contentWidth}
    contentHeight={props.contentHeight} maxContentHeight={props.maxContentHeight}>
    <column width="100%" gap={12}>
      <row width="100%" alignItems="center" justifyContent="spaceBetween" gap={12}>
        <text fontSize={12} weight={600} color={theme().foreground}>{props.label}</text>
        <text fontSize={12} color={theme().mutedForeground}>{format(props.value)}</text>
      </row>
      <Slider width="100%" accessibleName={props.label} min={props.min} max={props.max} step={props.step ?? 1}
        value={props.value} disabled={props.disabled} onValueChange={props.onValueChange} />
      <row width="100%" justifyContent="spaceBetween">
        <text fontSize={10} color={theme().mutedForeground}>{format(props.min)}</text>
        <text fontSize={10} color={theme().mutedForeground}>{format(props.max)}</text>
      </row>
      {props.children}
    </column>
  </ControlPopover>
}
