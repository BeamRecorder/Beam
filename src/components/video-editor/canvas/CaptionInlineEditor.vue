<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue';
import { TriangleAlert } from '@lucide/vue';
import type { CaptionClip } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';

const props = defineProps<{
  clip: CaptionClip & { caption: { type: 'text' } };
  viewportStyle: CSSProperties;
  layoutStyle: CSSProperties;
  renderScale: number;
  warningPlacement: 'above' | 'below';
}>();
const emit = defineEmits<{
  (event: 'update', value: string): void;
  (event: 'finish'): void;
  (event: 'cancel'): void;
}>();
const { t } = useTranslate('CaptionClipPanel');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const UPDATE_DEBOUNCE_MS = 150;
let updateTimer: ReturnType<typeof setTimeout> | null = null;
let pendingText: string | null = null;
let isCancelling = false;

const transcriptionText = computed(() => props.clip.caption.sentences.map((sentence) => sentence.text).join(' '));
const editableText = computed(() => props.clip.caption.style.customText ?? transcriptionText.value);
const fontSize = computed(() => Math.max(1, props.clip.caption.style.fontSize * props.renderScale));

const textShadow = computed(() => {
  const style = props.clip.caption.style;
  const scale = props.renderScale;
  const shadows: string[] = [];
  if (style.shadowBlur > 0) {
    const blur = style.shadowBlur * scale;
    const direction = style.shadowDirection;
    const x =
      style.shadowOffsetX ?? (direction === 'top-left' ? -blur * 0.5 : direction === 'bottom-right' ? blur * 0.5 : 0);
    const y =
      style.shadowOffsetY ??
      (direction === 'top-left'
        ? -blur * 0.5
        : direction === 'bottom' || direction === 'bottom-right'
          ? blur * 0.5
          : 0);
    shadows.push(`${x}px ${y}px ${blur}px ${style.shadowColor}`);
  }
  const extrusion = Math.min(16, Math.ceil(Math.max(0, style.extrusionDepth) * scale));
  for (let step = 1; step <= extrusion; step += 1) shadows.push(`${step}px ${step}px 0 ${style.shadowColor}`);
  return shadows.length ? shadows.join(', ') : 'none';
});

const textStyle = computed<CSSProperties>(() => {
  const style = props.clip.caption.style;
  return {
    backgroundColor: 'transparent',
    color: style.color,
    WebkitTextFillColor: style.color,
    fontFamily: style.fontFamily,
    fontSize: `${fontSize.value}px`,
    fontStyle: style.fontStyle,
    fontWeight: style.fontWeight,
    letterSpacing: `${style.letterSpacing * props.renderScale}px`,
    lineHeight: String(style.lineHeight),
    paintOrder: 'stroke fill',
    textAlign: style.textAlign,
    textDecoration: style.textDecoration,
    textShadow: textShadow.value,
    WebkitTextStroke:
      style.outlineColor !== 'transparent' && style.outlineWidth > 0
        ? `${style.outlineWidth * props.renderScale * 2}px ${style.outlineColor}`
        : undefined,
  };
});

const resizeTextarea = () => {
  const textarea = textareaRef.value;
  if (!textarea) return;
  textarea.style.height = '0px';
  textarea.style.height = `${Math.min(textarea.scrollHeight, textarea.parentElement?.clientHeight ?? textarea.scrollHeight)}px`;
};

const focusAtEnd = async () => {
  await nextTick();
  const textarea = textareaRef.value;
  if (!textarea) return;
  textarea.value = editableText.value;
  resizeTextarea();
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
};

const handleInput = (event: Event) => {
  resizeTextarea();
  pendingText = (event.target as HTMLTextAreaElement).value;
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(flushPendingUpdate, UPDATE_DEBOUNCE_MS);
};
function flushPendingUpdate() {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = null;
  if (pendingText === null) return;
  emit('update', pendingText);
  pendingText = null;
}
const discardPendingUpdate = () => {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = null;
  pendingText = null;
};
const finishEditing = () => {
  if (isCancelling) return;
  flushPendingUpdate();
  emit('finish');
};
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    isCancelling = true;
    discardPendingUpdate();
    emit('cancel');
    return;
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.stopPropagation();
    finishEditing();
  }
};

watch(editableText, (text) => {
  const textarea = textareaRef.value;
  if (!textarea || document.activeElement === textarea || textarea.value === text) return;
  textarea.value = text;
  resizeTextarea();
});
watch([fontSize, () => props.clip.caption.style.lineHeight, () => props.layoutStyle], resizeTextarea, {
  flush: 'post',
});
onMounted(focusAtEnd);
onUnmounted(discardPendingUpdate);
</script>

<template>
  <div class="caption-text-editor-viewport" :style="viewportStyle">
    <div class="caption-text-editor" :style="layoutStyle" @pointerdown.stop @dblclick.stop @wheel.stop>
      <div class="caption-text-editor__field">
        <textarea
          ref="textareaRef"
          rows="1"
          :wrap="clip.caption.style.wrap ? 'soft' : 'off'"
          :style="textStyle"
          :aria-label="t('captionText')"
          :spellcheck="false"
          @input="handleInput"
          @keydown="handleKeydown"
          @blur="finishEditing"
        />
      </div>
      <div
        v-if="clip.isAiGenerated"
        class="caption-text-editor__warning"
        :class="`is-${warningPlacement}`"
        role="status"
        aria-live="polite"
      >
        <TriangleAlert :size="14" aria-hidden="true" />
        <span>{{ t('aiTimingEditWarning') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.caption-text-editor-viewport {
  position: absolute;
  z-index: 8;
  overflow: visible;
  pointer-events: none;
}
.caption-text-editor {
  position: absolute;
  pointer-events: auto;
  user-select: text;
}
.caption-text-editor__field {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 24%, transparent);
}
textarea {
  display: block;
  width: 100%;
  min-height: 1em;
  max-height: 100%;
  margin: 0;
  padding: 0 2px;
  overflow: hidden;
  box-sizing: border-box;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  caret-color: var(--color-primary);
  user-select: text;
}
.caption-text-editor__warning {
  position: absolute;
  left: 50%;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: max-content;
  max-width: min(360px, 75vw);
  padding: 7px 9px;
  transform: translateX(-50%);
  border: 1px solid color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-element) 94%, transparent);
  box-shadow: var(--shadow-md);
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.35;
  pointer-events: none;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.caption-text-editor__warning.is-above {
  bottom: calc(100% + 8px);
}
.caption-text-editor__warning.is-below {
  top: calc(100% + 8px);
}
.caption-text-editor__warning svg {
  flex: 0 0 auto;
  color: var(--color-warning);
}
</style>
