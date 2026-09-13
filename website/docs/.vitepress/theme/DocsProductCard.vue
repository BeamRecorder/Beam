<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight } from '@lucide/vue';
import { withBase } from 'vitepress';

const props = defineProps<{
  title: string;
  details: string;
  link: string;
  visual: 'recorder' | 'editor';
}>();

const href = computed(() => withBase(props.link));
const backdropUrl = withBase('/showcase/amber-800.webp');
const screenshot = computed(() => {
  const visual =
    props.visual === 'recorder'
      ? {
          src: '/showcase/Beam-showcase-hud-160.webp',
          sources: [
            ['/showcase/Beam-showcase-hud-160.webp', 160],
            ['/showcase/Beam-showcase-hud-280.webp', 280],
            ['/showcase/Beam-showcase-hud-320.webp', 320],
          ] as const,
          sizes: '160px',
          width: 160,
          height: 240,
        }
      : {
          src: '/showcase/Beam-showcase-editor-400.webp',
          sources: [
            ['/showcase/Beam-showcase-editor-400.webp', 400],
            ['/showcase/Beam-showcase-editor-500.webp', 500],
            ['/showcase/Beam-showcase-editor-576.webp', 576],
            ['/showcase/Beam-showcase-editor-600.webp', 600],
            ['/showcase/Beam-showcase-editor-800.webp', 800],
          ] as const,
          sizes: '(max-width: 720px) calc(90vw - 44px), 326px',
          width: 400,
          height: 250,
        };

  return {
    ...visual,
    src: withBase(visual.src),
    srcset: visual.sources.map(([path, width]) => `${withBase(path)} ${width}w`).join(', '),
  };
});
</script>

<template>
  <a class="docs-product-card" :href="href">
    <span class="docs-product-card__copy">
      <strong>{{ title }}</strong>
      <span>{{ details }}</span>
      <span class="docs-product-card__action">Explore {{ title }} <ArrowRight aria-hidden="true" /></span>
    </span>
    <span
      class="docs-product-card__visual"
      :class="`is-${visual}`"
      role="img"
      :aria-label="`${title} interface in Beam`"
    >
      <span
        aria-hidden="true"
        class="docs-product-card__backdrop"
        :style="{ backgroundImage: `url(${backdropUrl})` }"
      />
      <img
        aria-hidden="true"
        class="docs-product-card__screenshot"
        :src="screenshot.src"
        :srcset="screenshot.srcset"
        :sizes="screenshot.sizes"
        :width="screenshot.width"
        :height="screenshot.height"
        alt=""
        loading="lazy"
        decoding="async"
        fetchpriority="low"
      />
    </span>
  </a>
</template>

<style scoped>
.docs-product-card {
  display: grid;
  overflow: hidden;
  min-height: 236px;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  text-decoration: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.docs-product-card:hover {
  border-color: var(--color-primary-border);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.docs-product-card__copy {
  display: flex;
  min-width: 0;
  padding: 28px 18px 26px 28px;
  flex-direction: column;
  align-items: flex-start;
}

.docs-product-card__copy > strong {
  font-family: var(--font-headline);
  font-size: 23px;
  font-weight: 740;
  letter-spacing: -0.025em;
}

.docs-product-card__copy > span:nth-child(2) {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.docs-product-card__action {
  display: inline-flex;
  margin-top: auto;
  padding-top: 18px;
  align-items: center;
  gap: 7px;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 720;
}

.docs-product-card__action svg {
  width: 15px;
  height: 15px;
  transition: transform 160ms ease;
}

.docs-product-card:hover .docs-product-card__action svg {
  transform: translateX(2px);
}

.docs-product-card__visual {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-width: 0;
  border-left: 1px solid var(--color-border);
  background-color: var(--color-bg-surface);
}

.docs-product-card__backdrop {
  position: absolute;
  z-index: -1;
  inset: -10px;
  background-position: center;
  background-size: cover;
  filter: blur(5px) saturate(0.92);
  transform: scale(1.04);
}

.docs-product-card__screenshot {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  max-width: none;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 18px 22px rgb(46 17 13 / 0.28));
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.docs-product-card__visual.is-recorder .docs-product-card__screenshot {
  width: auto;
  height: 105%;
  clip-path: inset(5.4% 2.2% 11.3% round var(--radius-md));
  transform: translate(-50%, -47%);
}

.docs-product-card__visual.is-editor .docs-product-card__screenshot {
  width: 94%;
  height: auto;
}

.docs-product-card:hover .docs-product-card__screenshot {
  transform: translate(-50%, calc(-50% - 3px)) scale(1.01);
}

.docs-product-card:hover .docs-product-card__visual.is-recorder .docs-product-card__screenshot {
  transform: translate(-50%, calc(-47% - 3px)) scale(1.01);
}

@media (max-width: 720px) {
  .docs-product-card {
    min-height: 380px;
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(210px, 1fr);
  }

  .docs-product-card__copy {
    padding: 24px;
  }

  .docs-product-card__visual {
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }

  .docs-product-card__visual.is-editor .docs-product-card__screenshot {
    width: 90%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .docs-product-card,
  .docs-product-card__action svg,
  .docs-product-card__screenshot {
    transition: none;
  }
}
</style>
