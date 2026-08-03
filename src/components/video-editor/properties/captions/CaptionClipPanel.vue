<script setup lang="ts">
import { computed, toRef } from "vue";
import ColorPicker from "~/ui/ColorPicker/ColorPicker.vue";
import Input from "~/ui/input/Input.vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Select from "~/ui/select/Select.vue";
import Divider from "~/ui/divider/Divider.vue";
import DeleteItem from "~/ui/button/DeleteItem.vue";
import type { CaptionClip, CaptionStyle, CaptionWord } from "../../composition/composition-types";
import { useCaptionDraft } from "./useCaptionDraft";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("CaptionClipPanel");
const props = defineProps<{ clip: CaptionClip | null }>();
const emit = defineEmits<{
  (event: "update", clip: CaptionClip): void;
  (event: "delete", clipId: string): void;
}>();

const { draft, flush, update } = useCaptionDraft(toRef(props, "clip"), (clip) => emit("update", clip));
const captionStyle = computed<CaptionStyle>(() => ({
  color: "#ffffff",
  fontSize: 36,
  shadowColor: "rgba(0, 0, 0, 0.85)",
  shadowBlur: 0,
  shadowDirection: "bottom-right",
  placement: "bottom",
  boxColor: "#000000",
  boxPadding: 6,
  boxRadius: 4,
  ...draft.value?.caption.style,
}));

const sentences = computed(() => draft.value?.caption.sentences ?? []);
const displayText = computed(() => captionStyle.value.customText || sentences.value.map((sentence) => sentence.text).join(" "));

const updateStyle = (key: keyof CaptionStyle, value: CaptionStyle[keyof CaptionStyle]) => update((clip) => ({
  ...clip,
  caption: { ...clip.caption, style: { ...clip.caption.style, [key]: value } },
}));

const updateWord = (sentenceId: string, index: number, key: keyof CaptionWord, value: string) => {
  const parsed = key === "text" ? value : Number(value);
  if (key !== "text" && (!Number.isFinite(parsed) || Number(parsed) < 0)) return;
  update((clip) => {
    const sentences = clip.caption.sentences.map((sentence) => {
      if (sentence.id !== sentenceId) return sentence;
      const words = sentence.words.map((word, wordIndex) => wordIndex === index ? { ...word, [key]: parsed } : word);
      return {
        ...sentence,
        words,
        text: words.map((word) => word.text).join(" "),
        startMs: words[0]?.startMs ?? sentence.startMs,
        endMs: words.at(-1)?.endMs ?? sentence.endMs,
      };
    });
    const startMs = sentences[0]?.startMs ?? clip.timelineStartMs;
    const endMs = sentences.at(-1)?.endMs ?? startMs + clip.timelineDurationMs;
    const durationMs = Math.max(40, endMs - startMs);
    return {
      ...clip,
      timelineStartMs: startMs,
      timelineDurationMs: durationMs,
      sourceInMs: 0,
      sourceDurationMs: durationMs * clip.playbackRate,
      caption: { ...clip.caption, sentences },
    };
  });
};

const shadowDirectionOptions = computed(() => [
  { value: "all", label: t("shadowAllAround") },
  { value: "bottom", label: t("shadowBottom") },
  { value: "bottom-right", label: t("shadowBottomRight") },
  { value: "top-left", label: t("shadowTopLeft") },
]);
</script>

<template>
  <div v-if="draft" class="caption-clip-panel">
    <div class="options-group">
      <!-- Display Text Section -->
      <div class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('displayText') }}</span>
        </div>
        <div class="sub-group">
          <span class="sub-label">{{ t('captionText') }}</span>
          <Input :model-value="displayText" :placeholder="t('typeCustomText')" size="md" @update:model-value="updateStyle('customText', String($event))" @blur="flush" />
          <p class="section-desc">{{ t('customTextDescription') }}</p>
        </div>
      </div>

      <Divider spacing="xs" />

      <!-- Typography Section -->
      <div class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('typography') }}</span>
        </div>
        <div class="sub-group">
          <span class="sub-label">{{ t('textColor') }}</span>
          <ColorPicker :model-value="captionStyle.color" :show-label="false" @update:model-value="updateStyle('color', $event)" />
        </div>
        <BigSlider :label="t('fontSize')" :model-value="captionStyle.fontSize" :min="12" :max="120" :step="1" :default-value="36" :format-value="(value) => `${value}px`" @update:model-value="updateStyle('fontSize', $event)" />
      </div>

      <Divider spacing="xs" />

      <!-- Box / Outline Extrusion Section -->
      <div class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('outlineExtrusion') }}</span>
        </div>
        <div class="sub-group">
          <span class="sub-label">{{ t('outlineColor') }}</span>
          <ColorPicker :model-value="captionStyle.boxColor ?? '#000000'" :show-label="false" @update:model-value="updateStyle('boxColor', $event)" />
        </div>
        <BigSlider :label="t('outlineThickness')" :model-value="captionStyle.boxPadding ?? 6" :min="0" :max="30" :step="1" :default-value="6" :format-value="(value) => `${value}px`" @update:model-value="updateStyle('boxPadding', $event)" />
        <BigSlider :label="t('extrusionDepth')" :model-value="captionStyle.boxRadius ?? 4" :min="0" :max="20" :step="1" :default-value="4" :format-value="(value) => `${value}px`" @update:model-value="updateStyle('boxRadius', $event)" />
      </div>

      <Divider spacing="xs" />

      <!-- Text Shadow Section -->
      <div class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('textShadow') }}</span>
        </div>
        <div class="sub-group">
          <span class="sub-label">{{ t('shadowColor') }}</span>
          <ColorPicker :model-value="captionStyle.shadowColor" :show-label="false" @update:model-value="updateStyle('shadowColor', $event)" />
        </div>
        <div class="sub-group">
          <span class="sub-label">{{ t('direction') }}</span>
          <Select :items="shadowDirectionOptions" :model-value="captionStyle.shadowDirection ?? 'bottom-right'" size="sm" @update:model-value="updateStyle('shadowDirection', $event as CaptionStyle['shadowDirection'])" />
        </div>
        <BigSlider :label="t('shadowBlur')" :model-value="captionStyle.shadowBlur" :min="0" :max="50" :step="1" :default-value="0" :format-value="(value) => `${value}px`" @update:model-value="updateStyle('shadowBlur', $event)" />
      </div>

      <Divider v-if="sentences.length" spacing="xs" />

      <!-- Word Timings Section -->
      <div v-if="sentences.length" class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('wordTimings') }}</span>
        </div>
        <p class="section-desc">{{ t('wordTimingsDescription') }}</p>
        <div class="word-labels" aria-hidden="true"><span>{{ t('word') }}</span><span>{{ t('in') }}</span><span>{{ t('out') }}</span></div>
        <div v-for="sentence in sentences" :key="sentence.id" class="sentence-box">
          <p class="sentence-text">{{ sentence.text }}</p>
          <div v-for="(word, index) in sentence.words" :key="`${sentence.id}-${index}`" class="word-row">
            <Input :model-value="word.text" size="sm" :aria-label="t('captionWordLabel')" @update:model-value="updateWord(sentence.id, index, 'text', String($event))" @blur="flush" />
            <Input :model-value="word.startMs" type="number" size="sm" min="0" :aria-label="t('wordStartTimeLabel')" @update:model-value="updateWord(sentence.id, index, 'startMs', String($event))" @blur="flush" />
            <Input :model-value="word.endMs" type="number" size="sm" min="0" :aria-label="t('wordEndTimeLabel')" @update:model-value="updateWord(sentence.id, index, 'endMs', String($event))" @blur="flush" />
          </div>
        </div>
      </div>

      <!-- Delete Button Zone -->
      <div class="danger-zone">
        <DeleteItem :label="t('deleteCaptionClip')" @click="emit('delete', draft.id)" />
      </div>
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

.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
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

.sub-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.sub-group :deep(.color-picker-wrapper),
.sub-group :deep(.popover-container),
.sub-group :deep(.popover-trigger),
.sub-group :deep(.color-picker-trigger-container) {
  width: 100%;
}

.sub-label,
.word-labels {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}

.word-labels,
.word-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 62px 62px;
  gap: 6px;
}

.word-labels span:not(:first-child) {
  text-align: center;
}

.sentence-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sentence-text {
  margin: 0;
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
}

.danger-zone {
  margin-top: auto;
  position: sticky;
  bottom: 0;
  padding-top: 12px;
  background: var(--color-bg-element);
  z-index: 10;
}
</style>
