import { image } from './assets.js';
import { scene, wordmark } from './components.js';

function system(id, x, y, scale, kind = 'deal-card') {
  return `<div class="system" id="${id}" style="left:${x}px;top:${y}px;--system-scale:${scale}"><div class="system-card">${image(kind)}</div>${[
    420, 560, 690,
  ]
    .map(
      (radius, index) =>
        `<div class="orbit orbit-${index}" style="width:${radius * 2}px;height:${radius * 2}px;left:${500 - radius}px;top:${500 - radius}px">${Array.from(
          { length: index === 0 ? 8 : 20 },
          (_, i) => {
            const angle = (i / (index === 0 ? 8 : 20)) * Math.PI * 2;
            const icons = ['drive', 'docs', 'granola', 'folder', 'slack', 'plain-file', 'excel', 'gmail'];
            return image(
              icons[i % 8],
              'orbit-item',
              `style="left:${radius + Math.sin(angle) * radius - 20}px;top:${radius + Math.cos(angle) * radius - 20}px"`,
            );
          },
        ).join('')}</div>`,
    )
    .join('')}</div>`;
}
export function systemScenes() {
  return [
    scene(
      'system',
      'brown',
      `<div class="system-iris"><div class="not-just"><span>You didn’t just</span><span>build an app.</span></div><div class="system-camera">${system('main-system', 460, 40, 1)}${system('system-top-left', -143, -524, 0.6, 'pixel-card')}${system('system-top-right', 1017, -524, 0.6, 'mission-card')}${system('system-bottom-left', -126, 501, 0.6, 'mission-card')}${system('system-bottom-right', 1088, 126, 0.55, 'mission-card')}${system('system-back', 400, 700, 0.4)}</div><div class="grew-copy"><span class="typed" data-text="You grew a system."></span><i class="caret"></i></div></div>`,
    ),
    scene(
      'end',
      'paper',
      `${image('end-map', 'end-map')}${wordmark('end-brand')}<div class="end-cta">TRY FOR FREE AT <b>ZARO.AI</b></div>`,
    ),
  ].join('');
}
