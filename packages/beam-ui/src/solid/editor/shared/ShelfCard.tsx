import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { JSX } from '@argui/solid/jsx-runtime';

/** A shelf-sized native action with the same focus and surface roles as ordinary buttons. */
export function ShelfCard(props: { label: string; height: number; disabled?: boolean; onClick: () => void; children: JSX.Element }) {
  const theme = useTheme<WidgetTheme>();
  return <focusScope width="100%" height={props.height} role="button" accessibleName={props.label}
    enabled={!props.disabled} keyboardActivation="enterOrSpace" mouseCursor="pointer"
    onClick={() => { if (!props.disabled) props.onClick(); }}>
    <rectangle width="100%" height="100%" background={theme().secondary} hoverBackground={theme().secondaryHover}
      radii={7} focusBorderColor={theme().focusRing} opacity={props.disabled ? 0.5 : 1}>
      <column width="100%" height="100%" alignItems="center" justifyContent="center">{props.children}</column>
    </rectangle>
  </focusScope>;
}
