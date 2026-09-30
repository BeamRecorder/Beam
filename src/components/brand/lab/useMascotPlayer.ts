import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { EXPRESSION_BY_ID } from '../Beamy/engine/expressions';
import { SHAPE_BY_ID } from '../Beamy/engine/skins';
import { clamp } from '../Beamy/engine/math';
import { createMascotEngine, timelineDuration, timelinePosition } from './mascot-catalog';
import type { StateId } from '../Beamy/engine/bot-types';
import type { MascotLook, MascotStep } from './mascot-types';

export function useMascotPlayer(look: Ref<MascotLook>, steps: Ref<MascotStep[]>) {
  const reducedMotion = ref(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const playing = ref(!reducedMotion.value);
  const sequencing = ref(false);
  const state = ref<StateId>('idle');
  const speed = ref(1);
  const follow = ref(false);
  const elapsed = ref(0);
  const activeStep = ref(0);
  const duration = computed(() => timelineDuration(steps.value));
  let engine = createMascotEngine(look.value);
  const frame = shallowRef(engine.sample(0));
  let clock = 0;
  let sequenceStart = 0;
  let last: number | null = null;
  let raf = 0;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');

  const draw = () => {
    frame.value = engine.sample(clock);
  };
  const choose = (id: StateId) => {
    sequencing.value = false;
    state.value = id;
    if (playing.value) engine.setState(id, clock);
    else engine = createMascotEngine(look.value, id);
    draw();
  };
  const seek = (time: number) => {
    const at = clamp(time, 0, duration.value);
    const position = timelinePosition(steps.value, at);
    engine = createMascotEngine(look.value, steps.value[0]!.state);
    for (let i = 1; i <= position.index; i++) {
      const start = timelineDuration(steps.value.slice(0, i));
      engine.setState(steps.value[i]!.state, start);
    }
    clock = at;
    sequenceStart = 0;
    elapsed.value = at;
    activeStep.value = position.index;
    state.value = steps.value[position.index]!.state;
    sequencing.value = true;
    draw();
  };
  const tick = (ms: number) => {
    const delta = last === null ? 0 : Math.min((ms - last) / 1000, 0.064) * speed.value;
    last = ms;
    clock += delta;
    if (sequencing.value) {
      const time = clock - sequenceStart;
      if (time >= duration.value) {
        sequenceStart = clock;
        engine.setState(steps.value[0]!.state, clock);
        activeStep.value = 0;
        state.value = steps.value[0]!.state;
      }
      elapsed.value = clock - sequenceStart;
      const position = timelinePosition(steps.value, elapsed.value);
      if (position.index !== activeStep.value) {
        activeStep.value = position.index;
        state.value = steps.value[position.index]!.state;
        engine.setState(state.value, sequenceStart + position.start);
      }
    }
    draw();
    raf = requestAnimationFrame(tick);
  };
  const synchronize = () => {
    cancelAnimationFrame(raf);
    last = null;
    if (playing.value && !document.hidden) raf = requestAnimationFrame(tick);
  };
  const onMotionChange = (event: MediaQueryListEvent) => {
    reducedMotion.value = event.matches;
    if (event.matches) playing.value = false;
  };
  const aim = (event: PointerEvent, rect: DOMRect) => {
    if (!follow.value || !playing.value || event.pointerType === 'touch' || rect.width === 0 || rect.height === 0)
      return;
    engine.setLook(
      {
        yaw: clamp((event.clientX - rect.x - rect.width / 2) / (rect.width / 2), -1, 1) * 40,
        pitch: -clamp((event.clientY - rect.y - rect.height / 2) / (rect.height / 2), -1, 1) * 30,
        mix: 1,
        spin: 0,
        wander: 0,
      },
      clock,
    );
  };
  const release = () => {
    engine.setLook(null, clock);
  };
  watch(playing, synchronize);
  watch(follow, release);
  watch(
    look,
    () => {
      const at = playing.value ? clock : clock - 1;
      engine.setShape(SHAPE_BY_ID.get(look.value.shape)!.radii, at);
      engine.setExpression(EXPRESSION_BY_ID.get(look.value.expression)!, at);
      engine.setEyes(look.value.eyes, at);
      engine.setEyeGeometry(look.value.eyeGeometry);
      draw();
    },
    { deep: true },
  );
  watch(
    steps,
    () => {
      if (sequencing.value) seek(Math.min(elapsed.value, duration.value));
    },
    { deep: true },
  );
  onMounted(() => {
    media.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', synchronize);
    synchronize();
  });
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf);
    media.removeEventListener('change', onMotionChange);
    document.removeEventListener('visibilitychange', synchronize);
  });
  return {
    frame,
    playing,
    sequencing,
    state,
    speed,
    follow,
    elapsed,
    activeStep,
    duration,
    reducedMotion,
    choose,
    seek,
    aim,
    release,
  };
}
