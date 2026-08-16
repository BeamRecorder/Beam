<script setup lang="ts">
import { computed, toRef } from 'vue';
import Input from '~/ui/input/Input.vue';
import Switch from '~/ui/switch/Switch.vue';
import Divider from '~/ui/divider/Divider.vue';
import type { CaptionClip, CaptionStyle } from '~/media/shared/composition-types';
import { isKeyboardCaptionClip } from '~/media/shared/composition-types';
import { keyboardCaptionText } from '~/media/shared/keyboard-captions';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { useCaptionDraft } from './useCaptionDraft';
import CaptionStyleControls from './CaptionStyleControls.vue';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('CaptionClipPanel');
const props = defineProps<{ clip: CaptionClip | null }>();
const emit = defineEmits<{
  (event: 'update', clip: CaptionClip): void;
  (event: 'delete', clipId: string): void;
  (event: 'preview', clip: CaptionClip | null): void;
}>();
const { draft, flush, update } = useCaptionDraft(toRef(props, 'clip'), (clip) => emit('update', clip));
const keyboardDraft = computed(() => (draft.value && isKeyboardCaptionClip(draft.value) ? draft.value : null));
const style = computed<CaptionStyle>(() => ({
  ...createDefaultCaptionStyle(28),
  shadowDirection: 'bottom-right',
  ...keyboardDraft.value?.caption.style,
}));
const displayText = computed(() => {
  const clip = keyboardDraft.value;
  if (!clip) return '';
  return clip.caption.style.customText || keyboardCaptionText(clip.caption.steps, clip.caption.recordedPlatform);
});
const updateStyle = (key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]) =>
  update((clip) => ({ ...clip, caption: { ...clip.caption, style: { ...clip.caption.style, [key]: value } } }));
const updateFollowCursor = (followCursor: boolean) =>
  update((clip) => (isKeyboardCaptionClip(clip) ? { ...clip, caption: { ...clip.caption, followCursor } } : clip));
const previewStyle = (patch: Partial<CaptionStyle> | null) => {
  if (!keyboardDraft.value) return;
  emit(
    'preview',
    patch
      ? { ...keyboardDraft.value, caption: { ...keyboardDraft.value.caption, style: { ...style.value, ...patch } } }
      : null,
  );
};
</script>

<template>
  <div v-if="keyboardDraft" class="keyboard-caption-panel">
    <div class="options-group">
      <div class="section-block">
        <span class="section-title">{{ t('displayText') }}</span>
        <Input
          :model-value="displayText"
          :placeholder="t('typeCustomText')"
          size="md"
          @update:model-value="updateStyle('customText', String($event))"
          @blur="flush"
        />
        <p class="section-desc">{{ t('customTextDescription') }}</p>
        <div class="follow-cursor-setting">
          <div>
            <span class="sub-label">{{ t('followCursor') }}</span>
            <p class="section-desc">{{ t('followCursorDescription') }}</p>
          </div>
          <Switch
            :model-value="keyboardDraft.caption.followCursor"
            :aria-label="t('followCursor')"
            @update:model-value="updateFollowCursor"
          />
        </div>
      </div>
      <Divider spacing="xs" />
      <CaptionStyleControls
        :style="style"
        :default-font-size="28"
        :sample-text="displayText"
        @update="updateStyle"
        @preview="previewStyle"
      />
    </div>
  </div>
</template>

<style scoped>
.keyboard-caption-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100%;
}
.options-group,
.section-block,
.follow-cursor-setting > div {
  display: flex;
  flex-direction: column;
}
.options-group {
  gap: 16px;
  flex: 1;
}
.section-block {
  gap: 10px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
.section-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
}
.follow-cursor-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.follow-cursor-setting > div {
  gap: 4px;
}
.danger-zone {
  margin-top: auto;
  padding-top: 16px;
  width: 100%;
}
</style>
