<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Check } from '@lucide/vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
import type { QuickSnipDeviceMenu } from '~/api/types/quick-snip';
const props = defineProps<{ menu: QuickSnipDeviceMenu }>();
const emit = defineEmits<{ select: [id: string]; dismiss: [] }>();
const root = ref<HTMLElement | null>(null);
const items = computed(() =>
  props.menu.options.map((option) => ({
    id: option.id,
    label: option.label,
    icon: option.id === props.menu.selectedId ? Check : undefined,
  })),
);
const focusSelection = async () => {
  await nextTick();
  const buttons = root.value?.querySelectorAll<HTMLButtonElement>('button');
  const index = props.menu.options.findIndex((option) => option.id === props.menu.selectedId);
  buttons?.[Math.max(0, index)]?.focus();
};
onMounted(() => void focusSelection());
watch(
  () => props.menu,
  () => void focusSelection(),
);
</script>
<template>
  <div ref="root" class="device-menu">
    <PopoverMenuList :items="items" @select="emit('select', $event)" @dismiss="emit('dismiss')" />
  </div>
</template>
<style scoped>
.device-menu {
  width: 100%;
  min-width: 0;
}
</style>
