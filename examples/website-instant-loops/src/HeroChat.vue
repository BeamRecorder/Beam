<script setup lang="ts">
import { Hash, Send, FileVideo, Check, Plus } from '@lucide/vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import type { HeroState } from './hero-types';
defineProps<{ state: HeroState }>();
const replies = [
  { name: 'Maya', initial: 'M', text: 'Looks great!' },
  { name: 'Alex', initial: 'A', text: 'That was quick.' },
  { name: 'Sam', initial: 'S', text: 'Ready to share.' },
];
</script>
<template>
  <section class="hero-chat" aria-label="Illustrative team chat">
    <header><Hash :size="18" /><strong>design-team</strong><span>4 members</span></header>
    <div class="thread-viewport">
      <div class="thread" :style="{ transform: `translate3d(0,${-state.chatScroll}px,0)` }">
        <!-- Earlier messages leave through the thread viewport as replies arrive. -->
        <div class="request" :style="{ opacity: Math.max(0, Math.min(1, (60 - state.chatScroll) / 8)) }"><div class="avatar">M</div><div><strong>Maya <time>9:41 AM</time></strong><p>Can you show me the new capture?</p></div></div>
        <div class="sender" :style="{ opacity: state.sent * Math.max(0, Math.min(1, (88 - state.chatScroll) / 10)), transform: `translate3d(0,${(1 - state.sent) * 6}px,0)` }">
          <div class="avatar yours">J</div><strong>You <time>9:42 AM</time></strong>
        </div>
        <div class="attachment" :style="{ opacity: state.attachment, transform: `translate3d(0,${-state.sent}px,0)` }">
          <div class="attachment-space" />
          <footer><FileVideo :size="15" /><strong>Beautiful Captures.mp4</strong><Check v-if="state.sent === 1" :size="13" /></footer>
        </div>
        <div v-for="(reply, index) in replies" :key="reply.name" class="reply" :data-reply="reply.name" :style="{ top: `${325 + 44 * index}px`, opacity: state.replies[index], transform: `translate3d(0,${(1 - state.replies[index]!) * 6}px,0)` }">
          <div class="avatar">{{ reply.initial }}</div><div><strong>{{ reply.name }} <time>9:42 AM</time></strong><p>{{ reply.text }}</p></div>
        </div>
      </div>
    </div>
    <div class="composer"><Plus :size="15" /><span>{{ state.attachment > 0 && state.sent === 0 ? 'Add a message…' : 'Message #design-team' }}</span><kbd v-if="state.chatTime >= 13.65 && state.chatTime < 14.25">⌘ V</kbd><Button size="xs" :icon="Send" icon-only aria-label="Send video" /></div>
  </section>
</template>
<style scoped>
.hero-chat { position: absolute; inset: 0; background: var(--color-bg-app); }
header { display: flex; align-items: center; gap: 8px; height: 47px; border-bottom: 1px solid var(--color-border); padding: 0 24px; }
header strong { font-size: 15px; font-weight: 600; }
header span { margin-left: auto; font-size: 10px; color: var(--text-primary); }
.thread-viewport { position: absolute; top: 47px; bottom: 78px; left: 0; right: 0; overflow: hidden; }
.thread { position: absolute; top: -47px; left: 0; right: 0; }
.request, .reply { position: absolute; left: 24px; display: flex; gap: 10px; }
.request { top: 62px; }
.request > div:last-child, .reply > div:last-child { line-height: 15px; }
.avatar { width: 28px; height: 28px; display: grid; place-items: center; background: var(--color-bg-element); border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); font-size: 12px; }
strong { font-weight: 600; font-size: 11px; }
time { margin-left: 8px; font-size: 9px; color: var(--text-primary); font-weight: 400; }
p { margin: 5px 0 0; font-size: 12px; line-height: 16px; display: flex; align-items: center; gap: 6px; }
.sender { position: absolute; left: 24px; top: 105px; display: flex; gap: 10px; align-items: center; }
.yours { background: var(--color-primary); color: var(--text-on-primary); border-color: var(--color-primary); }
.attachment { position: absolute; top: 130px; left: 62px; width: 260px; border-radius: var(--radius-md); overflow: hidden; }
.attachment-space { height: 162.5px; }
footer { display: flex; align-items: center; gap: 8px; padding: 0 10px; height: 29px; border: 1px solid var(--color-border-strong); border-top: 0; border-radius: 0 0 var(--radius-md) var(--radius-md); background: var(--color-bg-surface); }
footer > svg { color: var(--text-secondary); }
footer > svg:last-child { color: var(--color-success); margin-left: auto; }
footer strong { font-size: 10px; font-weight: 500; }
.composer { position: absolute; left: 24px; right: 24px; bottom: 25px; height: 37px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); display: flex; align-items: center; gap: 10px; padding: 0 7px 0 10px; background: var(--color-bg-field); color: var(--text-primary); }
.composer span { flex: 1; font-size: 11px; }
kbd { font-size: 12px; color: var(--text-primary); font-family: inherit; }
</style>
