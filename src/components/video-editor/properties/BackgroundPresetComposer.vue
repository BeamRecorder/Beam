<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '~/ui/button/Button.vue'
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue'
import Gradient from '~/ui/Gradient/Gradient.vue'
import type { GradientBackground } from '../composables/backgroundCatalog'

const props = defineProps<{
  kind: 'color' | 'gradient'
  color: string
  gradient: GradientBackground
}>()

const emit = defineEmits<{
  (event: 'add-color', value: string): void
  (event: 'add-gradient', value: GradientBackground): void
  (event: 'close'): void
}>()

const cloneGradient = (value: GradientBackground): GradientBackground => ({
  ...value,
  stops: value.stops.map((stop) => ({ ...stop })),
})

const colorDraft = ref(props.color)
const gradientDraft = ref<GradientBackground>(cloneGradient(props.gradient))

watch(() => props.color, (value) => { colorDraft.value = value })
watch(() => props.gradient, (value) => { gradientDraft.value = cloneGradient(value) }, { deep: true })

const add = () => {
  if (props.kind === 'color') emit('add-color', colorDraft.value)
  else emit('add-gradient', cloneGradient(gradientDraft.value))
}
</script>

<template>
  <section class="composer" :aria-label="kind === 'color' ? 'Ajouter une couleur personnalisée' : 'Ajouter un dégradé personnalisé'">
    <ColorPicker
      v-if="kind === 'color'"
      v-model="colorDraft"
      inline
      :show-label="false"
    />
    <Gradient v-else v-model="gradientDraft" :show-angle="true" />
    <div class="composer-actions">
      <Button size="sm" variant="ghost" @click="emit('close')">Close</Button>
      <Button size="sm" @click="add">Add</Button>
    </div>
  </section>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  animation: composer-in 140ms ease-out both;
}

.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@keyframes composer-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .composer { animation: none; }
}
</style>
