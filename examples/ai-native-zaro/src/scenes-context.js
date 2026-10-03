import { image } from './assets.js';
import { scene } from './components.js';

const connections = [
  ['notion', 129, 407, 183],
  ['mailchimp', 1470, 133, 126],
  ['docs', 1050, -70, 165],
  ['granola', 320, 170, 140],
  ['clickup', 1570, 240, 160],
  ['drive', 1740, 930, 140],
  ['slack', 940, -10, 140],
  ['gmail', -70, 50, 140],
  ['excel', 1790, 650, 140],
  ['folder', 12, 830, 140],
  ['plain-file', 850, 900, 150],
  ['notion', 1520, 740, 140],
];
export function contextScenes() {
  return [
    scene(
      'connect',
      'paper',
      `<div class="connection-camera"><div class="connection-title"><span class="typed" data-text="Connect your mess."></span><i class="caret"></i></div>${connections.map(([name, x, y, width], index) => `<div class="floating-logo" id="connection-${index}" style="left:${x}px;top:${y}px;width:${width}px">${image(name)}</div>`).join('')}${image('notes', 'floating-note')}${image('sticky-note', 'floating-sticky')}<div class="file-chip chip-one">Client Onboarding Session</div><div class="file-chip chip-two">Project Kickoff Meeting</div><div class="file-chip chip-three">Daily Market Update</div></div>`,
    ),
    scene(
      'chaos',
      'paper',
      `<div class="chaos-points">${image('chaos-type')}</div><div class="context-preview">${image('dashboard')}</div>`,
    ),
  ].join('');
}
