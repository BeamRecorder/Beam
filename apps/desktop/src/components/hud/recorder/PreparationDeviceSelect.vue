<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { ChevronDown } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { capture } from '~/api/capture';
import type { SelectOption } from '~/ui/select/select-types';
import type { QuickSnipDeviceKind } from '~/api/types/quick-snip';
const props = defineProps<{
  kind: QuickSnipDeviceKind;
  value: string;
  options: SelectOption[];
  label: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ select: [id: string]; error: [message: string] }>();
const busy = ref(false);
const label = computed(() => props.options.find((option) => option.value === props.value)?.label ?? props.value);
let generation = 0;
onBeforeUnmount(() => {
  generation++;
});
const choose = async (event: MouseEvent | KeyboardEvent) => {
  if (busy.value || props.disabled) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const current = generation;
  busy.value = true;
  try {
    const id = await capture.preparation.chooseDevice({
      kind: props.kind,
      selectedId: props.value,
      options: props.options.map((option) => ({ id: String(option.value), label: String(option.label) })),
      position: { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.bottom) },
    });
    if (current === generation && !props.disabled && id !== null) emit('select', id);
  } catch (reason) {
    if (current === generation) emit('error', String(reason));
  } finally {
    busy.value = false;
  }
};
const keydown = (event: KeyboardEvent) => {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    void choose(event);
  }
};
</script>
<template>
  <div class="preparation-device">
    <Button
      variant="ghost"
      size="sm"
      content-layout="custom"
      block
      :disabled="disabled || busy"
      :aria-label="label ? `${props.label}: ${label}` : props.label"
      aria-haspopup="menu"
      @click="choose"
      @contextmenu.prevent="choose"
      @keydown="keydown"
    >
      <template #icon><slot /></template><span class="device-label">{{ label }}</span
      ><ChevronDown :size="12" aria-hidden="true" />
    </Button>
  </div>
</template>
<style scoped>
.preparation-device {
  width: max-content;
  min-width: 124px;
  max-width: 240px;
  height: 28px;
}
.device-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
</style>
