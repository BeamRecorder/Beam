<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import Input from '~/ui/input/Input.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ScreenshotLayerNameProps } from './screenshot-layer-name-types';

const props = defineProps<ScreenshotLayerNameProps>();
const emit = defineEmits<{ rename: [name: string]; finish: [restoreFocus: boolean] }>();
const { t } = useTranslate('ScreenshotComposition');
const input = ref<InstanceType<typeof Input> | null>(null);
const draft = ref(props.name);
let settled = false;
watch(
  () => props.name,
  (name) => {
    draft.value = name;
    settled = false;
  },
);
const update = (value: string | number) => {
  draft.value = String(value);
  settled = false;
};
const commit = (restoreFocus = false) => {
  if (settled) return;
  settled = true;
  const name = draft.value.trim();
  if (name && name.length <= 200 && !props.disabled && name !== props.name) emit('rename', name);
  else draft.value = props.name;
  emit('finish', restoreFocus);
};
const cancel = () => {
  settled = true;
  draft.value = props.name;
  emit('finish', true);
};
onMounted(async () => {
  if (!props.inline) return;
  await nextTick();
  input.value?.focus();
  input.value?.select();
});
</script>

<template>
  <label class="layer-name-editor" :class="{ inline }">
    <span v-if="!inline">{{ t('name') }}</span>
    <Input
      ref="input"
      :model-value="draft"
      :aria-label="t('name')"
      :disabled="disabled"
      :maxlength="200"
      :size="inline ? 'xs' : 'sm'"
      width="100%"
      appearance="neutral"
      select-on-focus
      @update:model-value="update"
      @blur="commit()"
      @keydown.enter.stop.prevent="commit(true)"
      @keydown.esc.stop.prevent="cancel"
      @keydown.stop
      @pointerdown.stop
      @click.stop
      @dblclick.stop
    />
  </label>
</template>

<style scoped>
.layer-name-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.layer-name-editor.inline {
  flex: 1;
  padding: 0 6px;
}
</style>
