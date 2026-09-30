import { For, Show, createMemo } from 'solid-js';
import { Switch } from '@argui/widgets/solid';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import { NumberField, PropertyRow, PropertySection } from './PropertyRow';
import { cursorControlStyle } from './cursorControlModel';
import { ValueControl } from './ValueControl';
import type { CursorControlsProps } from './cursorControlTypes';
import type { CursorMotion, Parameter, ShadowDirection, RippleStyle } from '../shared/generated/editorContracts';

/** Uses the original Beam settings and the engine's real artwork catalogue. */
export function CursorControls(props: CursorControlsProps) {
  const TR = useTR('NativeEditor');
  const style = createMemo(() => cursorControlStyle(props.style));
  const pack = () => props.editor.cursorPacks().find(pack => pack.id === style().selection.packId);
  const selection = () => style().selection;
  const selected = () => selection().mode === 'automatic' ? 'automatic' : selection().cursorId ?? '';
  const motion = (value: Partial<CursorMotion>) => props.onChange({ motion: { ...style().motion, preset: 'custom', ...value }, smoothingMs: value.smoothing === 0 ? 0 : 60 });
  const parameter = (key: string, value: [number, number, number, number]): Parameter => ({ key, label: TR(key), group: 'Cursor', unit: '', valueType: { kind: 'color' }, default: { kind: 'color', value }, animatable: false });
  return <>
    <PropertyRow label={TR('cursorPack')}><Select id="cursor-pack" label={TR('cursorPack')} value={selection().packId}
      options={props.editor.cursorPacks().map(pack => ({ value: pack.id, label: pack.name }))}
      onValueChange={packId => props.onChange({ selection: { packId, mode: 'automatic', cursorId: null } })} /></PropertyRow>
    <PropertyRow label={TR('cursorType')}><Select id="cursor-artwork" label={TR('cursorType')} value={selected()}
      options={[{ value: 'automatic', label: TR('cursorAutomatic') }, ...(pack()?.cursors.map(cursor => ({ value: cursor.id, label: cursor.label })) ?? [])]}
      onValueChange={id => props.onChange({ shape: 'pointer', selection: { ...selection(), mode: id === 'automatic' ? 'automatic' : 'fixed', cursorId: id === 'automatic' ? null : id } })} /></PropertyRow>
    <PropertySection label={TR('cursorShadow')}>
      <PropertyRow label={TR('enabled')}><Switch accessibleName={TR('cursorShadow')} value={style().shadow.enabled} onValueChange={enabled => props.onChange({ shadow: { ...style().shadow, enabled } })} /></PropertyRow>
      <PropertyRow label={TR('blur')}><NumberField label={TR('blur')} value={style().shadow.blur} min={0} max={30} onChange={blur => props.onChange({ shadow: { ...style().shadow, blur } })} /></PropertyRow>
      <PropertyRow label={TR('color')}><ValueControl id="cursor-shadow-color" parameter={parameter('color', style().shadow.color)} value={{ kind: 'color', value: style().shadow.color }} onChange={value => { if (value.kind === 'color') props.onChange({ shadow: { ...style().shadow, color: value.value } }); }} /></PropertyRow>
      <PropertyRow label={TR('direction')}><Select id="cursor-shadow-direction" label={TR('direction')} value={style().shadow.direction}
        options={(['all', 'bottom', 'bottom-right', 'top-left'] as const).map(value => ({ value, label: TR(`shadow-${value}`) }))}
        onValueChange={direction => props.onChange({ shadow: { ...style().shadow, direction: direction as ShadowDirection } })} /></PropertyRow>
    </PropertySection>
    <PropertySection label={TR('cursorMotion')}>
      <PropertyRow label={TR('motionPreset')}><Select id="cursor-motion-preset" label={TR('motionPreset')} value={style().motion.preset}
        options={(['focused', 'smooth', 'custom'] as const).map(value => ({ value, label: TR(value) }))} onValueChange={preset => {
          if (preset === 'custom') motion({ preset });
          else motion({ preset: preset as CursorMotion['preset'], smoothing: 0.67, springMassMultiplier: preset === 'focused' ? 1 : 1.29, motionBlur: preset === 'focused' ? 0.25 : 0.4 });
        }} /></PropertyRow>
      <PropertyRow label={TR('cursorSmoothing')}><NumberField label={TR('cursorSmoothing')} value={style().motion.smoothing} min={0} max={1} onChange={smoothing => motion({ smoothing })} /></PropertyRow>
      <PropertyRow label={TR('springMass')}><NumberField label={TR('springMass')} value={style().motion.springMassMultiplier} min={0.5} max={2} onChange={springMassMultiplier => motion({ springMassMultiplier })} /></PropertyRow>
      <PropertyRow label={TR('motionBlur')}><NumberField label={TR('motionBlur')} value={style().motion.motionBlur} min={0} max={1} onChange={motionBlur => motion({ motionBlur })} /></PropertyRow>
    </PropertySection>
    <For each={['left', 'right'] as const}>{button => {
      const effect = () => style().clickEffects[button];
      const update = (value: Partial<ReturnType<typeof effect>>) => props.onChange({ clickEffects: { ...style().clickEffects, [button]: { ...effect(), ...value } } });
      return <PropertySection label={TR(`${button}Click`)}>
        <PropertyRow label={TR('clickSpring')}><Switch accessibleName={TR('clickSpring')} value={effect().springEnabled} onValueChange={springEnabled => update({ springEnabled })} /></PropertyRow>
        <PropertyRow label={TR('intensity')}><NumberField label={TR('intensity')} value={effect().springIntensity} min={0} max={100} onChange={springIntensity => update({ springIntensity })} /></PropertyRow>
        <PropertyRow label={TR('ripple')}><Switch accessibleName={TR('ripple')} value={effect().rippleEnabled} onValueChange={rippleEnabled => update({ rippleEnabled })} /></PropertyRow>
        <Show when={effect().rippleEnabled}>
          <PropertyRow label={TR('shape')}><Select id={`cursor-ripple-${button}`} label={TR('shape')} value={effect().rippleStyle}
            options={(['none', 'single', 'double', 'solid'] as const).map(value => ({ value, label: TR(`ripple-${value}`) }))} onValueChange={rippleStyle => update({ rippleStyle: rippleStyle as RippleStyle })} /></PropertyRow>
          <PropertyRow label={TR('cursorSize')}><NumberField label={TR('cursorSize')} value={effect().rippleSize} min={10} max={80} onChange={rippleSize => update({ rippleSize })} /></PropertyRow>
          <PropertyRow label={TR('color')}><ValueControl id={`cursor-click-color-${button}`} parameter={parameter('color', effect().rippleColor)} value={{ kind: 'color', value: effect().rippleColor }} onChange={value => { if (value.kind === 'color') update({ rippleColor: value.value }); }} /></PropertyRow>
        </Show>
      </PropertySection>;
    }}</For>
    <PropertyRow label={TR('fadeDuration')}><NumberField label={TR('fadeDuration')} value={style().fadeDurationMs} min={0} max={1000} onChange={fadeDurationMs => props.onChange({ fadeDurationMs: Math.round(fadeDurationMs) })} /></PropertyRow>
  </>;
}
