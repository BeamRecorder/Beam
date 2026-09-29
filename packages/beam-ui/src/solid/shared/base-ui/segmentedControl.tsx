import { For, Show, createMemo, createUniqueId, untrack } from 'solid-js';
import type { JSX } from '@argui/solid/jsx-runtime';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { SegmentedControlProps } from './segmentedControlTypes';
import { Icon } from './icon';
import { Tooltip } from './tooltip';

/** The recorder's retained native indicator, shared by mode, sequence and library tabs. */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): JSX.Element {
  const theme = useTheme<WidgetTheme>();
  const id = props.id ?? `beam-segmented-${createUniqueId()}`;
  const below = untrack(() => props.labelLayout !== 'beside');
  const options = createMemo(() => new Map(props.options.map(option => [option.id, option])));
  const totalWidth = () => props.width ?? (8 + props.options.length * (props.compact ? 40 : 108));
  const itemWidth = () => `${100 / Math.max(1, props.options.length)}%` as const;
  const labelThreshold = () => props.labelMinimumWidth === undefined ? undefined : props.options.length * props.labelMinimumWidth + 8;
  const height = () => props.height ?? (props.compact ? 32 : 42);
  const activeIndex = () => Math.max(0, props.options.findIndex(item => item.id === props.value));
  function move(key: string) {
    const count = props.options.length;
    if (!count || props.disabled) return;
    const next = key === 'Home' ? 0 : key === 'End' ? count - 1 :
      key === 'ArrowLeft' ? (activeIndex() + count - 1) % count :
      key === 'ArrowRight' ? (activeIndex() + 1) % count : undefined;
    if (next !== undefined) props.onChange(props.options[next]!.id);
  }
  return <container id={id} width={totalWidth()} maxWidth={props.maxWidth} minWidth={0}
    height={height()} shrink={0} alignSelf={props.contentAlign ?? 'center'} radii={theme().radius} background={theme().muted}
    border={{ width: 1, color: theme().border }} containerScope={id}>
    <row position="absolute" inset={{ start: 3, end: 3, top: 3 }} height={Math.max(0, height() - 8)}>
      <container id={`${id}-indicator-offset`} width={`${activeIndex() * 100 / Math.max(1, props.options.length)}%`}
        height="100%" shrink={0} transitionMs={170} transitionTimingFunction="cubic-bezier(0.2, 0, 0, 1)" />
      <container width={itemWidth()} height="100%" shrink={0}>
        <container id={`${id}-indicator`} width="100%" height="100%" radii={5} background={theme().secondary} />
      </container>
    </row>
    <row width="100%" height="100%" padding={3} role="tabList" accessibleName={props.label}>
      <For each={props.options.map(option => option.id)}>{key => {
        const initial = options().get(key)!;
        const option = () => options().get(key) ?? initial;
        const color = () => props.value === key ? theme().primary : theme().mutedForeground;
        const icon = () => <Show when={option().asset || option().icon}>
          <Show when={option().asset} fallback={<Icon name={option().icon!} size={below ? 15 : 12} color={color()} />}>
            <svg source={option().asset!} width={15} height={15} color={color()} />
          </Show>
        </Show>;
        const label = () => <Show when={!props.compact}>
          <container id={`${id}-${key}-label`} width={below ? '100%' : 0} grow={below ? undefined : 1}
            minWidth={0} height={14} clip containerRules={props.labelMinimumWidth === undefined ? undefined : [{
              scope: id, when: { maxWidth: labelThreshold()! }, style: { height: 0 },
            }]}>
            <text width="100%" textAlign={below ? 'center' : props.contentAlign ?? 'center'} fontSize={11} lineHeight={14} lineClamp={1}
              color={props.value === key ? theme().foreground : theme().mutedForeground} text={option().label} />
          </container>
        </Show>;
        return <focusScope id={`${id}-${key}`} role="tab" accessibleName={option().label}
            selected={props.value === key} enabled={!props.disabled} keyboardActivation="enterOrSpace"
            mouseCursor={props.disabled ? 'notAllowed' : 'pointer'}
            width={0} height={height() - 8} grow={1} shrink={1} minWidth={0}
            onClick={() => { if (!props.disabled) props.onChange(key); }}
            onKey={event => { if (event.state === 'pressed') move(event.key); }}>
            <rectangle width="100%" height="100%" radii={5} focusBorderColor={theme().focusRing}>
              <Tooltip id={`${id}-${key}-hint`} content={option().label} width="100%" height="100%"
                enabled={props.compact || labelThreshold() !== undefined}
                onlyBelow={props.compact || labelThreshold() === undefined ? undefined : { scope: id, width: labelThreshold()! }}
                mouseCursor={props.disabled ? 'notAllowed' : 'pointer'}>
                {below
                  ? <column width="100%" height="100%" alignItems="center" justifyContent="center" gap={2}
                      containerRules={labelThreshold() === undefined ? undefined : [{ scope: id,
                        when: { maxWidth: labelThreshold()! }, style: { gap: 0 } }]}>{icon()}{label()}</column>
                  : <row width="100%" height="100%" alignItems="center" justifyContent={props.contentAlign ?? 'center'} gap={5}
                      padding={{ start: 6, end: 6 }}>{icon()}{label()}</row>}
              </Tooltip>
            </rectangle>
          </focusScope>;
      }}</For>
    </row>
  </container>;
}
