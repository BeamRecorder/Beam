<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useReducedMotion } from '@vueuse/motion';
import { Download, RotateCcw } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import Throbber from '~/ui/throbber/Throbber.vue';
import UpdateControls from './UpdateControls.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useAppUpdates } from './useAppUpdates';

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ toggle: [opened: boolean] }>();
const { t } = useTranslate('Updates');
const { state, attention } = useAppUpdates();
const reducedMotion = useReducedMotion();
const highlight = ref(false);
let attentionShown = false;
let highlightTimeout: ReturnType<typeof setTimeout> | undefined;
watch(
  attention,
  (available) => {
    if (!available || attentionShown) return;
    attentionShown = true;
    if (reducedMotion.value) return;
    highlight.value = true;
    highlightTimeout = setTimeout(() => {
      highlight.value = false;
    }, 2000);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (highlightTimeout) clearTimeout(highlightTimeout);
});
const label = computed(() => {
  if (state.value?.status === 'downloaded') return t('restartToUpdate');
  if (state.value?.status === 'downloading') return t('downloadProgress', { percent: state.value.percent ?? 0 });
  if (state.value?.status === 'error') return t('retry');
  return t('update');
});
</script>

<template>
  <Popover
    v-if="attention"
    class="update-shortcut"
    align="right"
    :match-trigger-width="false"
    interaction="hover-focus-click"
    :disabled="disabled"
    @toggle="emit('toggle', $event)"
  >
    <template #trigger="{ isOpen }">
      <Button
        variant="ghost"
        size="xs"
        :style="{ maxWidth: '240px', height: '26px' }"
        :icon="state?.status === 'downloaded' ? RotateCcw : Download"
        :disabled="disabled"
        :aria-label="label"
        :aria-expanded="isOpen"
        aria-haspopup="dialog"
      >
        <Throbber v-if="highlight && !reducedMotion" :text="label" variant="highlight" inherit-typography nowrap />
        <template v-else>{{ label }}</template>
      </Button>
    </template>
    <div class="update-shortcut-panel" role="dialog" :aria-label="t('title')">
      <UpdateControls compact show-hint :show-changelog="false" />
    </div>
  </Popover>
</template>

<style scoped>
.update-shortcut {
  display: inline-flex;
  -webkit-app-region: no-drag;
}
.update-shortcut-panel {
  width: 248px;
  padding: 14px;
  box-sizing: border-box;
}
</style>
