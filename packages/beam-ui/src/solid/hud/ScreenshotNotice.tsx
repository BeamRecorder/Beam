import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { useTR } from '../shared/i18n'
import { Icon } from '../shared/base-ui/icon'

/** Explains why screenshot capture has no camera or audio controls. */
export function ScreenshotNotice() {
  const theme = useTheme<WidgetTheme>(), TR = useTR('Native')
  return <column width="100%" height="100%" justifyContent="center" gap={8}>
    <Icon name="camera" size={20} color={theme().mutedForeground} />
    <text fontSize={12} weight={600} lineHeight={17} color={theme().foreground}>{TR('screenshotDevicesTitle')}</text>
    <text fontSize={11} lineHeight={16} color={theme().mutedForeground}>{TR('screenshotDevicesDescription')}</text>
  </column>
}
