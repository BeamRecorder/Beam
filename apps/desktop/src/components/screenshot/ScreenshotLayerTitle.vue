<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import ScreenshotLayerName from './ScreenshotLayerName.vue';
import type { ScreenshotLayerTitleProps } from './screenshot-layer-name-types';

const props = defineProps<ScreenshotLayerTitleProps>();
const emit = defineEmits<{ rename: [name: string] }>();
const { t } = useI18n();
const editing = ref(false);
const title = ref<HTMLElement | null>(null);
const start = () => {
  if (props.active && !props.disabled) editing.value = true;
};
const finish = async (restoreFocus: boolean) => {
  editing.value = false;
  if (restoreFocus) {
    await nextTick();
    title.value?.querySelector<HTMLButtonElement>('button')?.focus();
  }
};
watch([() => props.active, () => props.disabled], () => {
  if (!props.active || props.disabled) editing.value = false;
});
</script>

<template>
  <div ref="title" class="layer-title">
    <ScreenshotLayerName
      v-if="editing"
      inline
      :name="name"
      :disabled="disabled"
      @rename="emit('rename', $event)"
      @finish="finish"
    />
    <Button
      v-else
      class="layer-title-button"
      variant="ghost"
      size="xs"
      block
      content-layout="custom"
      :disabled="disabled || !active"
      :aria-label="t('ScreenshotComposition.name')"
      :title="name"
      data-editor-property-edit
      style="height: 32px; padding: 0 6px; text-align: left"
      @click="start"
    >
      <h3 class="layer-title-label">{{ name }}</h3>
    </Button>
  </div>
</template>

<style scoped>
.layer-title {
  flex: 1;
  min-width: 0;
  margin-inline: -6px 8px;
}
.layer-title-label {
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-size-xl);
  font-weight: var(--weight-title);
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
