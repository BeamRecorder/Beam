<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft, ArrowRight, Plus, Trash2, Play, Film } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Slider from '~/ui/slider/Slider.vue';
import Select from '~/ui/select/Select.vue';
import BeamySvg from '../Beamy/BeamySvg.vue';
import { createMascotEngine, STATE_LABELS, timelineDuration } from './mascot-catalog';
import { SEQUENCE } from '../Beamy/engine/states';
import type { MascotLook, MascotStep } from './mascot-types';
import type { StateId } from '../Beamy/engine/bot-types';

const props = defineProps<{ look: MascotLook; active: number; sequencing: boolean; elapsed: number }>();
const steps = defineModel<MascotStep[]>({ required: true });
const emit = defineEmits<{ seek: [time: number]; play: [] }>();
const thumbnails = computed(() => steps.value.map((step) => createMascotEngine(props.look, step.state).sample(0.9)));
const total = computed(() => timelineDuration(steps.value));
const options = SEQUENCE.map((state) => ({ value: state, label: STATE_LABELS[state] }));
const selectStep = (index: number) => emit('seek', timelineDuration(steps.value.slice(0, index)));
const move = (index: number, direction: number) => {
  const updated = [...steps.value];
  const destination = index + direction;
  if (destination < 0 || destination >= updated.length) return;
  [updated[index], updated[destination]] = [updated[destination]!, updated[index]!];
  steps.value = updated;
};
const add = (state: string | number) => {
  if (steps.value.length >= 32) return;
  steps.value = [...steps.value, { state: state as StateId, duration: 2 }];
};
</script>

<template>
  <section class="timeline">
    <header class="timeline-heading">
      <div>
        <Film :size="17" />
        <h2>Sa petite chorégraphie</h2>
        <span>{{ total.toFixed(1) }} s · en boucle</span>
      </div>
      <Button variant="secondary" size="sm" :icon="Play" @click="emit('play')">Jouer la séquence</Button>
    </header>
    <p class="timeline-description">
      Assemble ses mouvements pour imaginer un chargement, une arrivée ou un petit succès.
    </p>
    <div class="steps">
      <article
        v-for="(step, index) in steps"
        :key="index"
        class="step"
        :class="{ selected: sequencing && index === active }"
      >
        <Button
          variant="ghost"
          :aria-label="`Aller au mouvement ${index + 1} : ${STATE_LABELS[step.state]}`"
          :style="{ width: '100%', padding: '0', height: 'auto' }"
          @click="selectStep(index)"
        >
          <span class="step-preview"
            ><BeamySvg :frame="thumbnails[index]!" :color="look.color" :blush="look.blush" :size="66" /><span>{{
              STATE_LABELS[step.state]
            }}</span></span
          >
        </Button>
        <Slider
          v-model="step.duration"
          :min="0.6"
          :max="10"
          :step="0.1"
          size="compact"
          value-suffix=" s"
          :label="`Durée du mouvement ${index + 1}`"
        />
        <div class="step-actions">
          <Button
            variant="ghost"
            icon-only
            size="xs"
            :icon="ArrowLeft"
            :disabled="index === 0"
            :aria-label="`Déplacer le mouvement ${index + 1} à gauche`"
            @click="move(index, -1)"
          />
          <Button
            variant="ghost"
            icon-only
            size="xs"
            :icon="ArrowRight"
            :disabled="index === steps.length - 1"
            :aria-label="`Déplacer le mouvement ${index + 1} à droite`"
            @click="move(index, 1)"
          />
          <Button
            variant="ghost"
            icon-only
            size="xs"
            :icon="Trash2"
            :disabled="steps.length === 1"
            :aria-label="`Retirer le mouvement ${index + 1}`"
            @click="steps = steps.filter((_, i) => i !== index)"
          />
        </div>
      </article>
      <div class="add-step">
        <Plus :size="20" /><Select
          model-value=""
          :options="options"
          :disabled="steps.length >= 32"
          size="sm"
          placeholder="Ajouter"
          aria-label="Ajouter un mouvement"
          @update:model-value="add"
        />
      </div>
    </div>
    <div class="scrubber">
      <span>{{ elapsed.toFixed(1) }} s</span
      ><Slider
        :model-value="elapsed"
        :min="0"
        :max="total"
        :step="0.01"
        :show-value="false"
        size="compact"
        label="Position dans la séquence"
        @update:model-value="emit('seek', $event)"
      /><span>{{ total.toFixed(1) }} s</span>
    </div>
  </section>
</template>

<style scoped>
.timeline {
  background: var(--color-bg-element);
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.timeline-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.timeline-heading > div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.timeline-heading h2 {
  font-size: 15px;
  font-weight: 650;
}
.timeline-heading svg {
  color: var(--text-muted);
}
.timeline-heading span,
.timeline-description {
  font-size: 11px;
  color: var(--text-muted);
}
.timeline-description {
  margin-top: 8px;
  margin-bottom: 20px;
}
.steps {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 10px;
}
.step {
  width: 148px;
  flex-shrink: 0;
  background: var(--color-bg-app);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
}
.step.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.step-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  padding-bottom: 10px;
}
.step-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}
.add-step {
  flex-shrink: 0;
  width: 126px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 12px;
  color: var(--text-muted);
}
.scrubber {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-top: 12px;
}
.scrubber > span {
  flex-shrink: 0;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
@media (max-width: 700px) {
  .timeline-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .timeline-heading span {
    display: none;
  }
}
</style>
