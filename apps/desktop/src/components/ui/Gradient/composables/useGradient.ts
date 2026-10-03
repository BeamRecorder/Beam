import { computed, ref, watch } from 'vue';
import type { GradientProps, GradientStop, GradientValue, GradientPreset } from '../gradient-types';
import {
  clampGradientPosition,
  gradientCss,
  interpolateGradientStop,
  nextGradientStopPosition,
  normalizeGradient,
} from '../gradient-stops';
import { parseColorHex } from '../../ColorPicker/color-hex';

export function useGradient(props: GradientProps, emit: (event: 'update:modelValue', value: GradientValue) => void) {
  const value = ref(normalizeGradient(props.modelValue));
  const selectedStopId = ref<string | null>(value.value.stops[0]!.id);
  const effectiveMinStops = computed(() => Math.max(2, Math.floor(props.minStops ?? 2)));
  const effectiveMaxStops = computed(() => Math.max(effectiveMinStops.value, Math.floor(props.maxStops ?? Infinity)));
  const canAdd = computed(() => !props.disabled && value.value.stops.length < effectiveMaxStops.value);
  const selectedStop = computed(() => value.value.stops.find((stop) => stop.id === selectedStopId.value));
  const preview = computed(() => gradientCss(value.value));

  watch(
    () => props.modelValue,
    (input) => {
      value.value = normalizeGradient(input);
      if (!selectedStop.value) selectedStopId.value = value.value.stops[0]!.id;
    },
    { deep: true },
  );

  function publish(next: GradientValue): void {
    if (props.disabled) return;
    value.value = next;
    // The emitted document owns its records; subsequent gestures never mutate them.
    emit('update:modelValue', { ...next, stops: next.stops.map((stop) => ({ ...stop })) });
  }

  function selectStop(id: string): void {
    if (!props.disabled && value.value.stops.some((stop) => stop.id === id)) selectedStopId.value = id;
  }

  function addStop(position = nextGradientStopPosition(value.value.stops, selectedStopId.value)): void {
    if (!canAdd.value || !Number.isFinite(position)) return;
    position = clampGradientPosition(position);
    const stop = { id: crypto.randomUUID(), position, ...interpolateGradientStop(value.value.stops, position) };
    publish({ ...value.value, stops: [...value.value.stops, stop].sort((a, b) => a.position - b.position) });
    selectedStopId.value = stop.id;
  }

  function removeStop(id: string): void {
    const index = value.value.stops.findIndex((stop) => stop.id === id);
    if (props.disabled || index < 0 || value.value.stops.length <= effectiveMinStops.value) return;
    const stops = value.value.stops.filter((stop) => stop.id !== id);
    publish({ ...value.value, stops });
    if (selectedStopId.value === id) selectedStopId.value = stops[Math.min(index, stops.length - 1)]!.id;
  }

  function updateStop(id: string, patch: Partial<Omit<GradientStop, 'id'>>): void {
    const stop = value.value.stops.find((item) => item.id === id);
    if (!stop) return;
    const color = patch.color === undefined ? stop.color : parseColorHex(patch.color);
    if (
      !color ||
      (patch.position !== undefined && !Number.isFinite(patch.position)) ||
      (patch.alpha !== undefined && !Number.isFinite(patch.alpha))
    )
      return;
    const updated = {
      ...stop,
      color,
      position: patch.position === undefined ? stop.position : clampGradientPosition(patch.position),
      alpha: patch.alpha === undefined ? stop.alpha : clampGradientPosition(patch.alpha),
    };
    publish({
      ...value.value,
      stops: value.value.stops.map((item) => (item.id === id ? updated : item)).sort((a, b) => a.position - b.position),
    });
  }

  function updateGradientType(type: string): void {
    if (type === 'linear' || type === 'radial') publish({ ...value.value, type });
  }

  function updateGradientAngle(angle: string | number): void {
    const degrees = Number(angle);
    if (String(angle).trim() && Number.isFinite(degrees))
      publish({ ...value.value, angle: ((degrees % 360) + 360) % 360 });
  }

  function reverseStops(): void {
    publish({
      ...value.value,
      stops: [...value.value.stops].reverse().map((stop) => ({ ...stop, position: 1 - stop.position })),
    });
  }

  function applyPreset(preset: GradientPreset): void {
    if (
      props.disabled ||
      preset.stops.length < effectiveMinStops.value ||
      preset.stops.length > effectiveMaxStops.value
    )
      return;
    publish(normalizeGradient({ ...value.value, stops: preset.stops }));
    selectedStopId.value = value.value.stops[0]!.id;
  }

  return {
    value,
    selectedStopId,
    preview,
    effectiveMinStops,
    canAdd,
    selectStop,
    addStop,
    removeStop,
    updateStop,
    updateGradientType,
    updateGradientAngle,
    reverseStops,
    applyPreset,
  };
}
