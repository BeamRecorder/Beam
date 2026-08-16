<script setup lang="ts">
import { computed, ref } from 'vue';
import { Monitor, Video } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import AudioIconMeter from '~/components/hud/audio/AudioIconMeter.vue';
import SourceSelect from '~/components/hud/SourceSelect.vue';
import { demoCapturePreviews, demoCaptureSources } from '@website/demo/website-demo-fixture';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{ play: [] }>();
const { t } = useI18n();
const sourceKind = ref<'screen' | 'window'>('screen');
const selectedSource = ref<string | null>('beam-demo-display');
const microphoneEnabled = ref(true);
const systemAudioEnabled = ref(true);

const sourceIcon = computed(() => (sourceKind.value === 'screen' ? Monitor : Video));
</script>

<template>
  <section class="hud-preview" :aria-label="t('Website.hud.aria')">
    <header>
      <div>
        <h3>{{ t('Website.hud.title') }}</h3>
      </div>
      <div class="source-tabs" :aria-label="t('Website.hud.sourceType')">
        <Button size="sm" :variant="sourceKind === 'screen' ? 'primary' : 'ghost'" @click="sourceKind = 'screen'">
          {{ t('Website.hud.screen') }}
        </Button>
        <Button size="sm" :variant="sourceKind === 'window' ? 'primary' : 'ghost'" @click="sourceKind = 'window'">
          {{ t('Website.hud.window') }}
        </Button>
      </div>
    </header>

    <div class="source-row">
      <component :is="sourceIcon" aria-hidden="true" />
      <SourceSelect
        v-model="selectedSource"
        :kind="sourceKind"
        :sources="demoCaptureSources"
        :previews="demoCapturePreviews"
      />
    </div>

    <div class="capture-actions">
      <button
        type="button"
        class="device-toggle"
        :aria-pressed="microphoneEnabled"
        @click="microphoneEnabled = !microphoneEnabled"
      >
        <AudioIconMeter kind="mic" :enabled="microphoneEnabled" :level="microphoneEnabled ? 0.42 : 0" />
        {{ t('Website.hud.microphone') }}
      </button>
      <button
        type="button"
        class="device-toggle"
        :aria-pressed="systemAudioEnabled"
        @click="systemAudioEnabled = !systemAudioEnabled"
      >
        <AudioIconMeter kind="system" :enabled="systemAudioEnabled" :level="systemAudioEnabled ? 0.28 : 0" />
        {{ t('Website.hud.systemAudio') }}
      </button>
      <Button :disabled="!selectedSource" @click="emit('play')">{{ t('Website.hud.playRecording') }}</Button>
    </div>
  </section>
</template>

<style scoped>
.hud-preview {
  display: grid;
  gap: 18px;
  width: min(100%, 320px);
  margin: 0 auto;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-md);
}
header,
.capture-actions,
.source-row,
.source-tabs,
.device-toggle {
  display: flex;
  align-items: center;
}
header,
.capture-actions {
  justify-content: space-between;
  gap: 16px;
}
.hud-preview > header,
.capture-actions {
  align-items: stretch;
  flex-direction: column;
}
.source-tabs,
.source-row,
.device-toggle {
  gap: 10px;
}
.source-row > svg {
  width: 22px;
  color: var(--text-muted);
}
.source-row > :last-child {
  flex: 1;
}
.device-toggle {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
h3 {
  font-size: 20px;
}
@media (max-width: 700px) {
  header,
  .capture-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
