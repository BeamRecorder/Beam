import { Show, createUniqueId, untrack } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { TooltipProps } from './tooltipTypes';
import { useTooltip } from './useTooltip';

/** Delayed hint around a control's painted content, inside its interactive scope. */
export function Tooltip(props: TooltipProps) {
  const theme = useTheme<WidgetTheme>();
  const id = props.id ?? `beam-tooltip-${createUniqueId()}`;
  const popupId = `${id}-popup`;
  const hint = useTooltip(() => props.delayMs ?? 450);
  const content = untrack(() => props.children);
  return <container width={props.width} height={props.height} grow={props.grow} shrink={props.shrink}
    minWidth={props.minWidth} maxWidth={props.maxWidth}>
    <row width="100%" height="100%" alignItems="center" justifyContent="center">{content}</row>
    <container position="absolute" inset={0} width="100%" height={props.enabled === false || props.onlyBelow ? 0 : '100%'} clip
      containerRules={props.onlyBelow ? [{ scope: props.onlyBelow.scope,
        when: { maxWidth: props.onlyBelow.width }, style: { height: '100%' } }] : undefined}>
      <touchArea id={id} width="100%" height="100%" mouseCursor={props.mouseCursor} onPointerEnter={hint.enter}
        onPointerLeave={hint.hide} onPointerDown={hint.hide} />
    </container>
    <Show when={hint.open()}>
      <popupWindow id={popupId} anchor={id} role="tooltip" accessibleName={props.content}
        placement={props.placement ?? 'bottom'} width="auto" anchorWidth="content" allowOutsideWindow={false}
        windowLayer="popover" dismissPolicy="outsideHoverOrEscape" containment="none"
        initialFocus="" restoreFocus={false} openingMs={100} onDismiss={hint.hide}>
        <row id={`${id}-surface`} maxWidth={props.contentMaxWidth ?? 280} padding={{ start: 10, end: 10, top: 7, bottom: 7 }}
          radii={theme().radius} background={theme().popover}
          border={{ width: theme().overlayBorderWidth, color: theme().border }}
          shadow={{ offsetY: theme().overlayShadowOffsetY, blur: theme().overlayShadowBlur, color: theme().overlayShadowColor }}>
          <container minWidth={0}>
            <text id={`${id}-text`} width="100%" fontSize={11} color={theme().popoverForeground} text={props.content} />
          </container>
        </row>
      </popupWindow>
    </Show>
  </container>;
}
