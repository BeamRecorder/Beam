<script setup lang="ts">
import { FileCode2, Save } from '@lucide/vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import type { SceneState } from './scene-types';
defineProps<{ state: SceneState; clock: number }>();
</script>
<template>
  <section class="source-panel">
    <header class="source-header">
      <FileCode2 :size="14" /><span>scene.html</span><span class="source-language">HTML / GSAP</span>
    </header>
    <div class="source-body">
      <div class="code-row">
        <span class="line-number">1</span
        ><code
          ><span class="tag">&lt;section</span> <span class="attribute">class</span>=<span class="string"
            >"artwork"</span
          ><span class="tag">&gt;</span></code
        >
      </div>
      <div class="code-row">
        <span class="line-number">2</span
        ><code>
          <span class="tag">&lt;div</span> <span class="attribute">class</span>=<span class="string">"orbit"</span
          ><span class="tag">&gt;&lt;/div&gt;</span></code
        >
      </div>
      <div class="code-row edited-line" :class="{ editing: clock >= 1.4 && clock < 3.15 }">
        <span class="line-number">3</span
        ><code>
          <span class="tag">&lt;h1&gt;</span>{{ state.typed
          }}<span class="caret" :style="{ opacity: state.caret ? 1 : 0 }"></span
          ><span class="tag">&lt;/h1&gt;</span></code
        >
      </div>
      <div class="code-row">
        <span class="line-number">4</span><code><span class="tag">&lt;/section&gt;</span></code>
      </div>
      <div class="code-row blank"><span class="line-number">5</span><code> </code></div>
      <div class="code-row">
        <span class="line-number">6</span><code><span class="selector">.orbit</span> {</code>
      </div>
      <div class="code-row">
        <span class="line-number">7</span
        ><code>
          <span class="attribute">background</span>: <span class="string">{{ state.accent }}</span
          >;</code
        >
      </div>
      <div class="code-row">
        <span class="line-number">8</span
        ><code> <span class="attribute">border-radius</span>: <span class="number">50%</span>;</code>
      </div>
      <div class="code-row"><span class="line-number">9</span><code>}</code></div>
      <div class="code-row blank"><span class="line-number">10</span><code> </code></div>
      <div class="code-row">
        <span class="line-number">11</span
        ><code
          ><span class="attribute">tl</span>.<span class="selector">to</span>(<span class="string">".orbit"</span>,
          {</code
        >
      </div>
      <div class="code-row">
        <span class="line-number">12</span
        ><code> <span class="attribute">rotation</span>: <span class="number">180</span>,</code>
      </div>
      <div class="code-row">
        <span class="line-number">13</span
        ><code> <span class="attribute">duration</span>: <span class="number">2</span></code>
      </div>
      <div class="code-row"><span class="line-number">14</span><code>});</code></div>
    </div>

    <footer class="source-footer">
      <span>{{ state.saved ? 'Source saved in project' : 'Edit the source' }}</span>
      <div class="save-button"><Button size="xs" variant="primary" :icon="Save">Save</Button></div>
    </footer>
  </section>
</template>
<style scoped>
.source-panel {
  width: 338px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.source-header {
  height: 38px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  font-weight: 500;
}
.source-language {
  margin-left: auto;
  font-size: 9px;
  color: var(--text-secondary);
}
.source-body {
  flex: 1;
  padding: 16px 10px 0;
}
.code-row {
  display: flex;
  min-height: 21px;
  align-items: center;
  font:
    12px/21px 'Noto Sans Mono',
    monospace;
  white-space: pre;
}
.line-number {
  width: 24px;
  flex: none;
  padding-right: 10px;
  text-align: right;
  font-size: 9px;
  color: var(--text-secondary);
  user-select: none;
}
code {
  font: inherit;
}
.tag,
.selector {
  color: color-mix(in srgb, var(--color-primary) 65%, var(--text-primary));
}
.attribute {
  color: var(--text-secondary);
}
.string {
  color: var(--text-primary);
}
.number {
  color: var(--color-success);
}
.edited-line.editing {
  background: var(--color-bg-field-active);
  border-radius: var(--radius-xs);
}
.caret {
  display: inline-block;
  width: 1px;
  height: 12px;
  margin-left: 1px;
  vertical-align: -2px;
  background: var(--text-primary);
}
.source-footer {
  height: 42px;
  padding: 0 10px 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-secondary);
  border-top: 1px solid var(--color-border);
}
</style>
