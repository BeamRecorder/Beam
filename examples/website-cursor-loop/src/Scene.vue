<script setup lang="ts">
import { computed, nextTick } from "vue";
import {
  MousePointer2,
  Move,
  Scan,
  CircleHelp,
  Check,
  Lock,
} from "@lucide/vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import Input from "../../../apps/desktop/src/components/ui/input/Input.vue";
import StaticGradient from "../../website-editing-loop/src/StaticGradient.vue";
import { svgAtRasterSize } from "../../../packages/runtime/src/cursor/cursor-svg";
import selectionSvg from "../assets/cursors/macos/screenshotselection.svg?raw";
import {
  resolveCursorAsset,
  cursorGeometry,
} from "../../../packages/engine/src/shared/cursor-assets";
import { cursorMotionBlurTrail } from "../../../packages/engine/src/cursor/cursor-motion";
import Inspector from "./Inspector.vue";
import { PACKS, GALLERIES } from "./catalog";
import {
  CLICKS,
  MOTION,
  settingsAt,
  actionAt,
  clickScaleAt,
  rippleFor,
} from "./motion";
import { pointerAt } from "./telemetry";
import type { CursorPose } from "./demo-types";
const props = defineProps<{ pose: CursorPose }>();
// Render this thin monochrome shape with Beam's existing tint function.
const selectionUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgAtRasterSize(selectionSvg, 32, 32, getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim(), true))}`;
const state = computed(() => settingsAt(props.pose.time));
const action = computed(() => actionAt(props.pose.time));
const sample = computed(() => pointerAt(props.pose.time));
const pack = computed(() =>
  PACKS.find((pack) => pack.id === state.value.packId)!,
);
const resolveRole = (pack: (typeof PACKS)[number], role: string | null) =>
  resolveCursorAsset(
    pack,
    { packId: pack.id, mode: "automatic", cursorId: null },
    role,
  );
const asset = computed(() => resolveRole(pack.value, sample.value.cursorKind));
const geometry = computed(() => cursorGeometry(asset.value, state.value.size));
const trail = computed(() =>
  cursorMotionBlurTrail(sample.value, MOTION.motionBlur, {
    width: 640,
    height: 400,
  }),
);
function spriteStyle(point: { x: number; y: number; alpha: number }) {
  const g = geometry.value;
  return {
    width: `${g.width}px`,
    height: `${g.height}px`,
    transformOrigin: `${g.hotspot.x}px ${g.hotspot.y}px`,
    transform: `translate3d(${point.x * 640 - g.hotspot.x}px, ${point.y * 400 - g.hotspot.y}px, 0) scale(${clickScaleAt(props.pose.time)})`,
    opacity: point.alpha,
  };
}
function ringStyle(click: (typeof CLICKS)[number], index: number) {
  const ring = rippleFor(props.pose.time, click)?.rings[index];
  return {
    transform: `translate3d(${click.x - 16}px, ${click.y - 16}px, 0) scale(${(ring?.radius ?? 0) / 16})`,
    opacity: ring?.opacity ?? 0,
  };
}
const ready = (async () => {
  await nextTick();
  await document.fonts.ready;
  await Promise.all(Array.from(document.images, (image) => image.decode()));
})();
defineExpose({ ready });
</script>
<template>
  <div class="design-stage">
    <StaticGradient preset-id="tide" />
    <div class="editor-card">
      <header class="project-bar">
        <MousePointer2 :size="13" /><span>Beautiful Captures</span
        ><span class="project-format">Cursor</span>
      </header>
      <main class="workspace">
        <section
          class="preview-area"
          aria-label="Complete cursor pack showcase"
        >
          <div class="role-spotlight" :data-role="action.step.role">
            <div
              v-for="(gallery, index) in GALLERIES"
              :key="gallery.pack.id"
              class="spotlight-art"
              :style="{ opacity: index === 0 ? 1 - state.mix : state.mix }"
              data-layout-allow-occlusion="true"
            >
              <img
                :src="resolveRole(gallery.pack, action.step.role).url"
                alt=""
              />
            </div>
            <strong>{{ action.step.label }}</strong>
          </div>
          <div
            class="action-card"
            :data-action="action.step.action"
            :style="{
              width: `${action.width}px`,
              transform: `translate3d(${action.x}px, ${action.y}px, 0)`,
            }"
          >
            <Button
              v-if="action.step.action === 'button'"
              variant="primary"
              size="sm"
              block
              :icon="Check"
              data-demo-target="action"
              ><span data-layout-allow-occlusion="true"
                >Make it yours</span
              ></Button
            >
            <Input
              v-else-if="action.step.action === 'text'"
              :model-value="action.text"
              readonly
              aria-label="Editable title"
            />
            <template v-else-if="action.step.action === 'help'"
              ><CircleHelp :size="15" /><span data-layout-allow-occlusion="true"
                >Need a hand?</span
              ></template
            >
            <template v-else-if="action.step.action === 'disabled'"
              ><Lock :size="15" /><span data-layout-allow-occlusion="true"
                >Layer locked</span
              ></template
            >
            <template v-else
              ><component
                :is="action.step.action === 'select' ? Scan : Move"
                :size="15"
              /><span data-layout-allow-occlusion="true"
                >Beautiful Captures</span
              ></template
            >
            <template v-if="['move', 'resize'].includes(action.step.action)"
              ><i
                v-for="corner in 4"
                :key="corner"
                :class="`handle corner-${corner}`"
            /></template>
            <i
              v-if="action.step.action === 'select'"
              class="selection-box"
              :style="{
                width: `${12 + action.progress * 74}px`,
                height: `${8 + action.progress * 27}px`,
              }"
            />
          </div>
          <div class="gallery-caption">
            <span>Cursor library</span
            ><span>{{ pack.cursors.length }} roles</span>
          </div>
          <div
            v-for="(gallery, index) in GALLERIES"
            :key="gallery.pack.id"
            class="cursor-gallery"
            :data-gallery-pack="gallery.pack.id"
            :style="{ opacity: index === 0 ? 1 - state.mix : state.mix }"
            :aria-hidden="gallery.pack.id !== pack.id"
            data-layout-allow-occlusion="true"
          >
            <Button
              v-for="entry in gallery.artwork"
              :key="entry.asset.url"
              variant="ghost"
              size="xs"
              icon-only
              class="cursor-tile"
              :class="{
                highlighted:
                  entry.asset.url ===
                  resolveRole(gallery.pack, action.step.role).url,
              }"
              :title="entry.roles.join(', ')"
              :aria-label="entry.roles.join(', ')"
              :data-roles="entry.roles.join(',')"
            >
              <template #icon
                ><img
                  :src="
                    entry.asset.id === 'screenshotselection'
                      ? selectionUrl
                      : entry.asset.url
                  "
                  alt=""
              /></template>
            </Button>
          </div>
        </section>
        <Inspector :time="pose.time" />
      </main>
    </div>
    <template v-for="click in CLICKS" :key="click.at"
      ><span
        v-for="index in 2"
        :key="index"
        class="click-ring"
        :style="ringStyle(click, index - 1)"
        aria-hidden="true"
    /></template>
    <img
      v-for="(point, index) in trail"
      :key="index"
      class="demo-cursor"
      :class="{ primary: index === trail.length - 1 }"
      :src="asset.url"
      :style="spriteStyle(point)"
      :data-pack="pack.id"
      :data-role="sample.cursorKind"
      data-layout-allow-occlusion="true"
      alt=""
      aria-hidden="true"
    />
  </div>
</template>
