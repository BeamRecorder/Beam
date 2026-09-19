<script setup lang="ts">
import { Pause, Play } from '@lucide/vue';
import { ref } from 'vue';

defineProps<{
  videoLabel: string;
  playLabel: string;
  pauseLabel: string;
}>();

const video = ref<HTMLVideoElement | null>(null);
const ambientVideo = ref<HTMLVideoElement | null>(null);
const isVideoPaused = ref(false);

const toggleVideo = async () => {
  if (!video.value) return;
  if (video.value.paused) {
    if (ambientVideo.value) ambientVideo.value.currentTime = video.value.currentTime;
    try {
      await Promise.all([video.value.play(), ambientVideo.value?.play()]);
    } catch {
      isVideoPaused.value = true;
    }
    return;
  }
  video.value.pause();
  ambientVideo.value?.pause();
};
</script>

<template>
  <div class="macbook-demo">
    <div class="macbook-demo__stage">
      <div class="macbook-demo__device">
        <div class="macbook-demo__screen">
          <video
            ref="ambientVideo"
            class="macbook-demo__video macbook-demo__video--ambient"
            aria-hidden="true"
            tabindex="-1"
            autoplay
            muted
            loop
            playsinline
            preload="auto"
          >
            <source src="/website-demo.webm" type="video/webm" />
          </video>
          <video
            ref="video"
            class="macbook-demo__video macbook-demo__video--primary"
            :aria-label="videoLabel"
            autoplay
            muted
            loop
            playsinline
            preload="auto"
            @pause="isVideoPaused = true"
            @play="isVideoPaused = false"
          >
            <source src="/website-demo.webm" type="video/webm" />
          </video>
        </div>
        <img
          class="macbook-demo__frame"
          src="/macbook-pro-14-silver.webp"
          alt=""
          width="3824"
          height="2564"
          decoding="async"
        />
        <button
          class="macbook-demo__control"
          type="button"
          :aria-label="isVideoPaused ? playLabel : pauseLabel"
          :title="isVideoPaused ? playLabel : pauseLabel"
          @click="toggleVideo"
        >
          <Play v-if="isVideoPaused" aria-hidden="true" />
          <Pause v-else aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.macbook-demo {
  position: relative;
  width: min(100%, 1120px);
  margin: -54px auto -5px;
}

.macbook-demo__stage {
  position: relative;
  isolation: isolate;
}

.macbook-demo__device {
  position: relative;
  aspect-ratio: 3824 / 2564;
  filter: drop-shadow(0 40px 34px rgb(56 43 35 / 23%));
}

.macbook-demo__screen {
  position: absolute;
  z-index: 1;
  top: 10.1%;
  left: 9.25%;
  width: 81.5%;
  height: 82.2%;
  overflow: hidden;
  border-radius: 2.4% 2.4% 0.8% 0.8%;
  background: #080808;
}

.macbook-demo__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.macbook-demo__video--ambient {
  object-fit: cover;
  filter: blur(22px) saturate(0.9) brightness(0.74);
  opacity: 0.88;
  transform: scale(1.045);
}

.macbook-demo__video--primary {
  object-fit: contain;
}

.macbook-demo__frame {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.macbook-demo__control {
  position: absolute;
  z-index: 4;
  right: 10.5%;
  bottom: 11.5%;
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 17%);
  border-radius: 11px;
  background: rgb(20 19 18 / 82%);
  color: white;
  cursor: pointer;
  backdrop-filter: blur(12px);
}

.macbook-demo__control:hover {
  background: rgb(20 19 18 / 96%);
}

.macbook-demo__control svg {
  width: 15px;
  height: 15px;
}

@media (max-width: 700px) {
  .macbook-demo {
    width: calc(100% + 18px);
    margin-top: 38px;
    margin-left: -9px;
  }

  .macbook-demo__control {
    right: 10%;
    bottom: 10.3%;
    width: 28px;
    height: 28px;
    border-radius: 8px;
  }
}
</style>
