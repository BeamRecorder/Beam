<script setup lang="ts">
import { Lock, Unlock } from '@lucide/vue';
import Button from '~/components/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
defineProps<{ locked: boolean; name: string }>();
const emit = defineEmits<{ unlock: [] }>();
const { t } = useTranslate('TimelineTracks');
</script>
<template>
  <div class="properties-lock-guard">
    <div
      class="properties-lock-content"
      :class="{ 'is-locked': locked }"
      :inert="locked"
      :aria-hidden="locked || undefined"
    >
      <slot />
    </div>
    <div v-if="locked" class="properties-lock-message" role="status">
      <Lock :size="24" aria-hidden="true" />
      <p>{{ t('lockedMessage', { name }) }}</p>
      <Button variant="secondary" size="sm" :icon="Unlock" @click="emit('unlock')">{{ t('unlock') }}</Button>
    </div>
  </div>
</template>
<style scoped>
.properties-lock-guard {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.properties-lock-content {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.properties-lock-content.is-locked {
  filter: blur(4px);
  opacity: 0.4;
  pointer-events: none;
  user-select: none;
}
.properties-lock-message {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--color-bg-element) 45%, transparent);
}
.properties-lock-message p {
  margin: 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
</style>
