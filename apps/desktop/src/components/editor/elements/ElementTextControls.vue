<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd } from '@lucide/vue';
import Textarea from '~/ui/textarea/Textarea.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Accordion from '~/ui/accordion/Accordion.vue';
const CaptionStyleControls = defineAsyncComponent(() => import('../properties/captions/CaptionStyleControls.vue'));
import type { ShapeClip, CaptionStyle } from '@beam/engine/shared/composition-types';
import type { ElementText } from '@beam/engine/shared/element-types';
import { createElementText } from '@beam/engine/shared/element-text';
import { useTranslate } from '~/i18n/useTranslate';
import { useElementEditor } from './useElementEditor';
const props = defineProps<{ clip: ShapeClip }>();
const emit = defineEmits<{ update: [text: ElementText] }>();
const { t } = useTranslate('Elements');
const editor = useElementEditor();
const source = computed(() =>
  editor?.editing.value?.id === props.clip.id ? editor.editing.value.text : props.clip.text,
);
const text = ref<ElementText>(createElementText());
const contentOpen = ref(props.clip.family === 'text' || Boolean(props.clip.text));
watch(
  source,
  (value) => {
    text.value = value ?? createElementText();
    if (editor?.editing.value?.id === props.clip.id) contentOpen.value = true;
  },
  { deep: true, immediate: true },
);
const updateText = (value: ElementText) => {
  text.value = value;
  emit('update', value);
};
const updateStyle = (key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]) => {
  updateText({ ...text.value, style: { ...text.value.style, [key]: value } });
};
const alignments = [
  { value: 'top', icon: AlignVerticalJustifyStart },
  { value: 'center', icon: AlignVerticalJustifyCenter },
  { value: 'bottom', icon: AlignVerticalJustifyEnd },
] as const;
const alignmentSelection = computed(() => ({
  count: alignments.length,
  index: alignments.findIndex((item) => item.value === text.value.verticalAlign),
}));
</script>
<template>
  <section class="element-text-controls">
    <Accordion v-model="contentOpen" appearance="inspector" :title="t('text')" data-element-section="text">
      <div class="text-content">
        <label class="text-field"
          >{{ t('text') }}
          <Textarea
            :model-value="text.content"
            :rows="3"
            maxlength="10000"
            @update:model-value="updateText({ ...text, content: $event })"
          />
        </label>
        <ButtonGroup
          full
          variant="neutral"
          :columns="3"
          :aria-label="t('verticalAlignment')"
          :selection="alignmentSelection"
        >
          <Button
            v-for="item in alignments"
            :key="item.value"
            size="sm"
            icon-only
            :variant="text.verticalAlign === item.value ? 'selected' : 'ghost'"
            :aria-label="t(item.value)"
            :tooltip="t(item.value)"
            @click="updateText({ ...text, verticalAlign: item.value })"
            ><template #icon><component :is="item.icon" :size="20" :stroke-width="2.25" /></template
          ></Button>
        </ButtonGroup>
        <BigSlider
          :display-precision="2"
          :model-value="text.padding"
          :label="t('textPadding')"
          :min="0"
          :max="40"
          :step="1"
          :default-value="6"
          @update:model-value="updateText({ ...text, padding: $event })"
        />
      </div>
      <CaptionStyleControls
        v-if="contentOpen"
        :style="text.style"
        :sample-text="text.content"
        :default-font-size="48"
        @update="updateStyle"
      />
    </Accordion>
  </section>
</template>
<style scoped>
.element-text-controls {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.text-content {
  display: grid;
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
