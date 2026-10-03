<script setup lang="ts">
import { useId } from 'vue';
import Switch from '~/ui/switch/Switch.vue';
defineProps<{ label: string; description?: string; disabled?: boolean }>();
const enabled = defineModel<boolean>({ required: true });
const descriptionId = useId();
</script>
<template>
  <div class="toggle-preference">
    <div class="preference-copy">
      <div class="preference-label">
        <span>{{ label }}</span
        ><slot name="info" />
      </div>
      <p v-if="description" :id="descriptionId" class="preference-description">
        {{ description }}
      </p>
    </div>
    <Switch
      v-model="enabled"
      :disabled="disabled"
      :aria-label="label"
      :aria-describedby="description ? descriptionId : undefined"
    />
  </div>
</template>
<style scoped>
.toggle-preference {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.preference-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.preference-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
  line-height: 1.5;
}
.preference-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 400;
  line-height: 1.5;
}
</style>
