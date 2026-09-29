import { useTR } from '../i18n'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { Button } from '../base-ui/button'
import { Icon } from '../base-ui/icon'
import type { SettingsItem, SettingsSection } from './settingsTypes'

const sections: SettingsItem[] = [
  { id: 'capture', title: 'Capture', icon: 'video', color: '#f97316' },
  { id: 'shortcuts', title: 'Shortcuts', icon: 'keyboard', color: '#8b5cf6' },
  { id: 'appearance', title: 'Appearance', icon: 'palette', color: '#06b6d4' },
]
const about: SettingsItem = { id: 'about', title: 'About', icon: 'info', color: '#64748b' }
const linux: SettingsItem = { id: 'linux', title: 'Linux', icon: 'lock', color: '#dc2626' }

/** Apple-style icon tiles and a neutral active item; About stays at the bottom. */
export function SettingsSidebar(props: { value: SettingsSection; onChange: (section: SettingsSection) => void; showLinux?: boolean }) {
  const TR = useTR('HudPreferences'), N = useTR('Native'), A = useTR('AppearanceSettings')
  const title = (id: SettingsSection) => id === 'linux' ? 'Linux' : id === 'capture' ? N('capture') : id === 'appearance' ? A('title') : TR(id)
  const theme = useTheme<WidgetTheme>()
  const item = (entry: SettingsItem) => <Button id={`settings-section-${entry.id}`} accessibleName={title(entry.id)}
    variant="ghost"
    pressed={props.value === entry.id} onClick={() => props.onChange(entry.id)} width="100%" size="sm" contentAlign="start">
    <row width="100%" gap={9} alignItems="center">
      <row width={24} height={24} shrink={0} radii={5} background={entry.color}
        alignItems="center" justifyContent="center">
        <Icon name={entry.icon} size={16} color="#ffffff" />
      </row>
      <text fontSize={12} color={theme().foreground}>{title(entry.id)}</text>
    </row>
  </Button>
  return <column width={144} shrink={0} height="100%" background={theme().sidebar} padding={8} gap={5}>
    {sections.map(item)}
    {props.showLinux && <><rectangle width="100%" height={1} background={theme().border} margin={{ top: 7, bottom: 5 }} />{item(linux)}</>}
    <container grow={1} />
    {item(about)}
  </column>
}
