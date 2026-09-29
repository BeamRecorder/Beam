import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Tooltip } from './tooltip';

/** Shared compact action with native focus, hover, pressed paint, and accessible naming. */
export function IconButton(props: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  id?: string;
  accent?: boolean;
  iconSize?: number;
}) {
  const theme = useTheme<WidgetTheme>();
  return (
    <Button
      variant="ghost"
      id={props.id}
      size="icon-sm"
      iconOnly
      width={26}
      shrink={0}
      accessibleName={props.label}
      disabled={props.disabled}
      pressed={props.pressed}
      onClick={props.onClick}
    >
      <Tooltip content={props.label} width="100%" height="100%" mouseCursor={props.disabled ? 'notAllowed' : 'pointer'}>
        <Icon name={props.icon} size={props.iconSize ?? 14} color={props.pressed || props.accent ? theme().primary : theme().mutedForeground} />
      </Tooltip>
    </Button>
  );
}
