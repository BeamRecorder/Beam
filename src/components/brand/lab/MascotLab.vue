<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  CodeXml,
  Download,
  Ellipsis,
  Eye,
  FlaskConical,
  Grid2X2,
  Heart,
  Hexagon,
  Info,
  Loader,
  Moon,
  MousePointer2,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Triangle,
  Zap,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Switch from '~/ui/switch/Switch.vue';
import Select from '~/ui/select/Select.vue';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import BeamySvg from '../Beamy/BeamySvg.vue';
import MascotAppearance from './MascotAppearance.vue';
import MascotTimeline from './MascotTimeline.vue';
import { createMascotEngine, STATE_LABELS } from './mascot-catalog';
import { SEQUENCE } from '../Beamy/engine/states';
import { defaultPreset, parsePreset, PRESET_KEY } from './mascot-storage';
import { downloadBlob, mascotPng, serializeMascot } from './mascot-export';
import { useMascotPlayer } from './useMascotPlayer';
import type { PreviewSurface } from './mascot-types';

defineProps<{ embedded?: boolean }>();
const status = ref('');
let preset = defaultPreset();
try {
  const saved = localStorage.getItem(PRESET_KEY);
  if (saved) preset = parsePreset(saved);
} catch {
  status.value = 'Le look enregistré n’a pas pu être relu. Les réglages par défaut sont affichés.';
}
const look = ref(preset.look);
const steps = ref(preset.timeline);
const surface = ref<PreviewSurface>('paper');
const board = ref(false);
const stage = ref<HTMLElement | null>(null);
const file = ref<HTMLInputElement | null>(null);
const exporting = ref(false);
const {
  frame,
  playing,
  sequencing,
  state,
  speed,
  follow,
  elapsed,
  activeStep,
  reducedMotion,
  choose,
  seek,
  aim,
  release,
} = useMascotPlayer(look, steps);
const stateIcons = [
  Heart,
  Ellipsis,
  Eye,
  Sparkles,
  Info,
  CircleCheck,
  Zap,
  Moon,
  Circle,
  Hexagon,
  Triangle,
  Orbit,
  Star,
  Loader,
];
const statePreviews = computed(() =>
  SEQUENCE.map((id) => ({ id, frame: createMascotEngine(look.value, id).sample(1.2) })),
);
const speedOptions = [
  { value: 0.25, label: '0,25×' },
  { value: 0.5, label: '0,5×' },
  { value: 1, label: '1×' },
  { value: 1.5, label: '1,5×' },
  { value: 2, label: '2×' },
];
const packedPreset = () => ({ version: 1, look: look.value, timeline: steps.value });
watch(
  [look, steps],
  () => {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(packedPreset()));
    } catch {
      status.value = 'Le navigateur ne permet pas de sauvegarder. Tu peux exporter tes réglages en JSON.';
    }
  },
  { deep: true },
);

const pointerMove = (event: PointerEvent) => {
  if (stage.value && !board.value) aim(event, stage.value.getBoundingClientRect());
};
const nextState = (direction: number) => {
  const index = SEQUENCE.indexOf(state.value);
  choose(SEQUENCE[(index + direction + SEQUENCE.length) % SEQUENCE.length]!);
};
const playSequence = () => {
  seek(0);
  playing.value = true;
  board.value = false;
};
const exportImage = async (format: 'svg' | 'png') => {
  const svg = stage.value?.querySelector<SVGSVGElement>('[data-mascot-preview] svg');
  if (!svg) return;
  exporting.value = true;
  try {
    const text = serializeMascot(svg);
    const blob = format === 'svg' ? new Blob([text], { type: 'image/svg+xml' }) : await mascotPng(text);
    downloadBlob(blob, `beam-mascot-${state.value}.${format}`);
    status.value = `${format.toUpperCase()} exporté avec un fond transparent.`;
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'L’export a échoué.';
  } finally {
    exporting.value = false;
  }
};
const exportPreset = () => {
  downloadBlob(new Blob([JSON.stringify(packedPreset(), null, 2)], { type: 'application/json' }), 'beam-mascot.json');
  status.value = 'Look et chorégraphie exportés.';
};
const importPreset = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const selected = input.files?.[0];
  if (!selected) return;
  try {
    if (selected.size > 65536) throw new Error('Ce fichier est trop volumineux pour un réglage de mascotte.');
    const imported = parsePreset(await selected.text());
    look.value = imported.look;
    steps.value = imported.timeline;
    choose('idle');
    status.value = 'Look et chorégraphie importés.';
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Impossible de lire ce fichier.';
  } finally {
    input.value = '';
  }
};
const reset = () => {
  const defaults = defaultPreset();
  look.value = defaults.look;
  steps.value = defaults.timeline;
  choose('idle');
  status.value = 'Le petit look de départ est de retour.';
};
const keyboard = (event: KeyboardEvent) => {
  if (
    event.code !== 'Space' ||
    (event.target instanceof HTMLElement &&
      event.target.closest('button, a, input, select, textarea, [role="listbox"]'))
  )
    return;
  event.preventDefault();
  playing.value = !playing.value;
};
watch(board, (value) => {
  if (value) playing.value = false;
});
onMounted(() => window.addEventListener('keydown', keyboard));
onBeforeUnmount(() => window.removeEventListener('keydown', keyboard));
</script>

<template>
  <main class="mascot-lab">
    <header class="topbar">
      <a class="brand" :href="embedded ? undefined : './mascot.html'" aria-label="Beam Mascot Lab"
        ><img :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')" alt="" /><span
          >beam<span class="brand-dot">.</span></span
        ></a
      >
      <span class="header-divider" /><span class="lab-tag"><FlaskConical :size="14" /> Mascot Lab</span>
      <div class="header-actions">
        <span class="experiment-tag"><span /> Un petit terrain de jeu</span
        ><Button
          variant="secondary"
          size="sm"
          :icon="CodeXml"
          href="https://github.com/jeremy-prt/bloub"
          target="_blank"
          rel="noreferrer"
          >Inspiré de Bloub</Button
        >
      </div>
    </header>

    <div class="lab-content">
      <header class="intro">
        <div>
          <span class="eyebrow"><Sparkles :size="13" /> LE LABORATOIRE DE BEAMY</span>
          <h1>Un petit compagnon.<br /><span>Plein de personnalité.</span></h1>
          <p>Donne-lui une forme, des étoiles dans les yeux et quelques petits mouvements.</p>
        </div>
        <div class="intro-actions">
          <Button variant="ghost" size="sm" :icon="RotateCcw" @click="reset">Repartir de zéro</Button
          ><Button variant="secondary" size="sm" :icon="Download" @click="exportPreset">Exporter le look</Button>
        </div>
      </header>

      <div class="workspace">
        <aside class="state-panel">
          <div class="state-heading"><span>SES MOUVEMENTS</span><span>14</span></div>
          <Button
            v-for="(id, index) in SEQUENCE"
            :key="id"
            variant="tab"
            :class="{ active: state === id }"
            :icon="stateIcons[index]"
            :aria-pressed="state === id"
            :style="{ width: '100%', justifyContent: 'flex-start', padding: '10px 12px' }"
            @click="
              choose(id);
              board = false;
            "
            >{{ STATE_LABELS[id] }}</Button
          >
          <div class="state-footer"><span class="status-dot" /> 100 % SVG · sans vidéo</div>
        </aside>

        <section class="preview-panel">
          <header class="preview-heading">
            <div class="preview-tabs">
              <Button variant="tab" :class="{ active: !board }" :icon="Sparkles" @click="board = false">Aperçu</Button
              ><Button variant="tab" :class="{ active: board }" :icon="Grid2X2" @click="board = true"
                >La planche</Button
              >
            </div>
            <span class="live-label"
              ><span :class="{ paused: !playing }" />{{ playing ? 'Il prend vie' : 'Image figée' }}</span
            >
          </header>
          <div
            ref="stage"
            class="stage"
            :class="[`surface-${surface}`, { 'board-stage': board }]"
            @pointermove="pointerMove"
            @pointerleave="release"
          >
            <template v-if="!board">
              <div class="stage-caption"><span>HELLO, PETIT BEAM</span><Sparkles :size="15" /></div>
              <div data-mascot-preview class="hero-mascot">
                <BeamySvg
                  :frame="frame"
                  :color="look.color"
                  :blush="look.blush"
                  :size="340"
                  :label="`Mascotte Beam : ${STATE_LABELS[state]}`"
                />
              </div>
              <div class="stage-shadow" />
              <div class="state-caption">
                <span>{{ STATE_LABELS[state] }}</span>
                <p>
                  {{
                    follow
                      ? 'Promène ton curseur, il te suit du regard.'
                      : 'Une petite présence pour les grands moments d’attente.'
                  }}
                </p>
              </div>
            </template>
            <div v-else class="state-board">
              <Button
                v-for="preview in statePreviews"
                :key="preview.id"
                variant="ghost"
                :style="{ height: 'auto', padding: '6px' }"
                :aria-label="`Tester ${STATE_LABELS[preview.id]}`"
                @click="
                  choose(preview.id);
                  board = false;
                "
                ><span class="board-item"
                  ><BeamySvg :frame="preview.frame" :color="look.color" :size="85" :blush="look.blush" /><span>{{
                    STATE_LABELS[preview.id]
                  }}</span></span
                ></Button
              >
            </div>
            <div class="surface-choices">
              <Button
                v-for="choice in ['paper', 'dark', 'transparent'] as const"
                :key="choice"
                variant="ghost"
                icon-only
                size="xs"
                :aria-label="`Fond ${choice === 'paper' ? 'clair' : choice === 'dark' ? 'sombre' : 'transparent'}`"
                :aria-pressed="surface === choice"
                :style="{
                  background:
                    choice === 'paper'
                      ? 'var(--color-bg-app)'
                      : choice === 'dark'
                        ? 'var(--text-primary)'
                        : 'repeating-conic-gradient(var(--color-border) 0% 25%, var(--color-bg-element) 0% 50%) 0 / 8px 8px',
                  border: surface === choice ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  borderRadius: '50%',
                }"
                @click="surface = choice"
              />
            </div>
          </div>
          <footer class="preview-controls">
            <div class="transport">
              <Button
                variant="ghost"
                icon-only
                :icon="ChevronLeft"
                aria-label="Mouvement précédent"
                @click="nextState(-1)"
              /><Button
                :variant="playing ? 'secondary' : 'primary'"
                :icon="playing ? Pause : Play"
                icon-only
                :aria-label="playing ? 'Mettre en pause' : 'Animer la mascotte'"
                :disabled="board"
                @click="playing = !playing"
              /><Button
                variant="ghost"
                icon-only
                :icon="ChevronRight"
                aria-label="Mouvement suivant"
                @click="nextState(1)"
              /><Select
                :model-value="speed"
                :options="speedOptions"
                size="sm"
                aria-label="Vitesse de lecture"
                @update:model-value="speed = Number($event)"
              />
            </div>
            <Switch v-model="follow" label="Suivre le curseur" aria-label="Suivre le curseur" :disabled="board" />
          </footer>
          <div class="export-row">
            <span><Check :size="12" /> Prêt à emporter, fond transparent</span>
            <div>
              <Button
                variant="ghost"
                size="xs"
                :icon="ArrowDownToLine"
                :disabled="board || exporting"
                @click="exportImage('svg')"
                >SVG</Button
              ><Button
                variant="ghost"
                size="xs"
                :icon="ArrowDownToLine"
                :disabled="board || exporting"
                @click="exportImage('png')"
                >PNG</Button
              >
            </div>
          </div>
        </section>

        <MascotAppearance v-model="look" @expression="choose('idle')" />
      </div>
      <MascotTimeline
        v-model="steps"
        :look="look"
        :active="activeStep"
        :sequencing="sequencing"
        :elapsed="elapsed"
        @seek="seek"
        @play="playSequence"
      />
      <div class="bottom-row">
        <p>
          <MousePointer2 :size="13" /> Clique sur un mouvement pour le tester. <kbd>Espace</kbd> pour faire une pause.
        </p>
        <Button variant="ghost" size="xs" :icon="ArrowUpFromLine" @click="file?.click()">Importer un look</Button>
      </div>
      <p v-if="reducedMotion" class="feedback">
        Les animations démarrent en pause selon ta préférence de mouvements réduits. Tu peux les lancer manuellement.
      </p>
      <p v-if="status" role="status" aria-live="polite" class="feedback">{{ status }}</p>
      <footer class="page-footer">
        <span>Fait de courbes et d’un peu de magie.</span
        ><span>Un laboratoire indépendant · tes réglages restent dans ce navigateur.</span>
      </footer>
    </div>
    <input
      ref="file"
      type="file"
      accept=".json,application/json"
      hidden
      aria-label="Importer un réglage de mascotte"
      @change="importPreset"
    />
  </main>
</template>

<style scoped src="./MascotLab.css"></style>
