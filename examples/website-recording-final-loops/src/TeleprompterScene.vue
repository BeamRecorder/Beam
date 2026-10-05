<script setup lang="ts">
import { computed } from 'vue';
import TeleprompterView from '../../../apps/desktop/src/components/hud/teleprompter/TeleprompterView.vue';
import RecorderBar from '../../../apps/desktop/src/components/hud/recorder/RecorderBar.vue';
import { createDefaultTeleprompterDocument } from '../../../apps/desktop/src/components/hud/teleprompter/teleprompter-types';
import { stateAt } from './motion';
import type { DemoPose } from './demo-types';
const props = defineProps<{ pose: DemoPose; theme: string }>();
const state = computed(() => stateAt(props.pose.time));
const script = `Great stories start with a clear idea.

Today, I’ll show you how to turn a simple screen recording into something worth sharing.

Choose your frame. Find your own rhythm. And keep your words close, so you can stay in the moment.

A little preparation goes a long way.

Ready? Let’s make something beautiful.`;
const document = computed(() => ({
  ...createDefaultTeleprompterDocument('2026-10-05T00:00:00Z'),
  text: script,
  fontSize: 30,
  scrollSpeed: state.value.speed,
}));
</script>
<template>
  <div class="prompter-host native-window">
    <TeleprompterView
      :document="document"
      :editing="!state.reading"
      :playing="state.reading"
      :active-line="0"
      error=""
      :default-text-color="theme === 'dark' ? '#f8fafc' : '#1e1e1e'"
      style="width: 100%; height: 100%"
    />
  </div>
  <div class="recording-host">
    <RecorderBar
      phase="recording"
      :recording-time="`00:${String(12 + Math.floor(pose.time >= 7.5 ? 0 : pose.time)).padStart(2, '0')}.0`"
      visibility="always"
      preview
    />
  </div>
</template>
