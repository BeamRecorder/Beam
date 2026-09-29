import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import { InputField, VirtualList, type WidgetTheme } from '@argui/widgets/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { BeamApi } from '../shared/beamApi'
import type { NativeProjectSummary } from '../shared/beamTypes'
import { useTR } from '../shared/i18n'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import { ErrorNotice } from '../shared/base-ui/errorNotice'
import { useWindowMetrics } from '../shared/useWindowMetrics'
import { ProjectCard } from './ProjectCard'
import { projectGrid } from './projectGrid'
import { indexProjects, searchProjects } from './projectSearch'

/** Native, searchable project library. The host supplies validated project IDs only. */
export function ProjectPicker(props: { api: BeamApi }): JSX.Element {
  const P = useTR('ProjectPicker'), T = useTR('TopbarHUD')
  const theme = useTheme<WidgetTheme>()
  const metrics = useWindowMetrics(props.api, { width: 600, height: 520 })
  const [projects, setProjects] = createSignal<NativeProjectSummary[]>([])
  const [query, setQuery] = createSignal('')
  const [loading, setLoading] = createSignal(true)
  const [opening, setOpening] = createSignal<string | null>(null)
  const [error, setError] = createSignal('')
  const [version, setVersion] = createSignal(0)
  const indexed = createMemo(() => indexProjects(projects()))
  const filtered = createMemo(() => searchProjects(indexed(), query()))
  const grid = createMemo(() => projectGrid(metrics().width))
  const columns = () => grid().columns
  const cardWidth = () => grid().cardWidth
  const previewHeight = () => grid().previewHeight
  const rowHeight = () => grid().rowHeight
  let request = 0
  let disposed = false

  async function refresh(): Promise<void> {
    const current = ++request
    setLoading(true)
    setError('')
    try {
      const items = await props.api.listProjects()
      if (disposed || current !== request) return
      setProjects(items)
      setVersion(value => value + 1)
    } catch (cause) {
      if (!disposed && current === request) setError(String(cause))
    } finally {
      if (!disposed && current === request) setLoading(false)
    }
  }

  async function open(project: NativeProjectSummary): Promise<void> {
    if (opening()) return
    setOpening(project.id)
    setError('')
    try {
      await props.api.openEditor(project.id, 'video')
      await props.api.hideWindow()
    } catch (cause) { setError(String(cause)) }
    finally { setOpening(null) }
  }

  async function createProject(): Promise<void> {
    setError('')
    try {
      await props.api.openVideoEditor()
      await props.api.hideWindow()
    } catch (cause) { setError(String(cause)) }
  }

  onMount(() => {
    void refresh()
    onCleanup(props.api.onEvent(event => {
      if (event.type === 'windowVisibility' && event.window === 'projects' && event.visible) void refresh()
    }))
  })
  onCleanup(() => { disposed = true; request++ })

  const row = (index: number): JSX.Element => {
    const cards = filtered().slice(index * columns(), (index + 1) * columns())
    return <container width="100%" height={rowHeight()} padding={{ bottom: 12 }}>
      <row width="100%" gap={12}>
        <For each={cards}>{project => <ProjectCard api={props.api} project={project}
          width={cardWidth()} previewHeight={previewHeight()} disabled={opening() !== null}
          onOpen={() => void open(project)} />}</For>
      </row>
    </container>
  }

  return <WindowSurface api={props.api} radius={16}>
    <column width="100%" height="100%">
      <row width="100%" height={42} shrink={0} padding={{ start: 16, end: 9 }} alignItems="center" background={theme().card}>
        <container height="100%" grow={1} minWidth={0}>
          <touchArea width="100%" height="100%" mouseCursor="grab" onPointerDown={() => void props.api.dragWindow().catch(console.error)}>
            <row height="100%" gap={8} alignItems="center">
              <Icon name="film" size={16} color={theme().primary} />
              <text fontSize={12} weight={600} color={theme().foreground}>{P('projects')}</text>
            </row>
          </touchArea>
        </container>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('minimize')}
          onClick={() => void props.api.minimizeWindow().catch(console.error)}>
          <Icon name="minus" size={16} color={theme().mutedForeground} />
        </Button>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('close')}
          onClick={() => void props.api.hideWindow().catch(console.error)}>
          <Icon name="x" size={16} color={theme().mutedForeground} />
        </Button>
      </row>
      <rectangle width="100%" height={1} shrink={0} background={theme().border} />
      <column width="100%" grow={1} minHeight={0} padding={{ start: 18, end: 18, top: 17, bottom: 16 }} gap={13}>
        <row width="100%" alignItems="center" gap={8} shrink={0}>
          <column width={0} grow={1} minWidth={0} gap={3}>
            <text color={theme().foreground} fontSize={20} weight={700}>{P('projects')}</text>
            <text color={theme().mutedForeground} fontSize={11}>{P('chooseRecording')}</text>
          </column>
          <Button variant="ghost" size="icon-xs" iconOnly accessibleName={P('refreshProjects')}
            disabled={loading()} onClick={() => void refresh()}>
            <Icon name="rotate-cw" size={15} color={theme().mutedForeground} />
          </Button>
          <Button variant="secondary" size="sm" accessibleName={P('newProject')}
            onClick={() => void createProject()}>
            <Icon name="plus" size={14} color={theme().foreground} />
            <text color={theme().foreground} fontSize={12} weight={500}>{P('newProject')}</text>
          </Button>
        </row>
        <InputField type="search" accessibleName={P('searchProjects')} placeholder={P('searchPlaceholder')}
          value={query()} onValueChange={value => { setQuery(value); setVersion(current => current + 1) }}
          leading={<Icon name="search" size={15} color={theme().mutedForeground} />}
          trailing={<Show when={query()}><Button variant="ghost" size="icon-xs" iconOnly accessibleName={P('clearSearch')}
            onClick={() => { setQuery(''); setVersion(current => current + 1) }}>
            <Icon name="x" size={13} color={theme().mutedForeground} />
          </Button></Show>} />
        <row width="100%" alignItems="center" shrink={0}>
          <text fontSize={11} weight={600} color={theme().mutedForeground}>{`${filtered().length} ${P('projects')}`}</text>
        </row>
        <Show when={!loading()} fallback={<column grow={1} justifyContent="center" alignItems="center">
          <text color={theme().mutedForeground} fontSize={12}>{P('loadingProjects')}</text>
        </column>}>
          <Show when={filtered().length > 0} fallback={<column grow={1} justifyContent="center" alignItems="center" gap={9}>
            <Icon name={projects().length ? 'search' : 'film'} size={27} color={theme().mutedForeground} />
            <text color={theme().foreground} fontSize={13} weight={600}>{projects().length ? P('noSearchResults') : P('noProjects')}</text>
            <Show when={query()}><Button variant="link" size="sm" onClick={() => setQuery('')}>{P('clearSearch')}</Button></Show>
          </column>}>
            <VirtualList id="native-project-grid" width="100%" grow={1}
              count={Math.ceil(filtered().length / columns())} estimate={rowHeight()}
              variable={false} overscan={1} dataVersion={version() * 100000 + Math.round(metrics().width)}
              itemKey={index => filtered()[index * columns()].id} renderItem={row} />
          </Show>
        </Show>
        <ErrorNotice message={error()} onCopy={value => props.api.copyText(value)} />
      </column>
      <keyBinding shortcut="Escape" onActivated={() => void props.api.hideWindow().catch(console.error)} />
    </column>
  </WindowSurface>
}
