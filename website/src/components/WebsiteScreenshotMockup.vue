<script setup lang="ts">
import { ArrowUpRight, Circle, Copy, Crop, Image, Layers3, MousePointer2, Square, Type } from '@lucide/vue';
</script>

<template>
  <div class="shot-ui" role="img" aria-label="Illustration of Beam's Screenshot Editor">
    <div class="shot-ui__topbar">
      <span class="shot-ui__back">←</span>
      <span class="shot-ui__project">Release notes</span>
      <span class="shot-ui__space" />
      <span class="shot-ui__button"><Copy aria-hidden="true" />Copy</span>
      <span class="shot-ui__export"><ArrowUpRight aria-hidden="true" />Export</span>
    </div>
    <div class="shot-ui__body">
      <div class="shot-ui__rail" aria-hidden="true">
        <span><Layers3 /></span>
        <span class="is-active"><Image /></span>
        <span><MousePointer2 /></span>
      </div>
      <div class="shot-ui__panel" aria-hidden="true">
        <strong>Elements</strong>
        <span class="shot-ui__divider" />
        <div class="shot-ui__tools">
          <span><Square />Shape</span><span><Type />Text</span><span><Crop />Crop</span>
        </div>
        <small>Appearance</small>
        <span class="shot-ui__field">Outline <b>#ff5a1f</b></span>
        <span class="shot-ui__field">Thickness <b>4 px</b></span>
        <span class="shot-ui__slider"><i /></span>
        <small>Composition</small>
        <span class="shot-ui__layer"><i class="is-orange" />Rectangle</span>
        <span class="shot-ui__layer"><i />Screenshot</span>
      </div>
      <div class="shot-ui__workspace" aria-hidden="true">
        <div class="shot-ui__canvas">
          <div class="shot-ui__window">
            <span class="shot-ui__traffic"><Circle /><Circle /><Circle /></span>
            <span class="shot-ui__window-title">Beam</span>
            <div class="shot-ui__window-body">
              <span class="shot-ui__mini-card" />
              <span class="shot-ui__mini-card is-wide" />
              <span class="shot-ui__mini-card" />
            </div>
          </div>
          <div class="shot-ui__annotation">
            <i /><i /><i /><i />
            <span>Make this clearer</span>
          </div>
          <div class="shot-ui__arrow">↗</div>
        </div>
        <span class="shot-ui__size">1600 × 1000 · PNG</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shot-ui {
  overflow: hidden;
  width: 100%;
  border: 1px solid rgb(25 23 20 / 16%);
  border-radius: 18px;
  background: #f8f6f2;
  box-shadow: 0 26px 55px -30px rgb(32 20 14 / 46%);
  color: #25221e;
  font-size: clamp(7px, 0.72vw, 11px);
}

.shot-ui svg {
  width: 1.35em;
  height: 1.35em;
}

.shot-ui__topbar {
  display: flex;
  height: 4.4em;
  padding: 0 1.2em;
  align-items: center;
  gap: 0.8em;
  border-bottom: 1px solid rgb(25 23 20 / 8%);
  background: rgb(255 255 255 / 76%);
}

.shot-ui__back,
.shot-ui__project,
.shot-ui__button,
.shot-ui__export {
  display: inline-flex;
  min-height: 2.45em;
  padding: 0 0.8em;
  align-items: center;
  gap: 0.45em;
  border-radius: 0.7em;
  font-weight: 700;
}

.shot-ui__project,
.shot-ui__button {
  border: 1px solid rgb(25 23 20 / 9%);
  background: #fff;
}

.shot-ui__space {
  flex: 1;
}

.shot-ui__export {
  background: #ff5a1f;
  color: white;
}

.shot-ui__body {
  display: grid;
  height: clamp(260px, 35vw, 450px);
  grid-template-columns: 5em minmax(12em, 0.46fr) minmax(0, 1.54fr);
}

.shot-ui__rail {
  display: flex;
  padding: 1em 0.7em;
  align-items: center;
  gap: 0.7em;
  border-right: 1px solid rgb(25 23 20 / 8%);
  flex-direction: column;
}

.shot-ui__rail span {
  display: grid;
  width: 3.2em;
  height: 3.2em;
  place-items: center;
  border-radius: 0.8em;
  color: #7d756c;
}

.shot-ui__rail .is-active {
  background: rgb(255 90 31 / 12%);
  color: #f45117;
}

.shot-ui__panel {
  display: flex;
  padding: 1.6em;
  gap: 1em;
  border-right: 1px solid rgb(25 23 20 / 8%);
  background: rgb(255 255 255 / 58%);
  flex-direction: column;
}

.shot-ui__panel strong {
  font-size: 1.25em;
}

.shot-ui__panel small {
  margin-top: 0.8em;
  color: #777067;
  font-weight: 700;
}

.shot-ui__divider {
  height: 1px;
  background: rgb(25 23 20 / 8%);
}

.shot-ui__tools {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6em;
}

.shot-ui__tools span {
  display: grid;
  padding: 0.8em 0.2em;
  place-items: center;
  gap: 0.4em;
  border: 1px solid rgb(25 23 20 / 9%);
  border-radius: 0.7em;
  background: #fff;
}

.shot-ui__field,
.shot-ui__layer {
  display: flex;
  min-height: 2.8em;
  padding: 0 0.8em;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgb(25 23 20 / 8%);
  border-radius: 0.65em;
  background: #fff;
}

.shot-ui__slider {
  height: 0.35em;
  border-radius: 99px;
  background: #dfdbd3;
}

.shot-ui__slider i {
  display: block;
  width: 62%;
  height: 100%;
  border-radius: inherit;
  background: #ff5a1f;
}

.shot-ui__layer {
  justify-content: flex-start;
  gap: 0.65em;
}

.shot-ui__layer i {
  width: 1.55em;
  height: 1.25em;
  border-radius: 0.25em;
  background: linear-gradient(135deg, #d5e5fa, #b8d2ed);
}

.shot-ui__layer i.is-orange {
  background: rgb(255 90 31 / 20%);
  box-shadow: inset 0 0 0 2px #ff5a1f;
}

.shot-ui__workspace {
  display: grid;
  padding: 3em;
  place-items: center;
  background: radial-gradient(circle at 20% 10%, rgb(255 255 255 / 78%), transparent 36%), #eae6df;
}

.shot-ui__canvas {
  position: relative;
  display: grid;
  width: min(95%, 640px);
  aspect-ratio: 8 / 5;
  place-items: center;
  border-radius: 1.4em;
  background: linear-gradient(135deg, #ffd6c6, #ffab8a 48%, #ff7d4c);
  box-shadow: 0 2em 4em -2em rgb(91 37 14 / 45%);
}

.shot-ui__window {
  overflow: hidden;
  width: 78%;
  height: 68%;
  border: 0.4em solid rgb(255 255 255 / 70%);
  border-radius: 1em;
  background: #fff;
  box-shadow: 0 1.5em 2.4em -1.2em rgb(70 30 15 / 35%);
}

.shot-ui__traffic {
  display: flex;
  height: 2.6em;
  padding: 0 0.8em;
  align-items: center;
  gap: 0.32em;
  background: #f2efe9;
}

.shot-ui__traffic svg {
  width: 0.65em;
  fill: #d6d0c6;
  color: #d6d0c6;
}

.shot-ui__window-title {
  position: absolute;
  margin: -2.2em 0 0 8.6em;
  font-size: 0.85em;
  font-weight: 700;
}

.shot-ui__window-body {
  display: grid;
  height: calc(100% - 2.6em);
  padding: 1.4em;
  grid-template-columns: 1fr 1.4fr;
  gap: 1em;
  background: #fbfaf8;
}

.shot-ui__mini-card {
  border-radius: 0.7em;
  background: linear-gradient(145deg, #efebe4, #ded8ce);
}

.shot-ui__mini-card.is-wide {
  grid-row: span 2;
  background: linear-gradient(145deg, #38342f, #171513);
}

.shot-ui__annotation {
  position: absolute;
  right: 5%;
  bottom: 9%;
  display: flex;
  padding: 0.55em 0.85em;
  align-items: center;
  gap: 0.45em;
  border: 0.24em solid #ff5a1f;
  border-radius: 0.55em;
  background: white;
  color: #f45117;
  font-weight: 800;
}

.shot-ui__annotation i {
  position: absolute;
  width: 0.65em;
  height: 0.65em;
  border: 0.18em solid #ff5a1f;
  background: white;
}

.shot-ui__annotation i:nth-child(1) {
  top: -0.48em;
  left: -0.48em;
}
.shot-ui__annotation i:nth-child(2) {
  top: -0.48em;
  right: -0.48em;
}
.shot-ui__annotation i:nth-child(3) {
  bottom: -0.48em;
  left: -0.48em;
}
.shot-ui__annotation i:nth-child(4) {
  right: -0.48em;
  bottom: -0.48em;
}

.shot-ui__arrow {
  position: absolute;
  top: 14%;
  left: 15%;
  color: #ff5a1f;
  font-size: 4.5em;
  font-weight: 300;
  transform: rotate(7deg);
}

.shot-ui__size {
  align-self: end;
  padding: 0.6em 0.9em;
  border: 1px solid rgb(25 23 20 / 9%);
  border-radius: 0.7em;
  background: rgb(255 255 255 / 78%);
  color: #676058;
  font-weight: 700;
}

@media (max-width: 620px) {
  .shot-ui__body {
    grid-template-columns: 4em 1fr;
  }

  .shot-ui__panel {
    display: none;
  }

  .shot-ui__workspace {
    padding: 1.5em;
  }
}
</style>
