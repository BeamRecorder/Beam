<script setup lang="ts">
import { Check, CheckCircle2, Terminal } from '@lucide/vue';
import { computed } from 'vue';
import { commands } from './commands';
import { commandState } from './scene-state';
import type { ScenePose } from './scene-types';
const props = defineProps<{ pose: ScenePose }>();
const rows = computed(() => commands.map((cue) => ({ cue, state: commandState(cue, props.pose.clock) })));
</script>
<template>
  <main class="scene">
    <header class="heading">
      <img class="beam-mark" src="../assets/beam.webp" alt="" />
      <div>
        <h1>Beam CLI</h1>
        <p class="subtitle">Your agent. Your editing workspace.</p>
      </div>
    </header>
    <section class="terminal" aria-label="Beam CLI command examples">
      <div class="terminal-bar">
        <span class="terminal-title"><Terminal :size="25" :stroke-width="1.7" />beam-cli</span>
        <span class="terminal-note">Video &amp; Screenshot</span>
      </div>
      <div class="command-rows">
        <div v-for="({ cue, state }, index) in rows" :key="cue.command" class="command-row">
          <div class="purpose">
            <span class="number">0{{ index + 1 }}</span
            >{{ cue.label }}
          </div>
          <div class="command-content">
            <span class="prompt" aria-hidden="true">$</span>
            <code
              ><span class="typed">{{ state.typed }}</span
              ><span class="caret" :style="{ opacity: state.caret ? 1 : 0 }" aria-hidden="true"></span
            ></code>
            <Check
              class="completed"
              :size="25"
              :stroke-width="1.8"
              :style="{ opacity: state.complete ? 1 : 0 }"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </section>
    <p class="closing"><CheckCircle2 :size="26" :stroke-width="1.7" />Live edits in Beam. Built-in undo.</p>
  </main>
</template>
<style scoped>
.scene {
  width: 1280px;
  height: 800px;
  padding: 74px 76px 0;
  background: var(--color-bg-app);
}
.heading {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 96px;
  margin-bottom: 44px;
}
.beam-mark {
  width: 62px;
  height: 62px;
  object-fit: contain;
}
h1 {
  margin: 0 0 8px;
  font-size: 48px;
  font-weight: 550;
  letter-spacing: -1.5px;
  line-height: 1;
}
.subtitle {
  margin: 0;
  font-size: 26px;
  color: var(--text-secondary);
  line-height: 1.35;
}
.terminal {
  border: 1px solid var(--color-border-strong);
  border-radius: 16px;
  overflow: hidden;
  background: var(--color-bg-surface);
}
.terminal-bar {
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30px;
  border-bottom: 1px solid var(--color-border);
}
.terminal-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
  color: var(--text-secondary);
}
.terminal-note {
  font-size: 22px;
  color: var(--text-secondary);
}
.command-rows {
  padding: 8px 30px 18px;
  background: var(--color-bg-element);
}
.command-row {
  height: 116px;
  padding: 22px 0 12px;
}
.command-row + .command-row {
  border-top: 1px solid var(--color-border);
}
.purpose {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 23px;
  line-height: 28px;
  color: var(--text-secondary);
}
.number {
  font-family: 'Noto Sans Mono', monospace;
  font-size: 19px;
}
.command-content {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 36px;
  margin-top: 9px;
  white-space: nowrap;
}
.prompt {
  color: var(--color-primary);
  font-family: 'Noto Sans Mono', monospace;
  font-size: 27px;
}
code {
  display: inline-flex;
  align-items: center;
  font-family: 'Noto Sans Mono', monospace;
  font-size: 26px;
  line-height: 36px;
  letter-spacing: -0.7px;
}
.caret {
  display: inline-block;
  width: 2px;
  height: 27px;
  margin-left: 2px;
  background: var(--text-primary);
}
.completed {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--color-success);
}
.closing {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 30px 0 0 30px;
  font-size: 26px;
  color: var(--text-secondary);
}
.closing svg {
  color: var(--color-success);
}
</style>
