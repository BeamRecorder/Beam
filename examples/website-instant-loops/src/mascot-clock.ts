import { computed, ref, type Ref } from "vue";
import { createBeamyMotion } from "../../../apps/desktop/src/components/brand/Beamy/beamy-motion";
import type { BeamyPhase } from "../../../apps/desktop/src/components/brand/Beamy/beamy-types";
export const mascotClock = ref(0);
// Keep Beamy's native shapes, expressions and confetti; sample its engine on the film clock.
export function useBeamy(
  phase: Readonly<Ref<BeamyPhase>>,
  _active: Readonly<Ref<boolean>>,
  cycleOffset: Readonly<Ref<number>>,
) {
  return {
    motion: computed(() =>
      createBeamyMotion(phase.value, cycleOffset.value)(
        mascotClock.value,
        false,
      ),
    ),
  };
}
