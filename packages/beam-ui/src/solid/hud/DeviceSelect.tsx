import { useTR } from '../shared/i18n'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { Select } from '../shared/base-ui/select'
import { Icon, type IconName } from '../shared/base-ui/icon'
import type { SourceOption } from '../shared/beamTypes'
import type { AudioLevel } from '../shared/beamTypes'
import { AudioMeterIcon } from '../shared/base-ui/audioMeterIcon'

/** Native device menu with a visible Off state and explicit missing-source state. */
export function DeviceSelect(props: {
  id: string; label: string; icon: IconName; options: SourceOption[]; value: string;
  onChange: (value: string) => void; unavailable?: string; level?: AudioLevel | null; disabled?: boolean
}): JSX.Element {
  const TR = useTR('HUD'), N = useTR('Native')
  const theme = useTheme<WidgetTheme>()
  const icon = (): IconName => props.value ? props.icon
    : props.icon === 'mic' ? 'mic-off' : props.icon === 'volume-2' ? 'volume-x' : props.icon === 'camera' ? 'camera-off' : props.icon
  const options = () => {
    const items = props.options.map(device => ({ value: device.id, label: device.label, disabled: false }))
    if (props.value && !items.some(option => option.value === props.value)) {
      items.unshift({ value: props.value, label: N('unavailableDevice', { name: props.value }), disabled: true })
    }
    return items
  }
  return <column width="100%">
    <Select id={props.id} label={props.label} placeholder={TR('off')} allowClear width="100%" value={props.value}
      disabled={props.disabled}
      onValueChange={props.onChange} options={options()} allowOutsideWindow
      leading={props.icon === 'mic' || props.icon === 'volume-2'
        ? <AudioMeterIcon icon={icon()} level={props.value ? props.level : null} color={props.value ? theme().foreground : theme().destructive} />
        : <Icon name={icon()} size={14} color={props.value ? theme().mutedForeground : theme().destructive} />} />
    {props.unavailable && <text color={theme().destructive} fontSize={11}>{props.unavailable}</text>}
  </column>
}
