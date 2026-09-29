import type { IconName } from '../base-ui/icon'

export type SettingsSection = 'capture' | 'shortcuts' | 'appearance' | 'linux' | 'about'
export interface SettingsItem { id: SettingsSection; title: string; icon: IconName; color: string }
