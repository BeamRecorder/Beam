import { createEffect, createSignal, Show } from 'solid-js'
import { useTheme } from '@argui/solid'
import type { JSX } from '@argui/solid/jsx-runtime'
import type { WidgetTheme } from '@argui/widgets/solid'
import { Button } from '../shared/base-ui/button'
import { ErrorNotice } from '../shared/base-ui/errorNotice'
import { Icon } from '../shared/base-ui/icon'
import { ControlPopover } from '../shared/base-ui/controlPopover'
import { SliderPopover } from '../shared/base-ui/sliderPopover'
import { ColorPicker } from '../shared/base-ui/colorPicker'
import { colorWithOpacity } from '../shared/base-ui/colorPickerModel'
import { useTR } from '../shared/i18n'
import type { TeleprompterControl, TeleprompterToolbarProps } from './teleprompterUiTypes'
import { resolvedTextColor } from './textColor'

/** One floating row for the four live adjustments and scrolling preview. */
export function TeleprompterToolbar(props: TeleprompterToolbarProps): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  const TR = useTR('Teleprompter'), N = useTR('Native')
  const [active, setActive] = createSignal<TeleprompterControl>()
  const open = (control: TeleprompterControl, value: boolean) => setActive(value ? control : undefined)
  const maxContentHeight = () => props.viewportHeight - 84 - theme().overlayPadding * 2
  createEffect(() => props.onPopoverOpenChange(active() !== undefined))
  return <container position="absolute" inset={{ start: 16, end: 16, bottom: 20 }}>
    <column width="100%" gap={8} alignItems="center">
      <Show when={props.error}>
        <rectangle maxWidth={340} padding={9} radii={theme().radius} background={theme().background}>
          <ErrorNotice message={props.error} lineClamp={3} onCopy={props.onCopyError} />
        </rectangle>
      </Show>
      <rectangle width={228} padding={8} radii={theme().radius * 2} background={colorWithOpacity(theme().card, 0.72)}
        backdropFilter="blur(20px)" border={{ width: 1, color: colorWithOpacity(theme().outlineBorder, 0.8) }}
        shadow={{ color: theme().overlayShadowColor, blur: theme().overlayShadowBlur, offsetY: theme().overlayShadowOffsetY }}
        role="group" accessibleName={N('teleprompterToolbar')}>
        <row width="100%" alignItems="center" gap={8}>
          <row alignItems="center" gap={4}>
            <SliderPopover label={N('playbackSpeed')} icon={<Icon name="gauge" size={20} color={theme().foreground} />}
              open={active() === 'speed'} onOpenChange={value => open('speed', value)} disabled={!props.ready}
              value={props.document.scrollSpeed} min={5} max={200} formatValue={value => `${Math.round(value)} px/s`}
              onValueChange={scrollSpeed => props.onUpdate({ scrollSpeed })} />
            <SliderPopover label={TR('fontSize')} icon={<Icon name="a-large-small" size={20} color={theme().foreground} />}
              open={active() === 'font'} onOpenChange={value => open('font', value)} disabled={!props.ready}
              value={props.document.fontSize} min={16} max={96} formatValue={value => `${Math.round(value)} px`}
              onValueChange={fontSize => props.onUpdate({ fontSize })} />
            <ControlPopover label={N('textColor')} open={active() === 'color'} onOpenChange={value => open('color', value)}
              disabled={!props.ready} contentWidth={276} contentHeight={296} maxContentHeight={maxContentHeight()}
              icon={<Icon name="palette" size={20} color={theme().foreground} />}>
              <column width="100%" gap={12}>
                <text fontSize={12} weight={600} color={theme().foreground}>{N('textColor')}</text>
                <ColorPicker width={276 - theme().overlayPadding * 2} value={resolvedTextColor(props.document, theme().foreground)}
                  onValueChange={textColor => props.onUpdate({ textColor, useThemeTextColor: false })}
                  labels={{ pad: N('colorPad'), hue: N('colorHue'), opacity: N('colorOpacity'), saturation: N('colorSaturation'),
                    brightness: N('colorBrightness'), hex: N('hexColor'), invalid: N('invalidColor') }} />
              </column>
            </ControlPopover>
            <SliderPopover label={N('windowOpacity')} icon={<Icon name="circle-dashed" size={20} color={theme().foreground} />}
              open={active() === 'opacity'} onOpenChange={value => open('opacity', value)} disabled={!props.ready}
              value={props.document.windowOpacity} min={0.1} max={1} step={0.01} formatValue={value => `${Math.round(value * 100)}%`}
              onValueChange={windowOpacity => props.onUpdate({ windowOpacity })} />
          </row>
          <rectangle width={1} height={20} shrink={0} background={theme().border} role="separator" orientation="vertical" />
          <container tooltip={props.playing ? TR('pause') : N('previewHint')}>
            <Button variant="ghost" size="icon-lg" iconOnly accessibleName={props.playing ? TR('pause') : N('previewHint')}
              pressed={props.playing} disabled={!props.ready || props.pending || !props.document.text.trim()}
              onClick={() => { setActive(undefined); props.onPreview() }}>
              <Icon name={props.playing ? 'pause' : 'play'} size={20} color={props.playing ? theme().primary : theme().foreground} />
            </Button>
          </container>
        </row>
      </rectangle>
    </column>
  </container>
}
