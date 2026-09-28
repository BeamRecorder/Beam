import { useTR } from '../i18n'
import { createSignal, onCleanup, Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { WidgetTheme } from '@argui/widgets/solid'
import type { ShortcutFieldProps, ShortcutKeyEvent } from './shortcutTypes'
import { shortcutFromEvent } from './shortcutKeys'
import { KbdGroup } from './kbd'

/** Captures one chord on a focused control and commits it immediately. */
export function ShortcutField(props: ShortcutFieldProps): JSX.Element {
  const TR = useTR('Native')
  const theme = useTheme<WidgetTheme>()
  const [capturing, setCapturing] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const capture = (value: boolean) => {
    if (capturing() === value) return
    setCapturing(value); props.onCaptureChange?.(value)
  }
  onCleanup(() => { if (capturing()) props.onCaptureChange?.(false) })
  const key = async (event: ShortcutKeyEvent) => {
    if (event.state !== 'pressed' || saving()) return
    if (!capturing()) { if (event.key === 'Enter' || event.key === ' ') capture(true); return }
    if (event.key === 'Escape') { capture(false); return }
    const value = shortcutFromEvent(event)
    if (!value) return
    setSaving(true)
    try { if (await props.onChange(value)) capture(false) }
    finally { setSaving(false) }
  }
  return <focusScope role="button" accessibleName={props.label} accessibleValue={props.value}
    enabled={!props.disabled || capturing()} busy={saving()} focusOnClick keyboardActivation="none" width="100%" height={34}
    onClick={() => { if (!saving()) capture(true) }} onKey={event => void key(event)} onBlur={() => capture(false)}>
    <touchArea width="100%" height="100%" mouseCursor="pointer">
      <rectangle width="100%" height="100%" radii={6} padding={4}
        border={{ width: 1, color: capturing() ? theme().ring : theme().border }} background={theme().background}>
        <row width="100%" height="100%" alignItems="center" justifyContent="end">
        <Show when={capturing()} fallback={<KbdGroup value={props.value} />}>
          <text color={theme().mutedForeground} fontSize={11}>{TR('enterShortcut')}</text>
        </Show>
        </row>
      </rectangle>
    </touchArea>
  </focusScope>
}
