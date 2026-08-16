<script setup lang="ts">
import { computed, ref } from 'vue';
import { Monitor, Video } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import AudioIconMeter from '~/components/hud/audio/AudioIconMeter.vue';
import SourceSelect from '~/components/hud/SourceSelect.vue';
import { demoCapturePreviews, demoCaptureSources } from '@website/demo/website-demo-fixture';

const emit = defineEmits<{ play: [] }>();
const sourceKind = ref<'screen' | 'window'>('screen');
const selectedSource = ref<string | null>('beam-demo-display');
const microphoneEnabled = ref(true);
const systemAudioEnabled = ref(true);

const sourceIcon = computed(() => (sourceKind.value === 'screen' ? Monitor : Video));
</script>

<template>
  <section class="hud-preview" aria-label="Beam capture controls demo">
    <header>
      <div>
        <p class="eyebrow">Real Beam HUD controls · demo data</p>
        <h3>Choose what to record</h3>
      </div>
      <div class="source-tabs" aria-label="Capture source type">
        <Button size="sm" :variant="sourceKind === 'screen' ? 'primary' : 'ghost'" @click="sourceKind = 'screen'">
          Screen
        </Button>
        <Button size="sm" :variant="sourceKind === 'window' ? 'primary' : 'ghost'" @click="sourceKind = 'window'">
          Window
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
        Microphone
      </button>
      <button
        type="button"
        class="device-toggle"
        :aria-pressed="systemAudioEnabled"
        @click="systemAudioEnabled = !systemAudioEnabled"
      >
        <AudioIconMeter kind="system" :enabled="systemAudioEnabled" :level="systemAudioEnabled ? 0.28 : 0" />
        System audio
      </button>
      <Button :disabled="!selectedSource" @click="emit('play')">Play the real recording</Button>
    </div>
  </section>
</template>

<style scoped>
.hud-preview {
  display: grid;
  gap: 18px;
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
.eyebrow {
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
h3 {
  margin-top: 3px;
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
