<script setup lang="ts">
import { Check, ClipboardCheck, FileVideo2, SlidersHorizontal, Sparkles } from '@lucide/vue';
import WebsiteScreenshotMockup from './WebsiteScreenshotMockup.vue';
import type { WebsiteModeSpotlightContent } from '@website/types/website-modes';

defineProps<{ content: WebsiteModeSpotlightContent }>();
</script>

<template>
  <section
    :id="content.id"
    class="mode-spotlight"
    :class="[`mode-spotlight--${content.tone}`, { 'mode-spotlight--reverse': content.reverse }]"
    :aria-labelledby="`${content.id}-title`"
  >
    <div class="mode-spotlight__media">
      <div v-if="content.media === 'instant'" class="instant-demo" role="img" aria-label="Beam Instant workflow">
        <span class="instant-demo__glow" aria-hidden="true" />
        <div class="instant-demo__window">
          <div class="instant-demo__titlebar"><i /><i /><i /><strong>Beam</strong></div>
          <div class="instant-demo__modes">
            <span>Studio</span><span>Screenshot</span><span class="is-active">Instant</span>
          </div>
          <div class="instant-demo__source">
            <img src="/features/recorder.webp" alt="" width="320" height="480" loading="lazy" decoding="async" />
            <div class="instant-demo__settings">
              <span><SlidersHorizontal aria-hidden="true" />Product demo preset</span>
              <span><FileVideo2 aria-hidden="true" />MP4 · 1080p</span>
              <strong>Record and export</strong>
            </div>
          </div>
        </div>
        <div class="instant-demo__status">
          <ClipboardCheck aria-hidden="true" />
          <span><strong>Video copied</strong>Ready to paste anywhere</span>
          <Check aria-hidden="true" />
        </div>
      </div>

      <div v-else-if="content.media === 'studio'" class="studio-demo">
        <video autoplay muted loop playsinline preload="metadata" aria-label="Beam Studio editor demo">
          <source src="/website-demo.webm" type="video/webm" />
        </video>
        <span class="studio-demo__badge"><Sparkles aria-hidden="true" />Editable project</span>
      </div>

      <WebsiteScreenshotMockup v-else />
    </div>

    <div class="mode-spotlight__copy">
      <span class="section-eyebrow">{{ content.eyebrow }}</span>
      <h2 :id="`${content.id}-title`">{{ content.title }}</h2>
      <p>{{ content.description }}</p>
      <ul>
        <li v-for="feature in content.features" :key="feature.title">
          <span><Check aria-hidden="true" /></span>
          <div>
            <strong>{{ feature.title }}</strong
            ><small>{{ feature.text }}</small>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.mode-spotlight {
  --mode-accent: #4c9deb;
  --mode-soft: rgb(76 157 235 / 12%);
  display: grid;
  min-height: 660px;
  padding: clamp(76px, 9vw, 126px) 0;
  grid-template-columns: minmax(0, 1.08fr) minmax(330px, 0.72fr);
  align-items: center;
  gap: clamp(52px, 8vw, 112px);
  border-top: 1px solid var(--color-border);
}

.mode-spotlight--violet {
  --mode-accent: #8b5cf6;
  --mode-soft: rgb(139 92 246 / 12%);
}

.mode-spotlight--green {
  --mode-accent: #2e9b71;
  --mode-soft: rgb(46 155 113 / 12%);
}

.mode-spotlight--reverse .mode-spotlight__media {
  order: 2;
}

.mode-spotlight__media {
  position: relative;
  min-width: 0;
}

.mode-spotlight__copy {
  display: grid;
  align-content: center;
  gap: 20px;
}

.mode-spotlight__copy h2 {
  max-width: 620px;
  font-size: clamp(38px, 5vw, 66px);
  font-weight: 680;
  line-height: 0.98;
}

.mode-spotlight__copy > p {
  max-width: 580px;
  color: var(--text-secondary);
  font-size: clamp(17px, 1.8vw, 20px);
  line-height: 1.6;
}

.mode-spotlight__copy ul {
  display: grid;
  margin: 12px 0 0;
  padding: 0;
  gap: 0;
  list-style: none;
}

.mode-spotlight__copy li {
  display: grid;
  padding: 17px 0;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  border-top: 1px solid var(--color-border);
}

.mode-spotlight__copy li > span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 9px;
  background: var(--mode-soft);
  color: var(--mode-accent);
}

.mode-spotlight__copy li svg {
  width: 16px;
  height: 16px;
  stroke-width: 2.8;
}

.mode-spotlight__copy li div {
  display: grid;
  gap: 4px;
}

.mode-spotlight__copy li strong {
  font-size: 15px;
}

.mode-spotlight__copy li small {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.instant-demo,
.studio-demo {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: clamp(420px, 45vw, 570px);
  padding: clamp(24px, 4vw, 54px);
  border: 1px solid var(--color-border);
  border-radius: 28px;
  background:
    radial-gradient(circle at 16% 4%, rgb(255 255 255 / 72%), transparent 34%),
    linear-gradient(145deg, #dff0ff, #c8ddf7 48%, #bad1ef);
  box-shadow: var(--shadow-lg);
}

.instant-demo__glow {
  position: absolute;
  inset: 20% -8% -8% 18%;
  z-index: -1;
  border-radius: 50%;
  background: rgb(255 255 255 / 48%);
  filter: blur(38px);
}

.instant-demo__window {
  position: relative;
  overflow: hidden;
  width: min(84%, 420px);
  margin: 0 auto;
  border: 1px solid rgb(30 36 44 / 13%);
  border-radius: 18px;
  background: #f8f6f2;
  box-shadow: 0 30px 55px -30px rgb(24 42 68 / 52%);
}

.instant-demo__titlebar {
  display: flex;
  height: 42px;
  padding: 0 14px;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid rgb(30 36 44 / 8%);
  background: rgb(255 255 255 / 82%);
}

.instant-demo__titlebar i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d6d1c8;
}

.instant-demo__titlebar strong {
  margin-left: 6px;
  font-size: 13px;
}

.instant-demo__modes {
  display: grid;
  margin: 14px;
  padding: 4px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-radius: 10px;
  background: #eae6df;
  color: #716b63;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.instant-demo__modes span {
  padding: 7px 4px;
  border-radius: 7px;
}

.instant-demo__modes .is-active {
  background: white;
  box-shadow: 0 2px 7px rgb(32 28 23 / 10%);
  color: #2d2924;
}

.instant-demo__source {
  display: grid;
  padding: 0 14px 16px;
  grid-template-columns: 0.75fr 1.25fr;
  align-items: center;
  gap: 14px;
}

.instant-demo__source img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 11px;
  filter: drop-shadow(0 10px 14px rgb(40 31 25 / 18%));
}

.instant-demo__settings {
  display: grid;
  align-content: center;
  gap: 8px;
}

.instant-demo__settings span,
.instant-demo__settings strong {
  display: flex;
  min-height: 36px;
  padding: 0 11px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgb(30 36 44 / 9%);
  border-radius: 9px;
  background: white;
  font-size: 11px;
}

.instant-demo__settings svg {
  width: 15px;
}

.instant-demo__settings strong {
  justify-content: center;
  border-color: #ff5a1f;
  background: #ff5a1f;
  color: white;
}

.instant-demo__status {
  position: absolute;
  right: clamp(12px, 3vw, 34px);
  bottom: clamp(18px, 4vw, 46px);
  display: grid;
  min-width: min(330px, 72%);
  padding: 12px 14px;
  grid-template-columns: 34px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgb(255 255 255 / 50%);
  border-radius: 15px;
  background: rgb(20 25 31 / 92%);
  box-shadow: 0 24px 50px -22px rgb(8 14 24 / 72%);
  color: white;
  backdrop-filter: blur(14px);
}

.instant-demo__status > svg:first-child {
  padding: 7px;
  border-radius: 9px;
  background: rgb(76 157 235 / 24%);
  color: #7bc0ff;
}

.instant-demo__status > svg:last-child {
  color: #68d69e;
}

.instant-demo__status span {
  display: grid;
  gap: 2px;
  font-size: 11px;
  opacity: 0.78;
}

.instant-demo__status strong {
  font-size: 13px;
  opacity: 1;
}

.studio-demo {
  display: grid;
  padding: clamp(20px, 3vw, 38px);
  place-items: center;
  background: linear-gradient(145deg, #eee6ff, #dcccf8 52%, #cab7ec);
}

.studio-demo video {
  display: block;
  width: 100%;
  border: 1px solid rgb(47 30 78 / 14%);
  border-radius: 17px;
  box-shadow: 0 30px 58px -30px rgb(52 25 96 / 55%);
}

.studio-demo__badge {
  position: absolute;
  right: clamp(10px, 2vw, 28px);
  bottom: clamp(14px, 3vw, 36px);
  display: inline-flex;
  min-height: 38px;
  padding: 0 13px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgb(255 255 255 / 55%);
  border-radius: 11px;
  background: rgb(32 21 50 / 88%);
  box-shadow: var(--shadow-md);
  color: white;
  font-size: 12px;
  font-weight: 720;
  backdrop-filter: blur(12px);
}

.studio-demo__badge svg {
  width: 16px;
  color: #d5baff;
}

@media (max-width: 980px) {
  .mode-spotlight {
    min-height: 0;
    grid-template-columns: 1fr;
  }

  .mode-spotlight--reverse .mode-spotlight__media {
    order: 0;
  }
}

@media (max-width: 620px) {
  .mode-spotlight {
    padding: 72px 0;
  }

  .instant-demo,
  .studio-demo {
    min-height: 370px;
    border-radius: 22px;
  }

  .instant-demo__window {
    width: 100%;
  }

  .instant-demo__source {
    grid-template-columns: 0.85fr 1.15fr;
  }
}
</style>
