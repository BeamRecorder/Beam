<script setup lang="ts">
import type { VNodeRef } from 'vue';
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
import type { TeleprompterMode } from './teleprompter-types';

const { t } = useTranslate('Teleprompter');
const state = useTeleprompter();
const setDisplayElement: VNodeRef = (element) => {
  state.setDisplayElement(element instanceof HTMLElement ? element : null);
};
const isSettingsOpen = ref(false);
const modeOptions = computed(() => [
  { value: 'continuous', label: t('continuous') },
  { value: 'line-by-line', label: t('lineByLine') },
]);
const isAutoscrolling = computed(() => state.document.value.autoscroll && !state.isPaused.value);
const updateText = (text: string) => state.updateDocument({ text });
const updateMode = (value: string | number) => {
  if (typeof value === 'string') state.updateDocument({ mode: value as TeleprompterMode });
};
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
            ><Select :model-value="state.document.value.mode" :options="modeOptions" @update:model-value="updateMode" />
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
          :ref="setDisplayElement"
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

<style scoped src="./Teleprompter.css"></style>
