import { createMemo, For } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { NativeEventPayload } from '@argui/host'
import type { WidgetTheme } from '@argui/widgets/solid'
import { clampColorChannel, hsvaToHex } from './colorPickerModel'
import type { ColorChannelSliderProps, ColorPadProps } from './colorPickerTypes'

const checkerRows = [0, 1] as const
const checkerColumns = Array.from({ length: 20 }, (_, index) => index)

/** Transparency reference paint; the grid itself has no input surface. */
export function ColorCheckerboard(): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <column width="100%" height="100%" background={theme().background}>
    <For each={checkerRows}>{row => <row width="100%" grow={1}>
      <For each={checkerColumns}>{column => <rectangle grow={1} height="100%"
        background={theme().foreground} opacity={(row + column) % 2 === 0 ? 0.15 : 0} />}</For>
    </row>}</For>
  </column>
}

/** Gradient-track slider with native pointer capture, keyboard and semantic actions. */
export function ColorChannelSlider(props: ColorChannelSliderProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  let dragging = false
  const fraction = () => clampColorChannel(props.value / props.max)
  const step = () => props.step ?? 1
  const change = (next: number) => {
    if (props.disabled || !Number.isFinite(next)) return
    const value = clampColorChannel(Math.round(next / step()) * step(), props.max)
    if (value !== props.value) props.onValueChange(value)
  }
  const pointer = (event: NativeEventPayload<'pointerDown' | 'pointerMove' | 'pointerUp'>) => {
    if (event.localX === undefined || !event.width || event.width <= 16) return
    change(clampColorChannel((event.localX - 8) / (event.width - 16)) * props.max)
  }
  const finish = () => { dragging = false; props.onValueCommit?.() }
  return <focusScope width={props.width} height={24} role="slider" accessibleName={props.label}
    numericValue={props.value} minimumValue={0} maximumValue={props.max} valueStep={step()} orientation="horizontal"
    canIncrement={!props.disabled} canDecrement={!props.disabled} canSetValue={!props.disabled} enabled={!props.disabled}
    keyboardActivation="none" onBlur={finish} onKey={event => {
      if (event.state !== 'pressed') return
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') change(props.value + step())
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') change(props.value - step())
      else if (event.key === 'PageUp') change(props.value + step() * 10)
      else if (event.key === 'PageDown') change(props.value - step() * 10)
      else if (event.key === 'Home') change(0)
      else if (event.key === 'End') change(props.max)
      else return
      props.onValueCommit?.()
    }} onSemanticAction={event => {
      if (event.action === 'increment') change(props.value + step())
      else if (event.action === 'decrement') change(props.value - step())
      else if (event.action === 'setValue' && typeof event.value === 'number') change(event.value)
      props.onValueCommit?.()
    }}>
    <touchArea width="100%" height="100%" enabled={!props.disabled} mouseCursor="pointer"
      onPointerDown={event => { dragging = !props.disabled; pointer(event) }}
      onMoved={event => { if (dragging) pointer(event) }}
      onPointerUp={event => { if (dragging) pointer(event); finish() }}
      onPointerCancel={finish}>
      <container width="100%" height="100%" opacity={props.disabled ? 0.5 : 1}>
        <rectangle position="absolute" inset={{ start: 8, end: 8, top: 8 }} height={8} radii={4} clip
          focusBorderColor={theme().focusRing}>
          {props.checkerboard ? <ColorCheckerboard /> : null}
          <rectangle position="absolute" inset={{ start: 0, end: 0, top: 0, bottom: 0 }} background={props.background} radii={4} />
        </rectangle>
        <container position="absolute" inset={{ start: 0, top: 4 }} width={16} height={16}
          transform={{ translateX: fraction() * Math.max(0, props.width - 16) }}>
          <rectangle width={16} height={16} radii={8} background={theme().background}
            border={{ width: 2, color: theme().foreground }} shadow={{ color: '#00000033', blur: 3, offsetY: 1 }} />
        </container>
      </container>
    </touchArea>
  </focusScope>
}

/** Saturation/brightness pad; arrows change either channel and Shift increases the step. */
export function ColorPad(props: ColorPadProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  const hue = createMemo(() => hsvaToHex({ hue: props.color.hue, saturation: 1, brightness: 1, alpha: 1 }))
  const background = createMemo(() => ({ kind: 'bilinear' as const, space: 'srgb' as const,
    corners: ['#ffffff', hue(), '#000000', '#000000'] as const }))
  let dragging = false
  const change = (saturation: number, brightness: number) => {
    if (!props.disabled) props.onValueChange(clampColorChannel(saturation), clampColorChannel(brightness))
  }
  const pointer = (event: NativeEventPayload<'pointerDown' | 'pointerMove' | 'pointerUp'>) => {
    if (event.localX === undefined || event.localY === undefined || !event.width || !event.height || event.width < 0 || event.height < 0) return
    if (!Number.isFinite(event.localX) || !Number.isFinite(event.localY)) return
    change(event.localX / event.width, 1 - event.localY / event.height)
  }
  const finish = () => { dragging = false; props.onValueCommit?.() }
  return <focusScope width={props.width} height={154} role="group" accessibleName={props.label}
    accessibleValue={props.valueDescription} enabled={!props.disabled} keyboardActivation="none"
    onBlur={finish} onKey={event => {
      if (event.state !== 'pressed') return
      const delta = event.shift ? 0.1 : 0.01
      if (event.key === 'ArrowRight') change(props.color.saturation + delta, props.color.brightness)
      else if (event.key === 'ArrowLeft') change(props.color.saturation - delta, props.color.brightness)
      else if (event.key === 'ArrowUp') change(props.color.saturation, props.color.brightness + delta)
      else if (event.key === 'ArrowDown') change(props.color.saturation, props.color.brightness - delta)
      else return
      props.onValueCommit?.()
    }}>
    <touchArea width="100%" height="100%" enabled={!props.disabled} mouseCursor="crosshair"
      onPointerDown={event => { dragging = !props.disabled; pointer(event) }}
      onMoved={event => { if (dragging) pointer(event) }}
      onPointerUp={event => { if (dragging) pointer(event); finish() }}
      onPointerCancel={finish}>
      <container width="100%" height="100%" opacity={props.disabled ? 0.5 : 1}>
        <rectangle width="100%" height="100%" radii={theme().radius} focusBorderColor={theme().focusRing}
          background={background()} />
        <container position="absolute" inset={{ start: -6, top: -6 }} width={12} height={12}
          transform={{ translateX: props.color.saturation * props.width, translateY: (1 - props.color.brightness) * 154 }}>
          <rectangle width={12} height={12} radii={6}
            background={hsvaToHex({ ...props.color, alpha: 1 })} border={{ width: 2, color: '#ffffff' }}
            shadow={{ color: '#00000080', blur: 3, offsetY: 1 }} />
        </container>
      </container>
    </touchArea>
  </focusScope>
}
