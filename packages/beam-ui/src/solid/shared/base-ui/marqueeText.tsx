import { createSignal } from 'solid-js'
import type { JSX } from '@argui/solid/jsx-runtime'
import { ScrollShadow } from '@argui/widgets/solid'

/** Uses ARGUI's native hover animation and feathered edges for long labels. */
export function MarqueeText(props: { value: string; viewportWidth: number; color: string }): JSX.Element {
  const [overflow, setOverflow] = createSignal(0)
  const [hovered, setHovered] = createSignal(false)
  const running = () => hovered() && overflow() > 1
  return <ScrollShadow width="100%" height={20} orientation="horizontal" size={12} scrollbarVisible={false}>
    <row height={20}><container shrink={0}>
      <touchArea height={20} onPointerEnter={event => { setOverflow(Math.max(0, (event.width ?? 0) - props.viewportWidth)); setHovered(true) }}
        onPointerLeave={() => setHovered(false)}>
        <rectangle height={20} loopMs={running() ? Math.max(4000, Math.ceil(overflow() / 14 / 0.35 * 1000)) : undefined}
          loopTranslateX={running() ? -overflow() : undefined} loopHold={running() ? true : undefined}>
          <text noWrap fontSize={12} color={props.color}>{props.value}</text>
        </rectangle>
      </touchArea>
    </container></row>
  </ScrollShadow>
}
