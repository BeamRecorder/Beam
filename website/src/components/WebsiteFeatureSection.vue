<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import WebsiteModeMessage from './WebsiteModeMessage.vue';
import WebsiteModeTabs from './WebsiteModeTabs.vue';
import type { WebsiteFeatureGroups } from '@website/types/website-features';
import type { WebsiteModeId, WebsiteModeOption } from '@website/types/website-modes';

const props = defineProps<{
  eyebrow: string;
  modeNavigation: string;
  modes: readonly WebsiteModeOption[];
  groups: WebsiteFeatureGroups;
}>();

const activeMode = defineModel<WebsiteModeId>('mode', { default: 'studio' });
const activeGroup = computed(() => props.groups[activeMode.value]);
const section = ref<HTMLElement | null>(null);
const videoMediaReady = ref(false);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) {
    videoMediaReady.value = true;
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      videoMediaReady.value = true;
      observer?.disconnect();
      observer = null;
    },
    { rootMargin: '320px 0px' },
  );
  if (section.value) observer.observe(section.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section
    ref="section"
    class="feature-section"
    :class="`feature-section--${activeMode}`"
    aria-labelledby="feature-section-title"
  >
    <header class="feature-section__intro">
      <span class="feature-section__eyebrow">{{ eyebrow }}</span>
      <WebsiteModeTabs v-model="activeMode" class="feature-section__modes" :label="modeNavigation" :modes="modes" />
      <WebsiteModeMessage
        class="feature-section__message"
        :mode="activeMode"
        :title="activeGroup.title"
        :description="activeGroup.description"
        heading-id="feature-section-title"
      />
    </header>

    <Transition name="feature-grid" mode="out-in">
      <div :key="activeMode" class="feature-grid">
        <article v-for="feature in activeGroup.features" :key="feature.title" class="feature-card">
          <div
            class="feature-card__media"
            :class="[
              {
                'feature-card__media--contained': feature.media.type === 'image' && feature.media.fit === 'contain',
                'feature-card__media--product': feature.media.type === 'image' && feature.media.backdrop,
                'feature-card__media--placeholder': feature.media.type === 'placeholder',
              },
              feature.media.type === 'image' && feature.media.containShape
                ? `feature-card__media--${feature.media.containShape}`
                : undefined,
            ]"
          >
            <span
              v-if="feature.media.type === 'image' && feature.media.fit === 'contain'"
              class="feature-card__backdrop"
              :style="{ backgroundImage: `url(${feature.media.backdrop ?? feature.media.src})` }"
              aria-hidden="true"
            />
            <span
              v-if="feature.media.type === 'video'"
              class="feature-card__backdrop feature-card__backdrop--video"
              :style="{ backgroundImage: `url(${feature.media.poster})` }"
              aria-hidden="true"
            />
            <picture v-if="feature.media.type === 'image'">
              <source v-if="feature.media.mobileSrc" media="(max-width: 760px)" :srcset="feature.media.mobileSrc" />
              <img
                :src="feature.media.src"
                :srcset="feature.media.srcset"
                :sizes="feature.media.sizes"
                :width="feature.media.width"
                :height="feature.media.height"
                alt=""
                loading="lazy"
                decoding="async"
              />
            </picture>
            <video
              v-else-if="feature.media.type === 'video'"
              :src="videoMediaReady ? feature.media.src : undefined"
              :poster="feature.media.poster"
              :width="feature.media.width"
              :height="feature.media.height"
              autoplay
              muted
              loop
              playsinline
              preload="none"
              disablepictureinpicture
              aria-hidden="true"
            />
            <div v-else class="feature-card__placeholder" :aria-label="feature.media.label">
              <span aria-hidden="true"><component :is="feature.media.icon" /></span>
            </div>
          </div>
          <h3>{{ feature.title }}</h3>
        </article>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.feature-section {
  padding: clamp(72px, 8vw, 108px) 0;
  --mode-accent: #7557e8;
  --mode-accent-rgb: 117 87 232;
}

.feature-section--instant {
  --mode-accent: #ee5a2a;
  --mode-accent-rgb: 238 90 42;
}

.feature-section--screenshot {
  --mode-accent: #168a65;
  --mode-accent-rgb: 22 138 101;
}

.feature-section__intro {
  display: grid;
  max-width: 900px;
  margin: 0 auto clamp(40px, 5vw, 64px);
  justify-items: center;
  text-align: center;
}

.feature-section__eyebrow {
  display: inline-flex;
  min-height: 30px;
  padding: 0 11px;
  align-items: center;
  border: 1px solid rgb(var(--mode-accent-rgb) / 12%);
  border-radius: 999px;
  background: rgb(var(--mode-accent-rgb) / 9%);
  color: var(--mode-accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.feature-section__modes {
  margin-top: 22px;
}

.feature-section__message {
  --mode-message-heading-margin: clamp(28px, 4vw, 46px) 0 0;
  --mode-message-heading-size: clamp(44px, 6.2vw, 80px);
  --mode-message-heading-width: 900px;
  --mode-message-min-height: 220px;
  --mode-message-description-size: clamp(17px, 2vw, 20px);
  --mode-message-description-width: 680px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(18px, 2vw, 28px);
}

.feature-grid-enter-active,
.feature-grid-leave-active {
  transition:
    opacity 220ms ease,
    transform 260ms ease;
}

.feature-grid-enter-from {
  opacity: 0;
  transform: translateY(14px);
}

.feature-grid-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.feature-card {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 16px;
}

.feature-card__media {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--mode-accent) 15%, var(--color-border-strong));
  border-radius: 22px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-md);
}

.feature-card__media img,
.feature-card__media video {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.feature-card__media picture {
  display: contents;
}

.feature-card__media--contained img {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(72%, 520px);
  height: auto;
  max-height: 84%;
  object-fit: contain;
  transform: translate(-50%, -50%);
}

.feature-card__media--portrait img {
  width: auto;
  height: 105%;
  max-height: none;
  clip-path: inset(5.4% 2.2% 11.3% round var(--radius-md));
  transform: translate(-50%, -47%);
}

.feature-card__media--landscape img {
  width: 94%;
  max-height: none;
}

.feature-card__media--product img {
  border-radius: var(--radius-md);
  filter: drop-shadow(0 18px 22px rgb(46 17 13 / 28%));
}

.feature-card__media video {
  object-fit: contain;
}

.feature-card__backdrop {
  position: absolute;
  inset: -28px;
  background-position: center;
  background-size: cover;
  filter: blur(24px) saturate(0.92);
  opacity: 0.76;
  transform: scale(1.08);
}

.feature-card__backdrop--video {
  filter: blur(30px) saturate(0.78);
  opacity: 0.68;
  transform: scale(1.16);
}

.feature-card__media--product .feature-card__backdrop {
  inset: -10px;
  filter: blur(5px) saturate(0.92);
  opacity: 1;
  transform: scale(1.04);
}

.feature-card__media--placeholder {
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 24% 18%, rgb(255 255 255 / 84%), transparent 32%),
    linear-gradient(
      145deg,
      rgb(var(--mode-accent-rgb) / 8%),
      rgb(var(--mode-accent-rgb) / 18%) 58%,
      rgb(var(--mode-accent-rgb) / 7%)
    );
}

.feature-card__placeholder {
  display: grid;
  width: 45%;
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 62%);
  border-radius: 30%;
  background: rgb(255 255 255 / 54%);
  box-shadow:
    0 30px 55px -28px rgb(var(--mode-accent-rgb) / 55%),
    inset 0 1px rgb(255 255 255 / 80%);
  color: var(--mode-accent);
  transform: rotate(-4deg);
  backdrop-filter: blur(16px);
}

.feature-card__placeholder span {
  display: grid;
  width: 46%;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 28%;
  background: rgb(var(--mode-accent-rgb) / 12%);
}

.feature-card__placeholder svg {
  width: 56%;
  height: 56%;
  stroke-width: 1.8;
}

.feature-card h3 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-headline);
  font-size: clamp(19px, 1.8vw, 24px);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.1;
}

@media (max-width: 1100px) {
  .feature-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .feature-section {
    padding: 72px 0;
  }

  .feature-section__message {
    --mode-message-heading-size: clamp(42px, 13vw, 64px);
    --mode-message-min-height: 250px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .feature-card__media {
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
  }

  .feature-card__media--contained img {
    width: min(72%, 420px);
  }

  .feature-card__media--portrait img {
    width: auto;
    height: 105%;
  }

  .feature-card__media--landscape img {
    width: 94%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feature-grid-enter-active,
  .feature-grid-leave-active {
    transition: none;
  }
}
</style>
