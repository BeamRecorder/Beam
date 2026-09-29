import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { AssetRef } from '@argui/host'
import type { WidgetTheme } from '@argui/widgets/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { BeamApi } from '../shared/beamApi'
import type { NativeProjectSummary } from '../shared/beamTypes'
import { useTR } from '../shared/i18n'
import { Icon, type IconName } from '../shared/base-ui/icon'

/** A real project preview with a compact icon fallback for empty projects. */
export function ProjectCard(props: { api: BeamApi; project: NativeProjectSummary; width: number;
  previewHeight: number; disabled: boolean; onOpen: () => void }): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  const P = useTR('ProjectPicker'), H = useTR('HUD'), E = useTR('NativeEditor')
  const [thumbnail, setThumbnail] = createSignal<AssetRef | null>(null)
  let disposed = false
  onCleanup(() => { disposed = true })
  onMount(() => {
    void props.api.projectThumbnail(props.project.id).then(value => {
      if (!disposed) setThumbnail(value)
    }).catch(error => console.error(`Project thumbnail ${props.project.id}:`, error))
  })
  const kind = (): { icon: IconName; label: string } => {
    if (props.project.kind === 'instant') return { icon: 'sparkles', label: H('instant') }
    if (props.project.kind === 'recording') return { icon: 'monitor', label: P('screenRecord') }
    return { icon: 'film', label: E('project') }
  }
  const date = (): string => {
    if (props.project.updatedAtMs <= 0) return P('dateUnknown')
    const value = new Date(props.project.updatedAtMs)
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return <focusScope width={props.width} height={props.previewHeight + 53} role="button"
    enabled={!props.disabled} keyboardActivation="enterOrSpace" mouseCursor="pointer"
    accessibleName={`${P('openProject')}: ${props.project.name}`} onClick={props.onOpen}>
    <rectangle width="100%" height="100%" radii={10} clip background={theme().card}
      hoverBackground={theme().accent} border={{ width: 1, color: theme().border }}
      focusBorderColor={theme().focusRing} opacity={props.disabled ? 0.6 : 1}>
      <column width="100%" height="100%" gap={6}>
        <rectangle width="100%" height={props.previewHeight} shrink={0} background={theme().muted}>
          <Show when={thumbnail()} fallback={<row width="100%" height="100%" alignItems="center" justifyContent="center">
            <Icon name={kind().icon} size={28} color={theme().mutedForeground} />
          </row>}>{source => <image source={source()} width="100%" height="100%" fit="cover" alt={props.project.name} />}</Show>
        </rectangle>
        <column width="100%" minWidth={0} gap={3} padding={{ start: 9, end: 9 }}>
          <text width="100%" color={theme().foreground} fontSize={12} weight={600}
            textOverflow="ellipsis" lineClamp={1} text={props.project.name} />
          <text width="100%" color={theme().mutedForeground} fontSize={10} textOverflow="ellipsis"
            text={`${kind().label}  ·  ${date()}`} />
        </column>
      </column>
    </rectangle>
  </focusScope>
}
