<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Type } from '@lucide/vue';
import Textarea from '~/ui/textarea/Textarea.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Divider from '~/ui/divider/Divider.vue';
const CaptionStyleControls = defineAsyncComponent(() => import('../properties/captions/CaptionStyleControls.vue'));
import type { ShapeClip, CaptionStyle } from '~/media/shared/composition-types';
import type { ElementText } from '~/media/shared/element-types';
import { createElementText } from '~/media/shared/element-text';
import { useTranslate } from '~/i18n/useTranslate';
import { useElementEditor } from './useElementEditor';
const props = defineProps<{ clip: ShapeClip }>();
const emit = defineEmits<{ update: [text: ElementText] }>();
const { t } = useTranslate('Elements');
const editor = useElementEditor();
const source = computed(() =>
  editor?.editing.value?.id === props.clip.id ? editor.editing.value.text : props.clip.text,
);
const text = ref<ElementText>();
watch(
  source,
  (value) => {
    text.value = value;
  },
  { deep: true, immediate: true },
);
const updateText = (value: ElementText) => {
  text.value = value;
  emit('update', value);
};
const updateStyle = (key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]) => {
  if (text.value) updateText({ ...text.value, style: { ...text.value.style, [key]: value } });
};
const alignments = [
  { value: 'top', icon: AlignVerticalJustifyStart },
  { value: 'center', icon: AlignVerticalJustifyCenter },
  { value: 'bottom', icon: AlignVerticalJustifyEnd },
] as const;
const edit = () => {
  if (editor) editor.beginText(props.clip.id);
  else updateText(createElementText());
};
</script>
<template>
  <section class="element-text-controls">
    <Button variant="secondary" size="sm" :icon="Type" @click="edit">{{ t(text ? 'editText' : 'addText') }}</Button>
    <template v-if="text">
      <label class="text-field"
        >{{ t('text') }}
        <Textarea
          :model-value="text.content"
          :rows="3"
          maxlength="10000"
          @update:model-value="updateText({ ...text, content: $event })"
        />
      </label>
      <ButtonGroup full :columns="3" :aria-label="t('verticalAlignment')">
        <Button
          v-for="item in alignments"
          :key="item.value"
          size="xs"
          :icon="item.icon"
          icon-only
          :variant="text.verticalAlign === item.value ? 'primary' : 'ghost'"
          :aria-label="t(item.value)"
          :tooltip="t(item.value)"
          @click="updateText({ ...text, verticalAlign: item.value })"
        />
      </ButtonGroup>
      <BigSlider
        :model-value="text.padding"
        :label="t('textPadding')"
        :min="0"
        :max="40"
        :step="1"
        :default-value="6"
        @update:model-value="updateText({ ...text, padding: $event })"
      />
      <Divider />
      <CaptionStyleControls
        :style="text.style"
        :sample-text="text.content"
        :default-font-size="48"
        @update="updateStyle"
      />
    </template>
  </section>
</template>
<style scoped>
.element-text-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.text-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
