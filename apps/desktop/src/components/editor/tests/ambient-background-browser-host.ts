import '../../../style.css';
import '../../screenshot/screenshot-editor.css';
import '../layout/editor-preview-layout.css';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import type { EditorAmbientBackgroundProps } from '../editor-ambient-background-types';
import EditorAmbientBackground from '../EditorAmbientBackground.vue';
import EditorTitlebar from '../EditorTitlebar.vue';
import EditorWorkspace from '../layout/EditorWorkspace.vue';

let app: App | undefined;

/** Real editor background, chrome and fit geometry; the output bitmap is deliberately independent. */
export async function mountAmbientBackground(
  background: BackgroundValue | null,
  variant: EditorAmbientBackgroundProps['variant'],
) {
  app?.unmount();
  document.body.innerHTML = '<div id="test"></div>';
  app = createApp({
    render: () =>
      h('main', { class: 'screenshot-editor' }, [
        h(EditorAmbientBackground, { background, variant }),
        h(EditorTitlebar, {}, { center: () => h('span', 'Screenshot') }),
        h(EditorWorkspace, { kind: 'screenshot' }, () =>
          h('div', { class: 'screenshot-stage' }, [
            h('div', { class: 'stage-bounds' }, [
              h('canvas', {
                id: 'output',
                width: 320,
                height: 180,
                style: {
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 'min(100cqw, calc(100cqh * 16 / 9))',
                  height: 'auto',
                  aspectRatio: '16 / 9',
                },
              }),
            ]),
          ]),
        ),
      ]),
  });
  app.mount('#test');
  await nextTick();
  const canvas = document.querySelector<HTMLCanvasElement>('#output')!,
    ctx = canvas.getContext('2d')!;
  if (background?.kind === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, 320, 0);
    gradient.addColorStop(0, '#143a5f');
    gradient.addColorStop(1, '#db6729');
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = background?.kind === 'color' ? background.color : '#143a5f';
  ctx.fillRect(0, 0, 320, 180);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(40, 30, 240, 120, 8);
  ctx.fill();
  ctx.fillStyle = '#143a5f';
  ctx.font = '16px sans-serif';
  ctx.fillText('Screenshot — 16:9', 70, 65);
  await Promise.all([...document.images].map((image) => image.decode()));
  return {
    bounds: canvas.getBoundingClientRect().toJSON(),
    pixels: canvas.toDataURL(),
    width: canvas.width,
    height: canvas.height,
  };
}
