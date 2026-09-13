<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { WebsiteFeature } from '@website/types/website-features';

const props = defineProps<{
  title: string;
  description: string;
  features: readonly WebsiteFeature[];
}>();

const TITLE_PUNCTUATION = /([.!?。！？।]+)/u;
const ONLY_TITLE_PUNCTUATION = /^[.!?。！？।]+$/u;
const titleParts = computed(() =>
  props.title
    .split(TITLE_PUNCTUATION)
    .filter(Boolean)
    .map((text) => ({ text, punctuation: ONLY_TITLE_PUNCTUATION.test(text) })),
);

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
  <section ref="section" class="feature-section" aria-labelledby="feature-section-title">
    <header class="feature-section__intro">
      <h2 id="feature-section-title">
        <span
          v-for="(part, index) in titleParts"
          :key="`${part.text}-${index}`"
          :class="{ 'feature-section__punctuation': part.punctuation }"
          >{{ part.text }}</span
        >
      </h2>
      <p>{{ description }}</p>
    </header>

    <div class="feature-grid">
      <article v-for="feature in features" :key="feature.title" class="feature-card">
        <div
          class="feature-card__media"
          :class="[
            { 'feature-card__media--contained': feature.media.type === 'image' && feature.media.fit === 'contain' },
            feature.media.type === 'image' && feature.media.containShape
              ? `feature-card__media--${feature.media.containShape}`
              : undefined,
            feature.media.type === 'image' && feature.media.backdrop ? 'feature-card__media--product' : undefined,
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
            v-else
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
        </div>
        <h3>{{ feature.title }}</h3>
      </article>
    </div>
  </section>
</template>

<style scoped>
.feature-section {
  padding: clamp(72px, 8vw, 108px) 0;
}

.feature-section__intro {
  display: grid;
  max-width: 720px;
  margin-bottom: clamp(34px, 4vw, 52px);
  gap: 18px;
}

.feature-section__intro h2 {
  margin: 0;
  font-family: var(--font-headline);
  font-size: clamp(38px, 4.5vw, 60px);
  font-weight: 720;
  letter-spacing: -0.045em;
  line-height: 0.98;
}

.feature-section__punctuation {
  display: inline-block;
  margin: 0 0.14em 0 0.08em;
}

.feature-section__intro p {
  max-width: 600px;
  margin: 0;
  color: var(--text-secondary);
  font-size: clamp(17px, 2vw, 20px);
  line-height: 1.55;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(18px, 2vw, 28px);
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
  border: 1px solid var(--color-border-strong);
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
  filter: drop-shadow(0 18px 22px rgb(46 17 13 / 0.28));
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
</style>
