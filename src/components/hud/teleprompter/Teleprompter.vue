<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { AlignCenter, AlignLeft, ChevronLeft, ChevronRight, Edit3, Eye, Pause, Play, Settings, X } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import BigSlider from '~/ui/slider/BigSlider.vue'
import Popover from '~/ui/popover/Popover.vue'
import Select from '~/ui/select/Select.vue'
import Switch from '~/ui/switch/Switch.vue'
import Textarea from '~/ui/textarea/Textarea.vue'
import { useTranslate } from '~/i18n/useTranslate'
import { capture } from '~/api/capture'
import type { TeleprompterTheme } from './teleprompter-types'
import { useTeleprompter } from './useTeleprompter'

const { t } = useTranslate('Teleprompter')
const state = useTeleprompter()
const themeClass = computed(() => `theme-${state.document.value.theme}`)
const modeOptions = computed(() => [{ value: 'continuous', label: t('continuous') }, { value: 'line-by-line', label: t('lineByLine') }])
const themeOptions = computed(() => [{ value: 'system', label: t('systemTheme') }, { value: 'light', label: t('lightTheme') }, { value: 'dark', label: t('darkTheme') }])
const isAutoscrolling = computed(() => state.document.value.autoscroll && !state.isPaused.value)
const updateText = (text: string) => state.updateDocument({ text })
const setTheme = (value: string | number | null) => { if (value === 'system' || value === 'light' || value === 'dark') state.updateDocument({ theme: value as TeleprompterTheme }) }
const hide = () => capture.hideTeleprompter()
const onSession = (event: Event) => { void state.applySession((event as CustomEvent).detail ?? null) }
const onShortcut = (event: Event) => state.handleShortcut(String((event as CustomEvent).detail ?? ''))
onMounted(() => { window.addEventListener('teleprompter-session', onSession); window.addEventListener('teleprompter-shortcut', onShortcut) })
onBeforeUnmount(() => { window.removeEventListener('teleprompter-session', onSession); window.removeEventListener('teleprompter-shortcut', onShortcut) })
</script>

<template>
  <main class="teleprompter-window" :class="themeClass">
    <header class="teleprompter-header">
      <div class="teleprompter-title">{{ t('title') }}</div>
      <div class="teleprompter-actions">
        <Button variant="ghost" size="sm" :icon="state.isEditing.value ? Eye : Edit3" :aria-label="state.isEditing.value ? t('preview') : t('edit')" @click="state.isEditing.value = !state.isEditing.value">{{ state.isEditing.value ? t('preview') : t('edit') }}</Button>
        <Popover align="right" :match-trigger-width="false">
          <template #trigger><Button variant="ghost" size="sm" :icon="Settings" :aria-label="t('settings')">{{ t('settings') }}</Button></template>
          <section class="settings-panel" :aria-label="t('settings')">
            <div class="setting-row"><span>{{ t('mode') }}</span><Select :model-value="state.document.value.mode" :options="modeOptions" @update:model-value="state.updateDocument({ mode: $event })" /></div>
            <div class="setting-row"><span>{{ t('autoscroll') }}</span><Switch :model-value="state.document.value.autoscroll" :label="state.document.value.autoscroll ? t('on') : t('off')" @update:model-value="state.updateDocument({ autoscroll: $event })" /></div>
            <BigSlider :model-value="state.document.value.scrollSpeed" :min="5" :max="200" :step="1" :label="t('speed')" :format-value="(value) => `${value} px/s`" @update:model-value="state.updateDocument({ scrollSpeed: $event })" />
            <BigSlider :model-value="state.document.value.fontSize" :min="16" :max="120" :step="1" :label="t('fontSize')" :format-value="(value) => `${value}px`" @update:model-value="state.updateDocument({ fontSize: $event })" />
            <BigSlider :model-value="state.document.value.lineHeight" :min="1" :max="2.5" :step="0.05" :label="t('lineHeight')" @update:model-value="state.updateDocument({ lineHeight: $event })" />
            <div class="setting-row"><span>{{ t('align') }}</span><div class="align-actions"><Button variant="tab" size="sm" icon-only :class="{ active: state.document.value.textAlign === 'left' }" :aria-label="t('alignLeft')" :icon="AlignLeft" @click="state.updateDocument({ textAlign: 'left' })" /><Button variant="tab" size="sm" icon-only :class="{ active: state.document.value.textAlign === 'center' }" :aria-label="t('alignCenter')" :icon="AlignCenter" @click="state.updateDocument({ textAlign: 'center' })" /></div></div>
            <div class="setting-row"><span>{{ t('theme') }}</span><Select :model-value="state.document.value.theme" :options="themeOptions" @update:model-value="setTheme" /></div>
          </section>
        </Popover>
        <Button variant="primary" size="sm" :icon="X" :aria-label="t('hide')" @click="hide">{{ t('hide') }}</Button>
      </div>
    </header>
    <p v-if="state.error.value" class="teleprompter-error" role="alert">{{ state.error.value }}</p>
    <section v-if="state.isEditing.value" class="editor-panel"><Textarea :model-value="state.document.value.text" :placeholder="t('placeholder')" :aria-label="t('editorLabel')" :rows="4" @update:model-value="updateText" /></section>
    <section :ref="state.setDisplayElement" class="teleprompter-display" :class="{ 'is-centered': state.document.value.textAlign === 'center' }" :style="{ '--teleprompter-font-size': `${state.document.value.fontSize}px`, '--teleprompter-line-height': state.document.value.lineHeight }" :aria-label="t('readerLabel')">
      <p v-for="(line, index) in state.lines.value" :key="`${index}-${line}`" :data-line-index="index" class="teleprompter-line" :class="{ active: state.document.value.mode === 'line-by-line' && state.activeLine.value === index, past: state.document.value.mode === 'line-by-line' && index < state.activeLine.value }">{{ line || '\u00a0' }}</p>
    </section>
    <footer class="teleprompter-footer">
      <Button variant="secondary" size="sm" :icon="ChevronLeft" :aria-label="t('previousLine')" @click="state.previousLine">{{ t('previous') }}</Button>
      <Button variant="primary" size="sm" :icon="isAutoscrolling ? Pause : Play" :aria-label="isAutoscrolling ? t('pause') : t('resume')" @click="state.togglePause">{{ isAutoscrolling ? t('pause') : t('resume') }}</Button>
      <span class="scroll-status" :class="{ active: isAutoscrolling }"><span class="status-dot" />{{ isAutoscrolling ? t('autoscrolling') : t('autoscrollPaused') }}</span>
      <Button variant="secondary" size="sm" :icon="ChevronRight" :aria-label="t('nextLine')" @click="state.nextLine">{{ t('next') }}</Button>
    </footer>
  </main>
</template>

<style scoped>
.teleprompter-window { --teleprompter-bg: var(--color-bg-surface); --teleprompter-panel: var(--color-bg-element); --teleprompter-text: var(--text-primary); width: 100vw; height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: var(--teleprompter-bg); color: var(--teleprompter-text); }
.teleprompter-window.theme-dark { --teleprompter-bg: #101114; --teleprompter-panel: #1b1d22; --teleprompter-text: #f8fafc; }
.teleprompter-window.theme-light { --teleprompter-bg: #f7f5f0; --teleprompter-panel: #fff; --teleprompter-text: #1e1e1e; }
.teleprompter-header, .teleprompter-footer { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--teleprompter-panel); border-bottom: 1px solid var(--color-border); -webkit-app-region: drag; }
.teleprompter-footer { border-top: 1px solid var(--color-border); border-bottom: 0; -webkit-app-region: no-drag; }
.teleprompter-title { font-weight: 700; flex: 1; user-select: none; }
.teleprompter-actions, .align-actions { display: flex; align-items: center; gap: 6px; -webkit-app-region: no-drag; }
.editor-panel { padding: 12px 16px 0; background: var(--teleprompter-bg); }
.teleprompter-error { margin: 0; padding: 8px 16px; background: var(--color-error-light); color: var(--color-error); font-size: 12px; }
.teleprompter-display { flex: 1; overflow-y: auto; padding: 34px 11%; scroll-behavior: smooth; font-size: var(--teleprompter-font-size); line-height: var(--teleprompter-line-height); color: var(--teleprompter-text); }
.teleprompter-display.is-centered { text-align: center; }
.teleprompter-line { margin: 0 0 0.55em; white-space: pre-wrap; transition: color 0.2s, opacity 0.2s; }
.teleprompter-line.past { color: var(--text-muted); opacity: 0.55; }
.teleprompter-line.active { color: var(--color-primary); font-weight: 700; }
.scroll-status { display: inline-flex; align-items: center; gap: 6px; margin: 0 auto; color: var(--text-muted); font-size: 12px; }
.scroll-status.active { color: var(--color-primary); }
.status-dot { width: 7px; height: 7px; border-radius: var(--radius-full); background: currentColor; }
.settings-panel { width: 340px; max-width: calc(100vw - 24px); padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
.setting-row > span { color: var(--text-secondary); }
.align-actions { gap: 4px; }
@media (max-width: 640px) { .teleprompter-display { padding-inline: 24px; } .teleprompter-footer { gap: 6px; } }
</style>
