import { createMemo } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { SplitterProps } from './layoutTypes';
import { splitterGeometry } from './splitterGeometry';

/** Rust owns drag sizing and hover paint. JavaScript receives only the final size. */
export function Splitter(props: SplitterProps) {
  const theme = useTheme<WidgetTheme>();
  const geometry = createMemo(() => splitterGeometry(props.vertical, props.hairline));
  return <focusScope id={props.id} role="separator" accessibleName={props.label} keyboardActivation="none"
    width={geometry().width} height={geometry().height} shrink={0}
    numericValue={props.value} minimumValue={props.minimum} maximumValue={props.maximum}
    orientation={geometry().orientation} onKey={event => {
      if (event.state !== 'pressed') return;
      const direction = props.trailing ? -1 : 1;
      const step = event.shift ? 1 : 16;
      let value = props.value;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') value -= step * direction;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') value += step * direction;
      else if (event.key === 'Home') value = props.minimum;
      else if (event.key === 'End') value = props.maximum;
      else return;
      props.onCommit(Math.max(props.minimum, Math.min(props.maximum, value)));
    }}>
    <touchArea id={`${props.id}-handle`} width={geometry().hitWidth} height={geometry().hitHeight}
      position="absolute" inset={geometry().inset} mouseCursor={geometry().cursor}
      resizeTarget={props.target} resizeAxis={props.vertical ? 'horizontal' : 'vertical'}
      resizeMinimum={props.minimum} resizeMaximum={props.maximum} resizeTrailing={props.trailing ?? false}
      onResizeCommit={event => props.onCommit(event.value)}>
      <row width="100%" height="100%" justifyContent="center" alignItems="center">
        <rectangle id={`${props.id}-pill`} width={geometry().pillWidth} height={geometry().pillHeight}
          shrink={0} radii={2} background="#00000000" hoverBackground={theme().primary}
          transitionMs={120} transitionTimingFunction="cubic-bezier(0.2, 0, 0, 1)" />
      </row>
    </touchArea>
  </focusScope>;
}
