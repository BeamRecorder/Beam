import { createSignal, onMount, onCleanup, Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import { Switch } from '@argui/widgets/solid'
import type { BeamApi } from '../shared/beamApi'
import type { BeamTheme } from '../shared/beamThemeTypes'
import type { CaptureQuickSettings as QuickSettings, DesktopCapabilities } from '../shared/beamTypes'
import { useTR } from '../shared/i18n'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'
import { ErrorNotice } from '../shared/base-ui/errorNotice'

/** Native popover and hover submenu stay interactive beyond the preparation window. */
export function CaptureQuickSettings(props: {
  api: Pick<BeamApi, 'desktopCapabilities' | 'copyText'>; value: QuickSettings; disabled: boolean; screenshot: boolean;
  onChange: (patch: Partial<QuickSettings>) => void;
}) {
  const TR = useTR('Native'), P = useTR('HudPreferences'), theme = useTheme<BeamTheme>()
  const [open, setOpen] = createSignal(false), [countdown, setCountdown] = createSignal(false)
  const [capabilities, setCapabilities] = createSignal<DesktopCapabilities>({ taskbar: false, desktopIcons: false, captureOnly: false })
  const [error, setError] = createSignal('')
  let disposed = false
  onMount(() => { void props.api.desktopCapabilities().then(value => { if (!disposed) setCapabilities(value) })
    .catch(cause => { if (!disposed) setError(String(cause)) }) })
  onCleanup(() => { disposed = true })
  const close = () => { setOpen(false); setCountdown(false) }
  const choose = (seconds: number) => { props.onChange({ countdownSeconds: seconds }); setCountdown(false) }
  const Toggle = (key: 'hideTaskbar' | 'hideDesktopIcons', supported: () => boolean) => <touchArea onPointerEnter={() => setCountdown(false)}>
    <row width="100%" minHeight={32} gap={8} alignItems="center">
      <column width={0} grow={1} gap={2}>
        <text fontSize={12} color={theme().foreground}>{TR(key)}</text>
        <Show when={!supported()}><text fontSize={10} color={theme().mutedForeground}>{TR('desktopUnavailable')}</text></Show>
      </column>
      <Switch size="sm" accessibleName={TR(key)} value={!!props.value[key]}
        disabled={props.disabled || (!supported() && !props.value[key])}
        onValueChange={value => props.onChange({ [key]: value })} />
    </row>
  </touchArea>
  return <>
    <container tooltip={TR('quickSettings')}>
      <Button id="capture-quick-settings" variant="ghost" size="icon-xs" iconOnly shrink={0}
        accessibleName={TR('quickSettings')} disabled={props.disabled} expanded={open()} controls="capture-quick-popup"
        onClick={() => { if (open()) close(); else setOpen(true) }}><Icon name="settings" size={16} color={theme().foreground} /></Button>
    </container>
    <Show when={open()}><popupWindow id="capture-quick-popup" anchor="capture-quick-settings" placement="topEnd" width={240}
      allowOutsideWindow windowLayer="popover" dismissPolicy="outsidePointerOrEscape" containment="none"
      initialFocus="first" restoreFocus accessibleName={TR('quickSettings')} onDismiss={close}>
      <rectangle width="100%" padding={8} radii={theme().radius} background={theme().surface} border={{ width: 1, color: theme().border }}>
        <column width="100%" gap={6}>
          <touchArea id="capture-countdown-setting" width="100%" height={32} role="button" accessibleName={P('countdown')}
            enabled={!props.disabled && !props.screenshot} expanded={countdown()} controls="capture-countdown-popup"
            focusable focusOnTabNavigation keyboardActivation="enterOrSpace"
            onPointerEnter={() => { if (!props.disabled && !props.screenshot) setCountdown(true) }}
            onClick={() => setCountdown(true)}>
              <rectangle width="100%" height={32} padding={6} radii={theme().radius} hoverBackground={theme().controlHover}>
                <row width="100%" gap={8} alignItems="center" opacity={props.screenshot ? 0.5 : 1}>
                  <Icon name="clock-3" size={14} color={theme().mutedForeground} />
                  <container width={0} grow={1}><text fontSize={12} color={theme().foreground}>{P('countdown')}</text></container>
                  <text fontSize={11} color={theme().mutedForeground}>{`${props.value.countdownSeconds} s`}</text>
                  <Icon name="chevron-right" size={14} color={theme().mutedForeground} />
                </row>
              </rectangle>
          </touchArea>
          <Show when={countdown()}><popupWindow id="capture-countdown-popup" anchor="capture-countdown-setting" placement="rightStart" width={100}
            allowOutsideWindow windowLayer="popover" dismissPolicy="outsidePointerOrEscape" containment="none" restoreFocus
            accessibleName={P('countdown')} onDismiss={() => setCountdown(false)}>
            <rectangle width="100%" padding={4} radii={theme().radius} background={theme().surface} border={{ width: 1, color: theme().border }}>
              <column width="100%" gap={2}>{[1, 2, 3, 5, 10].map(seconds =>
                <Button id={`capture-countdown-${seconds}`} width="100%" variant="ghost" pressed={props.value.countdownSeconds === seconds} disabled={props.disabled}
                  accessibleName={`${P('countdown')} ${seconds} s`} onClick={() => choose(seconds)}>{`${seconds} s`}</Button>)}</column>
            </rectangle>
          </popupWindow></Show>
          <rectangle width="100%" height={1} background={theme().border} />
          {Toggle('hideTaskbar', () => capabilities().taskbar)}
          {Toggle('hideDesktopIcons', () => capabilities().desktopIcons)}
          <Show when={capabilities().captureOnly}><text fontSize={10} color={theme().mutedForeground}>{TR('captureOnly')}</text></Show>
          <ErrorNotice message={error()} fontSize={10} onCopy={text => props.api.copyText(text)} />
        </column>
      </rectangle>
    </popupWindow></Show>
  </>
}
