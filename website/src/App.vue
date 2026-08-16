<script setup lang="ts">
import { ref } from 'vue';
import { Code2, Play } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import WebsiteEditorPreview from '@website/components/WebsiteEditorPreview.vue';
import WebsiteHudPreview from '@website/components/WebsiteHudPreview.vue';
import { demoMedia } from '@website/demo/website-demo-fixture';

const editorRef = ref<InstanceType<typeof WebsiteEditorPreview> | null>(null);

const playDemo = () => {
  document.querySelector('#editor-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  void editorRef.value?.play();
};
</script>

<template>
  <div class="site-wrapper">
    <header class="site-header">
      <div class="site-header-inner">
        <a class="brand" href="#top" aria-label="Beam home">
          <img :src="demoMedia.iconUrl" alt="" />
          <span>Beam</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#capture">Capture</a>
          <a href="#editor-demo">Editor</a>
          <a href="https://github.com/ExtraBinoss/Beam" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </header>

    <div class="site-shell">
      <main id="top">
        <section class="hero" aria-labelledby="hero-title">
          <div class="hero-copy">
            <h1 id="hero-title">Record the moment.<br />Polish the story.</h1>
            <p class="lede">
              Beam combines capture and editing in one focused desktop app, so product demos stay fast to make and clear
              to watch.
            </p>
            <div class="hero-actions">
              <Button size="lg" :icon="Play" @click="playDemo">Watch the real demo</Button>
              <a class="secondary-action" href="https://github.com/ExtraBinoss/Beam" target="_blank" rel="noreferrer">
                <Code2 aria-hidden="true" /> View source
              </a>
            </div>
          </div>
          <button class="hero-media" type="button" aria-label="Play the Beam demo" @click="playDemo">
            <img :src="demoMedia.thumbnailUrl" alt="Beam video editor showing a product recording" />
            <span><Play aria-hidden="true" /> Play 10-second demo</span>
          </button>
        </section>

        <section id="capture" class="content-section">
          <WebsiteHudPreview @play="playDemo" />
        </section>

        <section id="editor-demo" class="content-section">
          <WebsiteEditorPreview ref="editorRef" />
        </section>

        <section class="open-source">
          <p class="eyebrow">Built in the open</p>
          <h2>Inspect every line. Shape what comes next.</h2>
          <p>Beam is open source. Follow development, report issues, or contribute on GitHub.</p>
          <a class="secondary-action" href="https://github.com/ExtraBinoss/Beam" target="_blank" rel="noreferrer">
            <Code2 aria-hidden="true" /> ExtraBinoss/Beam
          </a>
        </section>
      </main>

      <footer>
        <span>Beam</span>
        <span>Open-source screen recorder and editor.</span>
      </footer>
    </div>
  </div>
</template>
