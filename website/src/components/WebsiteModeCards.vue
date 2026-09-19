<script setup lang="ts">
import { ArrowRight } from '@lucide/vue';
import type { WebsiteModeSummary } from '@website/types/website-modes';

defineProps<{
  eyebrow: string;
  title: string;
  description: string;
  modes: readonly WebsiteModeSummary[];
}>();
</script>

<template>
  <section id="modes" class="mode-overview" aria-labelledby="modes-title">
    <header class="mode-overview__intro">
      <span class="section-eyebrow">{{ eyebrow }}</span>
      <h2 id="modes-title">{{ title }}</h2>
      <p>{{ description }}</p>
    </header>

    <div class="mode-overview__grid">
      <a
        v-for="mode in modes"
        :key="mode.id"
        class="mode-card"
        :class="`mode-card--${mode.tone}`"
        :href="`#${mode.id}`"
      >
        <span class="mode-card__label"><component :is="mode.icon" aria-hidden="true" />{{ mode.label }}</span>
        <h3>{{ mode.title }}</h3>
        <p>{{ mode.description }}</p>
        <ol>
          <li v-for="(step, index) in mode.steps" :key="step">
            <span>{{ index + 1 }}</span
            >{{ step }}
          </li>
        </ol>
        <span class="mode-card__best"><strong>Best for</strong>{{ mode.bestFor }}</span>
        <span class="mode-card__action">Explore {{ mode.label }} <ArrowRight aria-hidden="true" /></span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.mode-overview {
  padding: clamp(84px, 10vw, 132px) 0 48px;
}

.mode-overview__intro {
  display: grid;
  max-width: 780px;
  margin: 0 auto clamp(40px, 6vw, 68px);
  justify-items: center;
  gap: 18px;
  text-align: center;
}

.mode-overview h2 {
  font-size: clamp(42px, 6vw, 76px);
  font-weight: 680;
  line-height: 0.98;
}

.mode-overview__intro p {
  max-width: 640px;
  color: var(--text-secondary);
  font-size: clamp(17px, 2vw, 20px);
  line-height: 1.6;
}

.mode-overview__grid {
  display: grid;
  padding: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  border: 1px solid var(--color-border);
  border-radius: 30px;
  background: color-mix(in srgb, var(--color-bg-surface) 72%, transparent);
}

.mode-card {
  --mode-accent: #4c9deb;
  --mode-soft: rgb(76 157 235 / 12%);
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 430px;
  padding: clamp(24px, 2.6vw, 34px);
  border: 1px solid var(--color-border);
  border-radius: 21px;
  background: var(--color-bg-element);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  flex-direction: column;
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.mode-card--violet {
  --mode-accent: #8b5cf6;
  --mode-soft: rgb(139 92 246 / 12%);
}

.mode-card--green {
  --mode-accent: #2e9b71;
  --mode-soft: rgb(46 155 113 / 12%);
}

.mode-card:hover {
  border-color: color-mix(in srgb, var(--mode-accent) 46%, var(--color-border));
  box-shadow: var(--shadow-md);
  transform: translateY(-4px);
}

.mode-card__label {
  display: inline-flex;
  width: fit-content;
  min-height: 36px;
  padding: 0 12px;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  background: var(--mode-soft);
  color: var(--mode-accent);
  font-size: 14px;
  font-weight: 740;
}

.mode-card__label svg,
.mode-card__action svg {
  width: 17px;
  height: 17px;
}

.mode-card h3 {
  margin: 24px 0 0;
  font-family: var(--font-headline);
  font-size: clamp(25px, 2.3vw, 34px);
  font-weight: 680;
  letter-spacing: -0.035em;
  line-height: 1.05;
}

.mode-card > p {
  margin-top: 14px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.mode-card ol {
  display: grid;
  margin: 24px 0;
  padding: 0;
  gap: 13px;
  list-style: none;
}

.mode-card li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.45;
}

.mode-card li > span {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  background: var(--mode-soft);
  color: var(--mode-accent);
  font-size: 12px;
  font-weight: 780;
}

.mode-card__best {
  display: grid;
  margin-top: auto;
  padding-top: 20px;
  gap: 5px;
  border-top: 1px solid var(--color-border);
  color: var(--text-secondary);
  font-size: 13px;
}

.mode-card__best strong {
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mode-card__action {
  display: inline-flex;
  margin-top: 20px;
  align-items: center;
  gap: 7px;
  color: var(--mode-accent);
  font-size: 13px;
  font-weight: 720;
}

.mode-card__action svg {
  transition: transform 160ms ease;
}

.mode-card:hover .mode-card__action svg {
  transform: translateX(3px);
}

@media (max-width: 980px) {
  .mode-overview__grid {
    grid-template-columns: 1fr;
  }

  .mode-card {
    min-height: 0;
  }
}

@media (max-width: 620px) {
  .mode-overview__grid {
    padding: 8px;
    border-radius: 24px;
  }

  .mode-card {
    padding: 24px;
  }
}
</style>
