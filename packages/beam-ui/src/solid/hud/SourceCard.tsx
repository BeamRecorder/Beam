import { useTR } from '../shared/i18n'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { mediaAssets } from '../../../assets.generated'
import { Icon, type IconName } from '../shared/base-ui/icon'
import type { SourceMode } from '../shared/beamTypes'

const artwork = {
  display: mediaAssets['preview/fullscreen.webp'],
  region: mediaAssets['preview/region.webp'],
  window: mediaAssets['preview/window.webp'],
} as const
const icon: Record<SourceMode, IconName> = { display: 'monitor', region: 'scan', window: 'app-window' }

/** One keyboard-accessible source choice with Beam's real wallpaper artwork. */
export function SourceCard(props: { mode: SourceMode; selected: boolean; onSelect: () => void; disabled?: boolean; height?: number }): JSX.Element {
  const TR = useTR('Native'), H = useTR('HUD')
  const title = () => props.mode === 'window' ? H('window') : TR(props.mode === 'display' ? 'fullScreen' : 'region')
  const theme = useTheme<WidgetTheme>()
  const previewHeight = () => Math.max(1, (props.height ?? 110) - 35)
  const previewWidth = () => previewHeight() * 16 / 9
  return <focusScope
    role="button" accessibleName={title()} busy={props.disabled}
    enabled={!props.disabled} keyboardActivation="enterOrSpace" onClick={props.onSelect}
    width={0} grow={1} minWidth={0} maxWidth={144} height={props.height ?? 110}>
    <rectangle width="100%" height="100%" radii={theme().radius}
      background={props.selected ? theme().secondary : theme().card}
      border={{ width: props.selected ? 2 : 1, color: props.selected ? theme().primary : theme().border }}
      shadow={{ color: theme().overlayShadowColor, blur: 6, offsetX: 0, offsetY: 2 }}
      hoverBackground={theme().accent}>
      <column width="100%" height="100%" padding={6} gap={7}>
      <rectangle width="100%" height={previewHeight()} shrink={0} radii={5} clip={true} background={theme().muted}>
        <image source={artwork[props.mode]} width="100%" height="100%" fit="cover" alt="" />
        {props.mode === 'region' && <rectangle position="absolute" inset={{ left: previewWidth() * 0.2, right: previewWidth() * 0.2, top: previewHeight() * 0.2, bottom: previewHeight() * 0.2 }}
          border={{ width: 2, color: '#ffffff' }} background="#ea580c22" radii={4} />}
        {props.mode === 'window' && <rectangle position="absolute" inset={{ left: previewWidth() * 0.15, right: previewWidth() * 0.15, top: previewHeight() * 0.18, bottom: previewHeight() * 0.18 }}
          border={{ width: 1, color: '#ffffffaa' }} background="#18181baa" radii={7}>
          <row width="100%" height={12} background="#ffffff30" padding={{ left: 5 }} gap={3} alignItems="center">
            {['#ff5f57', '#febc2e', '#28c840'].map(color => <rectangle width={4} height={4} radii={2} background={color} />)}
          </row>
        </rectangle>}
      </rectangle>
      <row width="100%" height={16} alignItems="center" justifyContent="center" gap={4}>
        <Icon name={icon[props.mode]} size={12} color={props.selected ? theme().primary : theme().foreground} />
        <text color={theme().foreground} fontSize={10} weight={500} lineClamp={1}>{title()}</text>
      </row>
      </column>
    </rectangle>
  </focusScope>
}
