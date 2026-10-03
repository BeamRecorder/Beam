import { defineComponent, h, reactive, nextTick } from 'vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGradient } from '../useGradient';
import type { GradientProps, GradientValue } from '../../gradient-types';
enableAutoUnmount(afterEach);
const base = (): GradientValue => ({
  type: 'linear',
  angle: 45,
  stops: [
    { id: 'start', position: 0.25, color: '#000000', alpha: 1 },
    { id: 'middle', position: 0.5, color: '#ff0000', alpha: 0.5 },
    { id: 'end', position: 0.75, color: '#ffffff', alpha: 1 },
  ],
});
function setup(overrides: Partial<GradientProps> = {}) {
  const props = reactive<GradientProps>({ modelValue: base(), ...overrides });
  const emit = vi.fn();
  let state!: ReturnType<typeof useGradient>;
  mount(
    defineComponent({
      setup() {
        state = useGradient(props, emit);
        return () => h('div');
      },
    }),
  );
  return { props, emit, state };
}
describe('gradient state', () => {
  it('initializes selection without publishing or mutating the document', () => {
    const { state, emit, props } = setup();
    expect(state.selectedStopId.value).toBe('start');
    expect(state.preview.value).toContain('45deg');
    expect(state.value.value.stops[0]).not.toBe(props.modelValue!.stops[0]);
    expect(emit).not.toHaveBeenCalled();
  });
  it('retains a selection across external edits and restores one after removal', async () => {
    const { state, props } = setup();
    state.selectStop('middle');
    state.selectStop('missing');
    props.modelValue = { ...base(), angle: 91 };
    await nextTick();
    expect(state.selectedStopId.value).toBe('middle');
    expect(state.value.value.angle).toBe(91);
    props.modelValue = { ...base(), stops: [base().stops[0]!, base().stops[2]!] };
    await nextTick();
    expect(state.selectedStopId.value).toBe('start');
  });
  it('adds interpolated stops with unique identities and retains immutable emissions', () => {
    const { state, emit, props } = setup();
    state.addStop();
    state.addStop();
    expect(state.value.value.stops).toHaveLength(5);
    expect(new Set(state.value.value.stops.map((stop) => stop.id)).size).toBe(5);
    const first = emit.mock.calls[0]![1] as GradientValue;
    state.updateStop('start', { color: '#abcdef' });
    expect(first.stops[0]!.color).toBe('#000000');
    expect(props.modelValue!.stops).toHaveLength(3);
  });
  it('bounds additions and positions and refuses a non-finite position', () => {
    const { state } = setup({ maxStops: 4 });
    state.addStop(NaN);
    state.addStop(-1);
    state.addStop(2);
    expect(state.value.value.stops).toHaveLength(4);
    expect(state.value.value.stops[0]!.position).toBe(0);
    expect(state.canAdd.value).toBe(false);
  });
  it('enforces the minimum and keeps adjacent selection when removing', () => {
    const { state, emit } = setup({ minStops: 1, maxStops: 1 });
    state.removeStop('missing');
    state.removeStop('start');
    expect(state.selectedStopId.value).toBe('middle');
    state.removeStop('middle');
    expect(state.value.value.stops).toHaveLength(2);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(state.effectiveMinStops.value).toBe(2);
  });
  it('can remove an unselected or final point without clearing selection', () => {
    const { state } = setup();
    state.removeStop('middle');
    expect(state.selectedStopId.value).toBe('start');
    const other = setup();
    other.state.selectStop('end');
    other.state.removeStop('end');
    expect(other.state.selectedStopId.value).toBe('middle');
  });
  it('edits hex/alpha/positions and keeps identity after crossing another stop', () => {
    const { state } = setup();
    state.selectStop('start');
    state.updateStop('start', { color: '#ABC', alpha: -2, position: 2 });
    expect(state.value.value.stops.at(-1)).toEqual({ id: 'start', color: '#aabbcc', alpha: 0, position: 1 });
    expect(state.selectedStopId.value).toBe('start');
  });
  it.each([{ color: 'garbage' }, { position: NaN }, { alpha: Infinity }])(
    'ignores invalid edits %j atomically',
    (patch) => {
      const { state, emit } = setup();
      state.updateStop('start', patch);
      state.updateStop('missing', {});
      expect(state.value.value).toEqual(base());
      expect(emit).not.toHaveBeenCalled();
    },
  );
  it('edits type and wraps angles while rejecting empty and invalid drafts', () => {
    const { state, emit } = setup();
    state.updateGradientType('radial');
    state.updateGradientType('unsupported');
    state.updateGradientAngle('');
    state.updateGradientAngle('invalid');
    state.updateGradientAngle(-30);
    state.updateGradientAngle(360);
    expect(emit).toHaveBeenCalledTimes(3);
    expect(state.value.value.type).toBe('radial');
    expect(state.value.value.angle).toBe(0);
  });
  it('reverses stops and tie order without losing selected identity or changing orientation', () => {
    const { state } = setup();
    state.selectStop('middle');
    state.reverseStops();
    expect(state.value.value.stops.map((stop) => stop.id)).toEqual(['end', 'middle', 'start']);
    expect(state.value.value.angle).toBe(45);
    state.reverseStops();
    expect(state.value.value).toEqual(base());
    expect(state.selectedStopId.value).toBe('middle');
  });
  it('applies only a permitted preset and copies its stops', () => {
    const { state, emit } = setup({ maxStops: 3 });
    state.applyPreset({ id: 'empty', stops: [] });
    state.applyPreset({ id: 'large', stops: [...base().stops, { ...base().stops[0]!, id: 'extra' }] });
    const preset = { id: 'custom', stops: base().stops.slice(1) };
    state.applyPreset(preset);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(state.selectedStopId.value).toBe('middle');
    expect(state.value.value.stops[0]).not.toBe(preset.stops[0]);
  });
  it('blocks every document and selection edit when disabled', () => {
    const { state, emit } = setup({ disabled: true });
    state.selectStop('middle');
    state.addStop();
    state.removeStop('middle');
    state.updateStop('middle', { color: '#123456' });
    state.updateGradientType('radial');
    state.updateGradientAngle(42);
    state.reverseStops();
    state.applyPreset({ id: 'custom', stops: base().stops });
    expect(emit).not.toHaveBeenCalled();
    expect(state.value.value).toEqual(base());
    expect(state.selectedStopId.value).toBe('start');
  });
});
