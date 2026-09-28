import { Show } from 'solid-js'
import type { AssetRef } from '@argui/host'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'

/** Compact mode tabs with one retained, natively animated active surface. */
export function SegmentedControl<T extends string>(props: {
  label: string; value: T;
  options: readonly { id: T; label: string; asset: AssetRef }[];
  onChange: (value: T) => void;
  width?: number; compact?: boolean; disabled?: boolean;
}): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  const totalWidth = () => props.width ?? (8 + props.options.length * (props.compact ? 40 : 108))
  const itemWidth = () => (totalWidth() - 8) / props.options.length
  const height = () => props.compact ? 32 : 42
  const activeIndex = () => Math.max(0, props.options.findIndex(item => item.id === props.value))
  return <rectangle width={totalWidth()}
    height={height()} shrink={0} alignSelf="center" radii={theme().radius} background={theme().muted}
    border={{ width: 1, color: theme().border }}>
    <container position="absolute" inset={{ left: 3, top: 3 }} width={itemWidth()} height={height() - 8}
      radii={5} background={theme().secondary} transform={{ translateX: activeIndex() * itemWidth() }}
      transitionMs={170} transitionTimingFunction="cubic-bezier(0.2, 0, 0, 1)" />
    <row width="100%" height="100%" padding={3} role="tabList" accessibleName={props.label}>
      {props.options.map(item => <focusScope role="tab" accessibleName={item.label}
        selected={props.value === item.id} enabled={!props.disabled} keyboardActivation="enterOrSpace" tooltip={item.label}
        width={itemWidth()} height={height() - 8} shrink={0} onClick={() => props.onChange(item.id)}>
        <touchArea width="100%" height="100%" mouseCursor="pointer">
          <column width="100%" height="100%" alignItems="center" justifyContent="center" gap={2}>
            <svg source={item.asset} width={15} height={15}
              color={props.value === item.id ? theme().primary : theme().mutedForeground} />
            <Show when={!props.compact}><text fontSize={11} lineHeight={14} color={props.value === item.id ? theme().foreground : theme().mutedForeground}>{item.label}</text></Show>
          </column>
        </touchArea>
      </focusScope>)}
    </row>
  </rectangle>
}
