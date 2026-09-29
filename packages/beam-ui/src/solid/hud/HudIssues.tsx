import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import { ScrollShadow, type WidgetTheme } from '@argui/widgets/solid'
import { Button } from '../shared/base-ui/button'
import { CopyButton } from '../shared/base-ui/copyButton'
import { Icon } from '../shared/base-ui/icon'
import { useTR } from '../shared/i18n'
import type { BeamApi } from '../shared/beamApi'
import type { InputAccessStatus } from '../shared/beamTypes'
import { buildHudIssues } from './hudIssuesModel'

/** A hoverable diagnostic surface that keeps every current issue accessible. */
export function HudIssues(props: { api: BeamApi; errors: string[] }): JSX.Element {
  const theme = useTheme<WidgetTheme>(), T = useTR('HUD'), P = useTR('HudPreferences'), C = useTR('CopyButton')
  const [open, setOpen] = createSignal(false)
  const [linux, setLinux] = createSignal(false)
  const [access, setAccess] = createSignal<InputAccessStatus | null>(null)
  const [requesting, setRequesting] = createSignal(false)
  const [statusError, setStatusError] = createSignal('')
  let opening: ReturnType<typeof setTimeout> | undefined
  const scheduleOpen = () => {
    clearTimeout(opening)
    opening = setTimeout(() => { opening = undefined; setOpen(true) }, 180)
  }
  onCleanup(() => clearTimeout(opening))
  const refresh = () => void props.api.inputAccessStatus().then(setAccess).catch(cause => setStatusError(String(cause)))
  onMount(() => {
    void props.api.info().then(value => { setLinux(value.operatingSystem === 'linux'); if (value.operatingSystem === 'linux') refresh() })
      .catch(cause => setStatusError(String(cause)))
    onCleanup(props.api.onEvent(event => {
      if (event.type === 'inputAccessChanged' || (event.type === 'windowVisibility' && event.window === 'main' && event.visible))
        if (linux()) refresh()
    }))
  })
  const issues = createMemo(() => buildHudIssues(props.errors, access(), linux(), statusError(), {
    errorTitle: T('recordingErrorTitle'), permissionTitle: T('interactionAccessNoticeTitle'),
    unavailableTitle: T('interactionAccessUnavailableTitle'), accessDescription: P('interactionAccessDescriptionLinux'),
  }))
  async function requestAccess(): Promise<void> {
    setRequesting(true); setStatusError('')
    try { setAccess(await props.api.requestInputAccess()) }
    catch (cause) { setStatusError(String(cause)) }
    finally { setRequesting(false) }
  }
  return <Show when={issues().length > 0}>
    <touchArea id="hud-issues-trigger" width={48} height={28} role="button" focusable focusOnTabNavigation
      keyboardActivation="enterOrSpace" accessibleName={`${issues().length} ${T('recordingErrorTitle')}`}
      expanded={open()} controls="hud-issues-popover" mouseCursor="pointer"
      onPointerEnter={scheduleOpen} onPointerLeave={() => clearTimeout(opening)} onClick={scheduleOpen}>
      <row width="100%" height="100%" alignItems="center" justifyContent="center" gap={3} radii={7} background={open() ? theme().controlHover : theme().card}>
        <Icon name="triangle-alert" size={17} color={theme().destructive} />
        <text fontSize={11} weight={700} color={theme().destructive}>{issues().length}</text>
      </row>
    </touchArea>
    <Show when={open()}><popupWindow id="hud-issues-popover" anchor="hud-issues-trigger" placement="bottomEnd"
      width={340} allowOutsideWindow windowLayer="popover" dismissPolicy="outsidePointerOrEscape"
      containment="none" initialFocus="" restoreFocus={false} accessibleName={T('recordingErrorTitle')}
      onDismiss={() => setOpen(false)}>
      <rectangle width="100%" radii={theme().overlayRadius} clip background={theme().popover}
        border={{ width: 1, color: theme().outlineBorder }} shadow={{ offsetY: 8, blur: 20, color: theme().overlayShadowColor }}>
        <ScrollShadow width="100%" height={Math.min(290, Math.max(84, issues().length * 82 + 12))} scrollbarEndInset={0}>
          <column width="100%" padding={10} gap={8}>
            <For each={issues()}>{issue => <column width="100%" gap={5} padding={8} radii={7} background={theme().surface}>
              <row width="100%" alignItems="center" gap={6}>
                <Icon name="triangle-alert" size={14} color={theme().destructive} />
                <container grow={1} minWidth={0}><text fontSize={12} weight={600} color={theme().foreground}>{issue.title}</text></container>
                <CopyButton value={issue.detail} onCopy={text => props.api.copyText(text)}
                  label={C('copyError')} copiedLabel={C('copied')} errorLabel={C('copyFailed')} />
              </row>
              <text width="100%" fontSize={11} color={theme().mutedForeground}>{issue.detail}</text>
              <Show when={issue.permission && access()?.canRequest}>
                <Button size="sm" variant="secondary" disabled={requesting()} onClick={() => void requestAccess()}>{T('authorizeInteractions')}</Button>
              </Show>
            </column>}</For>
          </column>
        </ScrollShadow>
      </rectangle>
    </popupWindow></Show>
  </Show>
}
