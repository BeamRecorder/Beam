import { createEffect, createSignal, Show } from 'solid-js';
import type { JSX } from '@argui/solid/jsx-runtime';
import { useTheme } from '@argui/solid';
import { InputField, Slider, type WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Icon } from '../../shared/base-ui/icon';

/** Shared label/control geometry matches Concat's contextual forms. */
export function PropertyRow(props: { label: string; children: JSX.Element }) {
  const theme = useTheme<WidgetTheme>();
  return <row width="100%" minHeight={28} gap={8} alignItems="center">
    <container width={82} shrink={0}><text width="100%" fontSize={12} lineClamp={2} color={theme().mutedForeground} text={props.label} /></container>
    <container grow={1} minWidth={0}>{props.children}</container>
  </row>;
}
export function PropertySection(props: { label: string; children: JSX.Element }) {
  const theme = useTheme<WidgetTheme>(), [open, setOpen] = createSignal(true);
  return <column width="100%" gap={0}>
    <rectangle width="100%" background={theme().popover}>
      <Button variant="ghost" width="100%" contentAlign="start" expanded={open()} onClick={() => setOpen(!open())}>
        <Icon name={open() ? 'chevron-down' : 'chevron-right'} size={12} color={theme().mutedForeground} />
        <text fontSize={12} weight={500} color={theme().foreground} text={props.label} />
      </Button>
    </rectangle>
    <Show when={open()}><column width="100%" padding={14} gap={8}>{props.children}</column></Show>
  </column>;
}
/** Invalid input stays visible, and only finite values within the domain may be submitted. */
export function NumberField(props: { label: string; value: number; min: number; max: number;
  width?: number; onChange: (value: number) => void }) {
  const [text, setText] = createSignal('');
  createEffect(() => setText(String(Math.round(props.value * 1000) / 1000)));
  const valid = () => text().trim() !== '' && Number.isFinite(Number(text())) && Number(text()) >= props.min && Number(text()) <= props.max;
  return <InputField width={props.width} accessibleName={props.label} value={text()} onValueChange={setText}
    invalid={!valid()} onSubmit={() => { if (valid()) props.onChange(Number(text())); }} />;
}
export function PropertySlider(props: { label: string; value: number; min: number; max: number;
  step?: number; onChange: (value: number) => void }) {
  return <PropertyRow label={props.label}><row width="100%" gap={8} alignItems="center">
    <Slider width={0} minWidth={0} grow={1} accessibleName={props.label} value={props.value} min={props.min} max={props.max}
      step={props.step ?? 0.01} onValueChange={props.onChange} />
    <NumberField width={60} {...props} />
  </row></PropertyRow>;
}
