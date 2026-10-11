<script setup lang="ts">
import { Folder, FileJson, Film, ChevronRight, ChevronLeft, Search, X, Minus, Square } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
defineProps<{ progress: number; selected: boolean }>();
</script>
<template>
  <section
    class="folder-window native-window"
    :style="{
      opacity: progress,
      transform: `translateY(${(1 - progress) * 24}px) scale(${0.97 + progress * 0.03})`,
      pointerEvents: progress ? 'auto' : 'none',
    }"
    aria-label="Project folder"
  >
    <header class="folder-title">
      <Folder :size="18" /><strong>website-demo</strong><span /><Minus :size="14" /><Square :size="12" /><X
        :size="15"
      />
    </header>
    <nav class="folder-path">
      <ChevronLeft :size="18" /><ChevronRight :size="18" />
      <div>Beam<ChevronRight :size="14" />Projects<ChevronRight :size="14" />website-demo</div>
      <Search :size="18" />
    </nav>
    <div class="folder-body">
      <aside>
        <span>Home</span><span>Desktop</span><span>Documents</span><span>Downloads</span
        ><span class="active"><Folder :size="16" />Beam</span>
      </aside>
      <main>
        <div class="file-row file-heading"><span>Name</span><span>Type</span></div>
        <div class="file-row"><Folder :size="22" /><span>media</span><small>Folder</small></div>
        <div class="file-row"><FileJson :size="22" /><span>project.json</span><small>Project document</small></div>
        <div class="file-row"><Folder :size="22" /><span>session-01a01b34…</span><small>Recording session</small></div>
        <div class="file-row nested"><Folder :size="22" /><span>cursor</span><small>Cursor data</small></div>
        <div class="file-row nested"><Folder :size="22" /><span>screen</span><small>Folder</small></div>
        <div class="source-row">
          <Button
            block
            variant="ghost"
            align="start"
            content-layout="custom"
            aria-label="Original recording"
            :style="{
              height: '46px',
              width: '100%',
              padding: '0 14px 0 72px',
              borderRadius: '6px',
              background: selected ? 'var(--color-primary-light)' : 'transparent',
              color: selected ? 'var(--color-primary)' : 'var(--text-primary)',
            }"
            ><span class="source-content"
              ><Film :size="22" /><span>segment-0001.mp4</span><small>Original recording</small></span
            ></Button
          >
        </div>
      </main>
    </div>
    <footer>Local project · Original recording and cursor data</footer>
  </section>
</template>
<style scoped>
.folder-window {
  position: absolute;
  left: 255px;
  top: 175px;
  width: 770px;
  height: 450px;
  transform-origin: 50% 45%;
}
.folder-title {
  height: 46px;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
}
.folder-title span {
  flex: 1;
}
.folder-title strong {
  font-weight: 600;
  margin-left: -10px;
}
.folder-path {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 52px;
  padding: 0 18px;
  border-bottom: 1px solid var(--color-border);
  color: var(--text-secondary);
}
.folder-path div {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  padding: 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.folder-body {
  height: 313px;
  display: flex;
}
aside {
  width: 165px;
  padding: 12px;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
  color: var(--text-secondary);
}
aside span {
  height: 35px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
aside .active {
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: 6px;
}
main {
  flex: 1;
  padding: 0 10px;
  min-width: 0;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 13px;
  height: 42px;
  padding: 0 14px;
  font-size: 13px;
}
.file-row span {
  flex: 1;
}
.file-row small {
  width: 145px;
  color: var(--text-muted);
  font-size: 11px;
}
.file-row svg {
  color: var(--color-primary);
  flex-shrink: 0;
}
.file-heading {
  height: 34px;
  color: var(--text-muted);
  font-size: 11px;
  border-bottom: 1px solid var(--color-border);
}
.file-heading span:last-child {
  flex: none;
  width: 145px;
}
.nested {
  padding-left: 42px;
}
.source-row {
  height: 46px;
  width: 100%;
}
.source-content {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 13px;
  font-size: 13px;
  font-weight: 400;
}
.source-content span {
  flex: 1;
}
.source-content small {
  width: 145px;
  color: var(--text-muted);
  font-size: 11px;
}
.source-content svg {
  flex-shrink: 0;
}
footer {
  height: 38px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  border-top: 1px solid var(--color-border);
  color: var(--text-muted);
  font-size: 11px;
}
</style>
