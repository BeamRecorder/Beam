<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  AlignCenter,
  AlignLeft,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Minus,
  Pause,
  Play,
  ScrollText,
  Settings,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Select from '~/ui/select/Select.vue';
import Switch from '~/ui/switch/Switch.vue';
import Textarea from '~/ui/textarea/Textarea.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import { useTeleprompter } from './useTeleprompter';

const { t } = useTranslate('Teleprompter');
const state = useTeleprompter();
const isSettingsOpen = ref(false);
const modeOptions = computed(() => [
  { value: 'continuous', label: t('continuous') },
  { value: 'line-by-line', label: t('lineByLine') },
]);
const isAutoscrolling = computed(() => state.document.value.autoscroll && !state.isPaused.value);
const updateText = (text: string) => state.updateDocument({ text });
const hide = () => capture.hideTeleprompter();
const onSession = (event: Event) => {
  const context = (event as CustomEvent).detail ?? null;
  // A session is created when recording starts. The script should immediately
  // become a clean reader, while remaining editable before recording.
  if (context) state.isEditing.value = false;
  void state.applySession(context);
};
const onShortcut = (event: Event) => state.handleShortcut(String((event as CustomEvent).detail ?? ''));
onMounted(() => {
  window.addEventListener('teleprompter-session', onSession);
  window.addEventListener('teleprompter-shortcut', onShortcut);
});
onBeforeUnmount(() => {
  window.removeEventListener('teleprompter-session', onSession);
  window.removeEventListener('teleprompter-shortcut', onShortcut);
});
</script>

<template>
  <main class="teleprompter-window">
    <header class="teleprompter-header">
      <div class="teleprompter-title-group">
        <ScrollText class="teleprompter-title-icon" :size="16" aria-hidden="true" />
        <Button
          v-if="isSettingsOpen"
          variant="ghost"
          size="xs"
          icon-only
          :icon="ChevronLeft"
          :aria-label="t('back')"
          :tooltip="t('back')"
          tooltip-position="bottom"
          @click="isSettingsOpen = false"
        />
        <div class="teleprompter-title">{{ isSettingsOpen ? t('settings') : t('title') }}</div>
      </div>
      <div class="teleprompter-actions">
        <Button
          v-if="!isSettingsOpen"
          variant="ghost"
          size="xs"
          icon-only
          :icon="state.isEditing.value ? Eye : Edit3"
          :aria-label="state.isEditing.value ? t('preview') : t('edit')"
          :tooltip="state.isEditing.value ? t('preview') : t('edit')"
          tooltip-position="bottom"
          @click="state.isEditing.value = !state.isEditing.value"
        />
        <Button
          v-if="!isSettingsOpen"
          variant="ghost"
          size="xs"
          icon-only
          :icon="Settings"
          :aria-label="t('settings')"
          :tooltip="t('settings')"
          tooltip-position="bottom"
          @click="isSettingsOpen = true"
        />
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :icon="Minus"
          :aria-label="t('hide')"
          :tooltip="t('hide')"
          tooltip-position="bottom"
          @click="hide"
        />
      </div>
    </header>
    <Transition name="teleprompter-view" mode="out-in">
      <section v-if="isSettingsOpen" key="settings" class="settings-view" :aria-label="t('settings')">
        <div class="settings-form">
          <div class="setting-row">
            <span>{{ t('mode') }}</span
            ><Select
              :model-value="state.document.value.mode"
              :options="modeOptions"
              @update:model-value="state.updateDocument({ mode: $event })"
            />
          </div>
          <div class="setting-row">
            <span>{{ t('autoscroll') }}</span
            ><Switch
              :model-value="state.document.value.autoscroll"
              :label="state.document.value.autoscroll ? t('on') : t('off')"
              @update:model-value="state.updateDocument({ autoscroll: $event })"
            />
          </div>
          <BigSlider
            :model-value="state.document.value.scrollSpeed"
            :min="5"
            :max="200"
            :step="1"
            :label="t('speed')"
            :format-value="(value) => String(value) + ' px/s'"
            @update:model-value="state.updateDocument({ scrollSpeed: $event })"
          />
          <BigSlider
            :model-value="state.document.value.fontSize"
            :min="16"
            :max="36"
            :step="1"
            :label="t('fontSize')"
            :format-value="(value) => String(value) + 'px'"
            @update:model-value="state.updateDocument({ fontSize: $event })"
          />
          <BigSlider
            :model-value="state.document.value.lineHeight"
            :min="1"
            :max="2.5"
            :step="0.05"
            :label="t('lineHeight')"
            @update:model-value="state.updateDocument({ lineHeight: $event })"
          />
          <div class="setting-row">
            <span>{{ t('align') }}</span>
            <div class="align-actions">
              <Button
                variant="tab"
                size="sm"
                icon-only
                :class="{ active: state.document.value.textAlign === 'left' }"
                :aria-label="t('alignLeft')"
                :tooltip="t('alignLeft')"
                tooltip-position="bottom"
                :icon="AlignLeft"
                @click="state.updateDocument({ textAlign: 'left' })"
              /><Button
                variant="tab"
                size="sm"
                icon-only
                :class="{ active: state.document.value.textAlign === 'center' }"
                :aria-label="t('alignCenter')"
                :tooltip="t('alignCenter')"
                tooltip-position="bottom"
                :icon="AlignCenter"
                @click="state.updateDocument({ textAlign: 'center' })"
              />
            </div>
          </div>
        </div>
      </section>
      <section v-else key="reader" class="reader-view">
        <p v-if="state.error.value" class="teleprompter-error" role="alert">{{ state.error.value }}</p>
        <section v-if="state.isEditing.value" class="editor-panel">
          <Textarea
            :model-value="state.document.value.text"
            :placeholder="t('placeholder')"
            :aria-label="t('editorLabel')"
            :rows="4"
            @update:model-value="updateText"
          />
        </section>
        <section
          :ref="state.setDisplayElement"
          class="teleprompter-display"
          :class="{ 'is-centered': state.document.value.textAlign === 'center' }"
          :style="{
            '--teleprompter-font-size': String(state.document.value.fontSize) + 'px',
            '--teleprompter-line-height': state.document.value.lineHeight,
          }"
          :aria-label="t('readerLabel')"
        >
          <p
            v-for="(line, index) in state.lines.value"
            :key="index + '-' + line"
            :data-line-index="index"
            class="teleprompter-line"
            :class="{
              active: state.document.value.mode === 'line-by-line' && state.activeLine.value === index,
              past: state.document.value.mode === 'line-by-line' && index < state.activeLine.value,
            }"
          >
            {{ line || '\u00a0' }}
          </p>
        </section>
        <footer class="teleprompter-footer" :aria-label="t('playbackControls')">
          <div class="player-controls">
            <Button
              variant="secondary"
              size="xs"
              icon-only
              :icon="ChevronLeft"
              :aria-label="t('previousLine')"
              :tooltip="t('previousLine')"
              tooltip-position="bottom"
              :disabled="state.document.value.mode === 'line-by-line' && state.activeLine.value <= 0"
              @click="state.previousLine"
            />
            <Button
              class="player-toggle"
              variant="primary"
              size="sm"
              icon-only
              :icon="isAutoscrolling ? Pause : Play"
              :aria-label="isAutoscrolling ? t('pause') : t('resume')"
              :tooltip="isAutoscrolling ? t('pause') : t('resume')"
              tooltip-position="bottom"
              @click="state.togglePause"
            />
            <Button
              variant="secondary"
              size="xs"
              icon-only
              :icon="ChevronRight"
              :aria-label="t('nextLine')"
              :tooltip="t('nextLine')"
              tooltip-position="bottom"
              :disabled="
                state.document.value.mode === 'line-by-line' && state.activeLine.value >= state.lines.value.length - 1
              "
              @click="state.nextLine"
            />
          </div>
          <span
            v-if="state.document.value.mode === 'line-by-line'"
            class="line-progress"
            :aria-label="
              t('lineProgress', { current: state.activeLine.value + 1, total: Math.max(1, state.lines.value.length) })
            "
            >{{ state.activeLine.value + 1 }} / {{ Math.max(1, state.lines.value.length) }}</span
          >
        </footer>
      </section>
    </Transition>
  </main>
</template>

<style scoped>
.teleprompter-window {
  --teleprompter-bg: var(--color-bg-surface);
  --teleprompter-panel: var(--color-bg-element);
  --teleprompter-text: var(--text-primary);
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--teleprompter-bg);
  color: var(--teleprompter-text);
}
.teleprompter-window.theme-dark {
  --teleprompter-bg: #101114;
  --teleprompter-panel: #1b1d22;
  --teleprompter-text: #f8fafc;
}
.teleprompter-window.theme-light {
  --teleprompter-bg: #f7f5f0;
  --teleprompter-panel: #fff;
  --teleprompter-text: #1e1e1e;
}
.teleprompter-header,
.teleprompter-footer {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: var(--teleprompter-panel);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}
.teleprompter-header {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 3;
  height: 36px;
  min-height: 36px;
  max-height: 36px;
  flex: 0 0 36px;
  flex-shrink: 0;
}
.teleprompter-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  display: flex;
  width: 100%;
  height: 44px;
  max-height: 44px;
  min-height: 44px;
  flex: 0 0 44px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: visible;
  border-top: 1px solid var(--color-border);
  border-bottom: 0;
  -webkit-app-region: no-drag;
}
.teleprompter-title-group {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.teleprompter-title-group :deep(.btn-container),
.teleprompter-title-group :deep(.tooltip-wrapper) {
  -webkit-app-region: no-drag;
}
.teleprompter-title-icon {
  flex: 0 0 16px;
  color: var(--color-primary);
}
.teleprompter-title {
  font-size: 12px;
  font-weight: 700;
  user-select: none;
}
.teleprompter-actions,
.align-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}
.reader-view {
  position: absolute;
  inset: 36px 0 0;
  display: flex;
  width: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 44px;
}
.settings-view {
  position: absolute;
  inset: 36px 0 0;
  width: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  background: var(--teleprompter-bg);
}
.settings-form {
  width: min(100%, 520px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0 auto;
}
.editor-panel {
  padding: 12px 16px 0;
  background: var(--teleprompter-bg);
}
.teleprompter-error {
  margin: 0;
  padding: 8px 16px;
  background: var(--color-error-light);
  color: var(--color-error);
  font-size: 12px;
}
.teleprompter-display {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 28px 11%;
  scroll-behavior: smooth;
  font-size: var(--teleprompter-font-size);
  line-height: var(--teleprompter-line-height);
  color: var(--teleprompter-text);
}
.teleprompter-display::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.teleprompter-display.is-centered {
  text-align: center;
}
.teleprompter-line {
  max-width: 100%;
  margin: 0 0 0.55em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  transition:
    color 0.2s,
    opacity 0.2s;
}
.teleprompter-line.past {
  color: var(--text-muted);
  opacity: 0.55;
}
.teleprompter-line.active {
  color: var(--color-primary);
  font-weight: 700;
}
.player-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.player-controls :deep(.btn) {
  width: 28px;
  height: 28px;
  padding: 0;
}
.player-toggle :deep(.btn) {
  width: 32px;
  height: 32px;
}
.line-progress {
  position: absolute;
  right: 8px;
  bottom: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.setting-row > span {
  color: var(--text-secondary);
}
.align-actions {
  gap: 4px;
}
@media (max-width: 640px) {
  .teleprompter-display {
    padding-inline: 24px;
  }
  .line-progress {
    right: 6px;
  }
}
@media (max-width: 360px) {
  .teleprompter-title {
    display: none;
  }
  .teleprompter-header {
    padding-inline: 5px;
  }
  .teleprompter-display {
    padding-inline: 12px;
  }
  .settings-view {
    padding-inline: 10px;
  }
  .line-progress {
    font-size: 10px;
  }
}
.teleprompter-view-enter-active,
.teleprompter-view-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.teleprompter-view-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.teleprompter-view-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
@media (prefers-reduced-motion: reduce) {
  .teleprompter-view-enter-active,
  .teleprompter-view-leave-active {
    transition: none;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
