import { createUniqueId, Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import { ScrollShadow, type WidgetTheme } from '@argui/widgets/solid'
import { Button } from './button'
import type { ControlPopoverProps } from './controlPopoverTypes'

/** An icon control whose retained popup stays inside its renderer viewport. */
export function ControlPopover(props: ControlPopoverProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  const id = props.id ?? `beam-control-${createUniqueId()}`
  const popupId = `${id}-popup`
  return <container tooltip={props.label}>
    <Button id={id} variant="ghost" size="icon-lg" iconOnly accessibleName={props.label}
      pressed={props.open} expanded={props.open} controls={popupId} hasPopup="dialog" disabled={props.disabled}
      onClick={() => props.onOpenChange(!props.open)}>
      {props.icon}
    </Button>
    <Show when={props.open && !props.disabled}>
      <popupWindow id={popupId} anchor={id} placement="top" width={props.contentWidth ?? 264}
        allowOutsideWindow={false} windowLayer="popover" dismissPolicy="outsidePointerOrEscape"
        containment="none" initialFocus="" restoreFocus accessibleName={props.label}
        onDismiss={() => props.onOpenChange(false)}>
        <rectangle width="100%" radii={theme().overlayRadius} clip
          background={theme().popover}
          border={{ width: theme().overlayBorderWidth, color: theme().outlineBorder }}
          shadow={{ offsetY: theme().overlayShadowOffsetY, blur: theme().overlayShadowBlur, color: theme().overlayShadowColor }}>
          <Show when={props.contentHeight !== undefined} fallback={
            <column width="100%" padding={theme().overlayPadding}>{props.children}</column>
          }>
            <ScrollShadow width="100%" height={Math.max(64, Math.min(props.contentHeight!, props.maxContentHeight ?? props.contentHeight!)) + theme().overlayPadding * 2}
              scrollbarEndInset={0}>
              <column width="100%" shrink={0} padding={theme().overlayPadding}>{props.children}</column>
            </ScrollShadow>
          </Show>
        </rectangle>
      </popupWindow>
    </Show>
  </container>
}
