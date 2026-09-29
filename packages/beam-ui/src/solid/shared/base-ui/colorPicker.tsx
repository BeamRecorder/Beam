import { batch, createEffect, createMemo, createSignal, Show, untrack } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import { InputField, type WidgetTheme } from '@argui/widgets/solid'
import { ColorChannelSlider, ColorCheckerboard, ColorPad } from './colorPickerControls'
import { hsvaToHex, hueSpectrum, parseHexColor } from './colorPickerModel'
import type { ColorPickerProps, HsvaColor } from './colorPickerTypes'

/** Reusable controlled color picker with a two-dimensional pad, hue, alpha and hexadecimal input. */
export function ColorPicker(props: ColorPickerProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  const [color, setColor] = createSignal<HsvaColor | undefined>(parseHexColor(props.value))
  const [hex, setHex] = createSignal(props.value.toUpperCase())
  const [invalid, setInvalid] = createSignal(!parseHexColor(props.value))
  const width = () => props.width ?? 248
  const rgb = createMemo(() => {
    const current = color()
    return current ? hsvaToHex({ ...current, alpha: 1 }) : '#000000ff'
  })
  const alphaBackground = createMemo(() => ({ kind: 'linear' as const, angle: 0, space: 'srgb' as const,
    stops: [{ offset: 0, color: `${rgb().slice(0, 7)}00` }, { offset: 1, color: rgb() }] }))
  createEffect(() => {
    const value = props.value
    const next = parseHexColor(value)
    const current = untrack(color)
    if (current && next && hsvaToHex(current) === hsvaToHex(next)) return
    if (next) {
      // Grey, white and black retain the hue selected before their saturation disappeared.
      setColor({ ...next, hue: next.saturation > 0 ? next.hue : current?.hue ?? next.hue,
        saturation: next.brightness === 0 ? current?.saturation ?? next.saturation : next.saturation })
    }
    setHex(value.toUpperCase())
    setInvalid(!next)
  })
  const change = (patch: Partial<HsvaColor>) => {
    const current = color()
    if (!current || props.disabled) return
    const next = { ...current, ...patch }
    if (next.hue === current.hue && next.saturation === current.saturation
      && next.brightness === current.brightness && next.alpha === current.alpha) return
    const value = hsvaToHex(next)
    batch(() => {
      setColor(next)
      setInvalid(false)
      if (value !== props.value.toLowerCase()) props.onValueChange(value)
    })
  }
  // Hex input changes at the interaction boundary, so dragging never reshapes its text.
  const commit = () => { const current = color(); if (current) setHex(hsvaToHex(current).toUpperCase()) }
  const changeHex = (value: string) => {
    setHex(value)
    const next = parseHexColor(value)
    setInvalid(!next)
    if (!next || props.disabled) return
    setColor(next)
    const normalized = hsvaToHex(next)
    if (normalized !== props.value.toLowerCase()) props.onValueChange(normalized)
  }
  const percentage = (value: number) => `${Math.round(value * 100)}%`
  const padDescription = () => {
    const current = color()
    return current ? `${props.labels.saturation} ${percentage(current.saturation)}, ${props.labels.brightness} ${percentage(current.brightness)}` : ''
  }
  return <column width={width()} gap={12}>
    <Show when={color()}>{current => <>
      <ColorPad width={width()} color={current()} label={props.labels.pad} valueDescription={padDescription()}
        disabled={props.disabled} onValueChange={(saturation, brightness) => change({ saturation, brightness })} onValueCommit={commit} />
      <column width="100%" gap={3}>
        <text fontSize={11} color={theme().mutedForeground}>{props.labels.hue}</text>
        <ColorChannelSlider width={width()} label={props.labels.hue} value={current().hue} max={360} background={hueSpectrum}
          disabled={props.disabled} onValueChange={hue => change({ hue })} onValueCommit={commit} />
      </column>
      <column width="100%" gap={3}>
        <text fontSize={11} color={theme().mutedForeground}>{props.labels.opacity}</text>
        <ColorChannelSlider width={width()} label={props.labels.opacity} value={current().alpha * 100} max={100} checkerboard
          background={alphaBackground()} disabled={props.disabled} onValueChange={alpha => change({ alpha: alpha / 100 })} onValueCommit={commit} />
      </column>
    </>}</Show>
    <row width="100%" gap={9} alignItems="center">
      <rectangle width={28} height={28} shrink={0} clip radii={theme().radius} border={{ width: 1, color: theme().border }}>
        <ColorCheckerboard />
        <Show when={color()}>{current => <rectangle position="absolute" inset={{ start: 0, end: 0, top: 0, bottom: 0 }} background={hsvaToHex(current())} />}</Show>
      </rectangle>
      <InputField width="100%" grow={1} accessibleName={props.labels.hex} value={hex()} onValueChange={changeHex}
        invalid={invalid()} disabled={props.disabled} />
    </row>
    <Show when={invalid()}><text fontSize={11} color={theme().destructive} role="alert">{props.labels.invalid}</text></Show>
  </column>
}
