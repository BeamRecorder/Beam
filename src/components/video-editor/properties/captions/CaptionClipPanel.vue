<script setup lang="ts">
import { computed, toRef } from 'vue';
import Input from '~/ui/input/Input.vue';
import Divider from '~/ui/divider/Divider.vue';
import type { CaptionClip, CaptionStyle } from '~/media/shared/composition-types';
import { useCaptionDraft } from './useCaptionDraft';
import { useTranslate } from '~/i18n/useTranslate';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import CaptionStyleControls from './CaptionStyleControls.vue';

const { t } = useTranslate('CaptionClipPanel');
const props = defineProps<{ clip: CaptionClip | null }>();
const emit = defineEmits<{
  (event: 'update', clip: CaptionClip): void;
  (event: 'delete', clipId: string): void;
  (event: 'preview', clip: CaptionClip | null): void;
}>();

const { draft, update } = useCaptionDraft(toRef(props, 'clip'), (clip) => emit('update', clip));
const captionStyle = computed<CaptionStyle>(() => ({
  ...createDefaultCaptionStyle(36),
  shadowDirection: 'bottom-right',
  ...draft.value?.caption.style,
}));
const sentences = computed(() => (draft.value?.caption.type === 'text' ? draft.value.caption.sentences : []));
const displayText = computed(
  () => captionStyle.value.customText || sentences.value.map((sentence) => sentence.text).join(' '),
);

const updateStyle = (key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]) =>
  update((clip) => ({
    ...clip,
    caption: { ...clip.caption, style: { ...clip.caption.style, [key]: value } },
  }));
const previewStyle = (patch: Partial<CaptionStyle> | null) => {
  if (!draft.value) return;
  emit(
    'preview',
    patch ? { ...draft.value, caption: { ...draft.value.caption, style: { ...captionStyle.value, ...patch } } } : null,
  );
};
</script>

<template>
  <div v-if="draft" class="caption-clip-panel">
    <div class="options-group">
      <div class="section-block">
        <span class="section-title">{{ t('displayText') }}</span>
        <div class="sub-group">
          <span class="sub-label">{{ t('captionText') }}</span>
          <Input
            :model-value="displayText"
            :placeholder="t('typeCustomText')"
            size="md"
            :debounce="150"
            @update:model-value="updateStyle('customText', String($event))"
          />
          <p class="section-desc">{{ t('customTextDescription') }}</p>
        </div>
      </div>

      <Divider spacing="xs" />
      <CaptionStyleControls
        :style="captionStyle"
        :default-font-size="36"
        :sample-text="displayText"
        @update="updateStyle"
        @preview="previewStyle"
      />
    </div>
  </div>
</template>

<style scoped>
.caption-clip-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100%;
}
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.section-block,
.sub-group {
  display: flex;
  flex-direction: column;
}
.section-block {
  gap: 10px;
}
.sub-group {
  gap: 6px;
  width: 100%;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.section-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
}
.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
.danger-zone {
  margin-top: auto;
  padding-top: 16px;
  width: 100%;
}
</style>
