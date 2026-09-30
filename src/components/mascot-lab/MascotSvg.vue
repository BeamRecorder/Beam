<script setup lang="ts">
import { useId } from 'vue';
import type { BotFrame, DotRender } from './bot/bot-types';
import { NOTIF_BLUE } from './bot/decor';
import { mixHex } from './bot/skins';
import { DEMI_VIEWBOX, RAYON } from './bot/repere';

const props = withDefaults(
  defineProps<{
    frame: BotFrame;
    color: string;
    size?: number;
    blush?: boolean;
    paper?: string;
    label?: string;
  }>(),
  { size: 320, blush: false, paper: '#fffaf3', label: 'Mascotte Beam' },
);
const id = useId().replaceAll(':', '');
const dotAttrs = (dot: DotRender) => {
  const fill = dot.color ?? (dot.depth === undefined ? props.color : mixHex(props.paper, props.color, dot.depth));
  return dot.d
    ? {
        fill,
        opacity: dot.opacity,
        d: dot.d,
        transform: `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`,
      }
    : { fill, opacity: dot.opacity, cx: dot.x, cy: dot.y, r: dot.r };
};
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="`${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${DEMI_VIEWBOX * 2}`"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="label"
  >
    <defs>
      <mask :id="`${id}-face`" maskUnits="userSpaceOnUse" x="-158" y="-158" width="316" height="316">
        <path :d="frame.bodyPath" fill="white" />
        <path
          v-for="(eye, i) in frame.eyes"
          :key="i"
          :d="eye.d"
          :transform="eye.matrix"
          :opacity="eye.alpha"
          fill="black"
        />
        <circle v-if="frame.notch" :cx="frame.notch.x" :cy="frame.notch.y" :r="frame.notch.r" fill="black" />
      </mask>
      <clipPath :id="`${id}-body`"><path :d="frame.bodyPath" /></clipPath>
      <linearGradient
        v-for="arc in frame.arcs"
        :id="`${id}-${arc.id}`"
        :key="arc.id"
        gradientUnits="userSpaceOnUse"
        :x1="arc.grad.x1"
        :y1="arc.grad.y1"
        :x2="arc.grad.x2"
        :y2="arc.grad.y2"
      >
        <stop
          v-for="(colorStop, i) in arc.grad.stops"
          :key="i"
          :offset="i / (arc.grad.stops.length - 1)"
          :stop-color="colorStop"
        />
      </linearGradient>
    </defs>
    <g fill="none" stroke-linecap="round">
      <path
        v-for="arc in frame.arcs"
        :key="arc.id"
        :d="arc.back"
        :stroke="`url(#${id}-${arc.id})`"
        :stroke-width="arc.width"
        :opacity="arc.opacity"
      />
    </g>
    <g v-if="frame.dotsBehind">
      <component :is="dot.d ? 'path' : 'circle'" v-for="(dot, i) in frame.dots" :key="i" v-bind="dotAttrs(dot)" />
    </g>
    <g :opacity="frame.bodyAlpha">
      <path :d="frame.bodyPath" :fill="paper" />
      <path :d="frame.bodyPath" :fill="color" :mask="`url(#${id}-face)`" />
      <g v-if="blush" :clip-path="`url(#${id}-body)`">
        <ellipse
          v-for="(eye, i) in frame.eyes"
          :key="i"
          cx="0"
          cy="29"
          rx="12"
          ry="5"
          :transform="eye.matrix"
          fill="#fffaf3"
          :opacity="eye.alpha * 0.22"
        />
      </g>
    </g>
    <g v-if="!frame.dotsBehind">
      <component :is="dot.d ? 'path' : 'circle'" v-for="(dot, i) in frame.dots" :key="i" v-bind="dotAttrs(dot)" />
    </g>
    <circle v-if="frame.notif" :cx="frame.notif.x" :cy="frame.notif.y" :r="frame.notif.r" :fill="NOTIF_BLUE" />
    <g fill="none" stroke-linecap="round">
      <path
        v-for="arc in frame.arcs"
        :key="arc.id"
        :d="arc.front"
        :stroke="`url(#${id}-${arc.id})`"
        :stroke-width="arc.width"
        :opacity="arc.opacity"
      />
    </g>
  </svg>
</template>
