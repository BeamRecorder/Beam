<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { FileVideo, Send, Plus, Hash, Users, Play, Check } from '@lucide/vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import QuickSnipStatus from '../../../apps/desktop/src/components/quick-snip/QuickSnipStatus.vue';
import Preview from './Preview.vue';
import DemoCursor from './DemoCursor.vue';
import { clipboardState, contentOpacity } from './motion';
import { publishExport } from './demo-capture';
import { mascotClock } from './mascot-clock';
import type { Pose } from './demo-types';
const props = defineProps<{ pose: Pose }>();
const state = computed(() => clipboardState(props.pose.time));
const preview = ref<InstanceType<typeof Preview> | null>(null);
let thumbnail = '';
async function synchronize() {
  mascotClock.value = 1.3;
  publishExport(4.5, thumbnail, true, 1, true);
  await nextTick();
  preview.value?.paint();
}
const ready = (async () => {
  await nextTick();
  await preview.value!.ready;
  thumbnail = preview.value!.thumbnail();
  await synchronize();
})();
const attachmentStyle = computed(() => ({
  opacity: state.value.attachmentReveal,
  transform: `translate3d(0,${(1 - state.value.sendReveal) * 68 + (1 - state.value.attachmentReveal) * 8}px,0) scale(${0.98 + 0.02 * state.value.attachmentReveal})`,
}));
defineExpose({ ready, synchronize });
</script>
<template>
  <div
    class="world"
    :style="{ opacity: contentOpacity(pose.time) }"
    :data-phase="state.sent ? 'sent' : state.pasted ? 'pasted' : 'copied'"
  >
    <section class="product-card chat" aria-label="Illustrative team chat">
      <header class="chat-header">
        <Hash :size="17" /><strong>design-team</strong>
        <div class="channel-members"><Users :size="14" /><span>3</span></div>
      </header>
      <div class="message request">
        <div class="avatar maya">M</div>
        <div>
          <div class="message-meta"><strong>Maya</strong><time>9:41 AM</time></div>
          <p>How’s the new capture looking?</p>
        </div>
      </div>
      <div class="message sender" :style="{ opacity: state.sendReveal }">
        <div class="avatar you">J</div>
        <div class="message-meta"><strong>You</strong><time>9:42 AM</time><Check :size="12" /></div>
      </div>
      <div class="attached-file" :style="attachmentStyle" :data-sent="state.sent">
        <div class="video-art">
          <Preview ref="preview" preset="nocturne" :time="state.sourceTime" />
          <div class="play-button"><Play :size="13" fill="currentColor" /></div>
          <span class="duration">0:08</span>
        </div>
        <div class="file-meta"><FileVideo :size="14" /><strong>Beautiful Captures.mp4</strong><span>MP4</span></div>
      </div>
      <div v-if="state.typing" class="typing">
        <span></span><span></span><span></span><span class="typing-label">Alex is typing</span>
      </div>
      <div
        class="message reply alex-reply"
        :style="{ opacity: state.firstReply, transform: `translate3d(0,${(1 - state.firstReply) * 8}px,0)` }"
      >
        <div class="avatar alex">A</div>
        <div>
          <div class="message-meta"><strong>Alex</strong><time>9:42 AM</time></div>
          <p>That looks so clean.</p>
        </div>
      </div>
      <div
        class="message reply maya-reply"
        :style="{ opacity: state.secondReply, transform: `translate3d(0,${(1 - state.secondReply) * 8}px,0)` }"
      >
        <div class="avatar maya">M</div>
        <div>
          <div class="message-meta"><strong>Maya</strong><time>9:42 AM</time></div>
          <p>Perfect. Let’s use this.</p>
        </div>
      </div>
      <div class="composer" :class="{ 'has-attachment': state.pasted && !state.sent }">
        <Plus :size="16" /><span>Message #design-team</span><kbd v-if="state.pasteHint">⌘ V</kbd
        ><Button size="xs" :icon="Send" icon-only aria-label="Send video" :disabled="!state.pasted || state.sent" />
      </div>
    </section>
    <div class="clipboard-status" :style="{ opacity: state.statusOpacity }"><QuickSnipStatus /></div>
  </div>
  <DemoCursor mode="clipboard" :time="pose.time" />
</template>
<style scoped>
.chat {
  top: 22px;
  height: 356px;
}
.chat-header {
  height: 41px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 17px;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
}
.chat-header strong {
  font-weight: 600;
}
.channel-members {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--text-muted);
  font-size: 10px;
}
.message {
  position: absolute;
  left: 18px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.request {
  top: 55px;
}
.sender {
  top: 94px;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
}
.maya {
  color: var(--text-primary);
  background: var(--color-bg-element);
  border: 1px solid var(--color-border-strong);
}
.you {
  color: var(--text-light);
  background: var(--color-primary);
}
.alex {
  color: var(--color-success);
  background: var(--color-bg-element);
  border: 1px solid var(--color-border-strong);
}
.message-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  height: 14px;
}
.message-meta strong {
  font-weight: 600;
}
.message-meta time {
  font-size: 8px;
  color: var(--text-muted);
}
.message-meta > svg {
  color: var(--text-muted);
}
p {
  font-size: 12px;
  margin: 3px 0 0;
  line-height: 16px;
}
.attached-file {
  position: absolute;
  left: 56px;
  top: 112px;
  width: 208px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-bg-surface);
  transform-origin: bottom left;
}
.video-art {
  position: relative;
  height: 90px;
}
.play-button {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding-left: 2px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: var(--color-bg-app);
  color: var(--text-primary);
}
.duration {
  position: absolute;
  right: 7px;
  bottom: 7px;
  background: var(--color-bg-app);
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}
.file-meta {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border-top: 1px solid var(--color-border);
}
.file-meta strong {
  font-size: 9px;
  font-weight: 500;
}
.file-meta > span {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 8px;
}
.file-meta > svg {
  color: var(--text-secondary);
}
.alex-reply {
  top: 237px;
}
.maya-reply {
  top: 272px;
}
.composer {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 12px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 0 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface);
  color: var(--text-muted);
}
.composer > span {
  font-size: 11px;
  flex: 1;
}
.composer.has-attachment {
  border-color: var(--color-primary);
}
kbd {
  font-family: inherit;
  font-size: 11px;
  color: var(--text-primary);
}
.clipboard-status {
  position: absolute;
  right: 15px;
  bottom: 12px;
  width: 380px;
  height: 184px;
  z-index: 20;
  pointer-events: none;
  transform: translateZ(0);
}
.typing {
  position: absolute;
  left: 56px;
  top: 265px;
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--text-muted);
}
.typing > span:not(.typing-label) {
  width: 3px;
  height: 3px;
  border-radius: var(--radius-full);
  background: currentColor;
}
.typing-label {
  margin-left: 4px;
  font-size: 9px;
}
</style>
