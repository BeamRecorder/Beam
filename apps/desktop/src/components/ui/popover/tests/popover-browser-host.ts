// Browser fixture uses the actual insertion menus over a high-contrast canvas.
import '../../../../style.css';
import { createApp, h, nextTick, ref } from 'vue';
import { i18n } from '../../../../i18n';
import TimelineAddMenu from '../../../editor/timeline/TimelineAddMenu.vue';
import CanvasAddMenu from '../../../editor/search/CanvasAddMenu.vue';
import { provideEditorSearch } from '../../../editor/search/useEditorSearch';
import ContextMenu from '../../context-menu/ContextMenu.vue';

let active: ReturnType<typeof createApp> | undefined;
export function unmountMenus() {
  active?.unmount();
  active = undefined;
}
export async function mountMenus(kind: 'add' | 'canvas' | 'context', theme: 'light' | 'dark', gpu = false) {
  unmountMenus();
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.remove('measure-menu-background');
  document.body.innerHTML =
    '<canvas id="backdrop" style="position:fixed;inset:0"></canvas><div id="test" style="position:absolute;left:70px;top:360px"></div>';
  const canvas = document.querySelector<HTMLCanvasElement>('#backdrop')!;
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  if (gpu) {
    const gl = canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('Menu test requires a WebGL backdrop.');
    gl.enable(gl.SCISSOR_TEST);
    for (let y = 0; y < canvas.height; y += 4) {
      const color = (y % 8 === 0 ? 48 : 240) / 255;
      gl.scissor(0, y, canvas.width, 4);
      gl.clearColor(color, color, color, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.flush();
  } else {
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? '#303030' : '#f0f0f0';
      ctx.fillRect(0, y, canvas.width, 4);
    }
  }
  const menu = ref<InstanceType<typeof CanvasAddMenu> | null>(null);
  const contextMenu = ref<InstanceType<typeof ContextMenu> | null>(null);
  const app = createApp({
    setup() {
      provideEditorSearch({
        mode: 'video',
        canInsert: () => true,
        canEditClip: () => false,
        clipKind: () => undefined,
        selections: () => [],
        insert: () => {},
      });
      return () =>
        kind === 'add'
          ? h(TimelineAddMenu)
          : kind === 'canvas'
            ? h(CanvasAddMenu, { ref: menu })
            : h(ContextMenu, {
                ref: contextMenu,
                items: ['One', 'Two', 'Three', 'Four'].map((label) => ({ id: label, label })),
              });
    },
  });
  active = app;
  app.use(i18n);
  app.mount('#test');
  await nextTick();
  if (kind === 'add') document.querySelector<HTMLButtonElement>('.menu-button')!.click();
  if (kind === 'canvas') await menu.value!.open(new MouseEvent('dblclick', { clientX: 70, clientY: 160 }));
  if (kind === 'context') contextMenu.value!.open({ x: 70, y: 160 });
  await nextTick();
  await document.fonts.ready;
}
