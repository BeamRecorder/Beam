<script setup lang="ts">
import { ArrowRight, CheckCircle2, FileCode2, FileVideo2, Laptop, Terminal } from '@lucide/vue';
import { computed } from 'vue';
import { renderState } from './scene-state';
import type { ScenePose } from './scene-types';
const props = defineProps<{ pose: ScenePose }>();
const state = computed(() => renderState(props.pose.clock));
const status = computed(
  () =>
    ({
      idle: 'Ready to render',
      rendering: 'Rendering frames',
      finalizing: 'Writing the file',
      saved: 'Export complete',
    })[state.value.phase],
);
</script>
<template>
  <main class="scene">
    <header class="heading">
      <h1>Rendered on your machine.</h1>
      <p>Your agent directs. Beam CLI does the work.</p>
    </header>
    <section class="machine" aria-label="Local rendering workflow">
      <div class="machine-bar">
        <span class="machine-label"><Laptop :size="30" :stroke-width="1.7" />Your machine</span
        ><span class="local-label">Local render</span>
      </div>
      <div class="command-content">
        <Terminal :size="27" :stroke-width="1.7" />
        <code
          ><span class="prompt">$</span> <span class="typed">{{ state.typed }}</span
          ><span class="caret" :style="{ opacity: state.caret ? 1 : 0 }"></span
        ></code>
      </div>
      <div class="pipeline">
        <div class="source-card">
          <FileCode2 :size="48" :stroke-width="1.4" /><span class="card-title">scene.html</span
          ><span class="card-caption">HTML / TypeScript</span>
        </div>
        <ArrowRight class="connector" :size="30" :stroke-width="1.5" />
        <div class="renderer-card">
          <div class="renderer-title"><img src="../assets/beam.webp" alt="" /><span>Beam</span></div>
          <div class="frame-strip" aria-label="Rendered frame sequence">
            <div v-for="index in 6" :key="index" class="frame" :class="{ complete: index <= state.frame }">
              <span class="frame-shape" :style="{ transform: `rotate(${index * 28}deg)` }"></span>
            </div>
          </div>
          <p class="powered">Powered by <strong>Mediabunny</strong></p>
          <p class="renderer-caption">Encode &amp; write the video</p>
        </div>
        <ArrowRight class="connector" :size="30" :stroke-width="1.5" />
        <div class="output-card" :class="{ saved: state.phase === 'saved' }">
          <div class="saved-file">
            <FileVideo2 :size="48" :stroke-width="1.4" /><span class="card-title">output.mp4</span
            ><span class="saved-label"><CheckCircle2 :size="23" :stroke-width="1.8" />Saved locally</span>
          </div>
        </div>
      </div>
      <div class="render-status">
        <div class="status-line">
          <span :class="{ success: state.phase === 'saved' }">{{ status }}</span
          ><span class="percentage">{{ state.percentage }}%</span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            :class="{ success: state.phase === 'saved' }"
            :style="{ transform: `scaleX(${state.progress})` }"
          ></div>
        </div>
      </div>
    </section>
    <p class="closing">
      <CheckCircle2 :size="27" :stroke-width="1.7" />Render locally. Keep the output on your machine.
    </p>
  </main>
</template>
<style scoped>
.scene {
  width: 1280px;
  height: 800px;
  padding: 72px 76px 0;
  background: var(--color-bg-app);
}
.heading {
  margin-bottom: 38px;
}
h1 {
  margin: 0 0 14px;
  font-size: 48px;
  line-height: 1.15;
  font-weight: 550;
  letter-spacing: -1.5px;
}
.heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 26px;
  line-height: 1.4;
}
.machine {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 18px;
  overflow: hidden;
}
.machine-bar {
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30px;
  border-bottom: 1px solid var(--color-border);
}
.machine-label {
  display: flex;
  align-items: center;
  gap: 13px;
  font-size: 26px;
  font-weight: 500;
}
.local-label {
  font-size: 23px;
  color: var(--text-secondary);
}
.command-content {
  display: flex;
  align-items: center;
  gap: 15px;
  margin: 26px 30px 30px;
  height: 38px;
  color: var(--text-secondary);
}
code {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font:
    26px/36px 'Noto Sans Mono',
    monospace;
  letter-spacing: -0.7px;
  color: var(--text-primary);
  white-space: nowrap;
}
.prompt {
  color: var(--color-primary);
}
.caret {
  width: 2px;
  height: 28px;
  margin-left: -8px;
  background: var(--text-primary);
}
.pipeline {
  display: grid;
  grid-template-columns: 236px 54px 420px 54px 236px;
  align-items: center;
  justify-content: center;
}
.source-card,
.output-card {
  height: 198px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
}
.source-card,
.saved-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 13px;
}
.source-card > svg {
  color: var(--text-secondary);
}
.saved-file {
  height: 100%;
}
.card-title {
  font-family: 'Noto Sans Mono', monospace;
  font-size: 25px;
  letter-spacing: -0.6px;
}
.card-caption {
  font-size: 22px;
  color: var(--text-secondary);
}
.connector {
  justify-self: center;
  color: var(--text-secondary);
}
.renderer-card {
  text-align: center;
}
.renderer-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 34px;
  font-weight: 550;
}
.renderer-title img {
  width: 40px;
  height: 40px;
}
.frame-strip {
  display: flex;
  justify-content: center;
  gap: 7px;
  margin: 18px 0 17px;
}
.frame {
  width: 46px;
  height: 34px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.frame.complete {
  border-color: var(--color-primary);
}
.frame-shape {
  display: block;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: linear-gradient(90deg, var(--color-primary) 50%, var(--color-bg-surface-hover) 50%);
  opacity: 0;
}
.frame.complete .frame-shape {
  opacity: 1;
}
.powered {
  margin: 0;
  color: var(--text-secondary);
  font-size: 24px;
}
.powered strong {
  font-weight: 550;
  color: var(--text-primary);
}
.renderer-caption {
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 22px;
}
.output-card.saved {
  border-color: var(--color-success);
}
.saved-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 24px;
  color: var(--color-success);
}
.render-status {
  margin: 30px 30px 29px;
}
.status-line {
  display: flex;
  justify-content: space-between;
  font-size: 24px;
  color: var(--text-secondary);
  margin-bottom: 13px;
}
.percentage {
  font-family: 'Noto Sans Mono', monospace;
  font-size: 23px;
}
.progress-track {
  height: 5px;
  background: var(--color-bg-surface-hover);
}
.progress-fill {
  width: 100%;
  height: 100%;
  background: var(--color-primary);
  transform-origin: left center;
}
.progress-fill.success {
  background: var(--color-success);
}
.status-line .success {
  color: var(--color-success);
}
.closing {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 29px 0 0 30px;
  color: var(--text-secondary);
  font-size: 26px;
}
.closing svg {
  color: var(--color-success);
}
</style>
