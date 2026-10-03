import { image, cursor } from './assets.js';
import { scene, title, prompt, wordmark, dots } from './components.js';

export function openingScenes() {
  return [
    scene(
      'intro',
      'dark',
      `<div class="intro-simple">Apps <span>and agents</span></div><div class="intro-line"><span>Apps</span><div class="app-cycle"><div class="small-app purple"><div class="pixel-letter">O</div><strong>Operations</strong><small>2 Apps</small></div><div class="small-app yellow">${image('intro-marketing', 'pixel-letter')}<strong>Marketing</strong><small>2 Apps</small></div><div class="small-app orange">${image('intro-finance', 'pixel-letter')}<strong>Finance<br>Planner</strong><small>2 Apps</small></div></div><span class="intro-and">and</span><div class="agent-cycle"><span class="agent-label aqua">Content Writer</span><span class="agent-label yellow">App Updater</span><span class="agent-label orange">Outbound Agent</span><span class="agent-label deal">Deal Analyst</span></div><span>agents</span></div>`,
    ),
    scene(
      'one-prompt',
      'dark',
      `${image('map', 'world-map')}<div class="one-line"><span class="typed" data-text="with one prompt."></span><i class="caret"></i></div>`,
    ),
    scene(
      'meet',
      'paper',
      `<div class="purple-wash"></div><div class="meet-copy"><span class="typed" data-text="Meet"></span><i class="caret"></i></div>`,
    ),
    scene(
      'brand-intro',
      'paper',
      `<div class="brand-wipe">${['tl', 'tr', 'bl', 'br'].map((corner) => `<i class="wipe-${corner}"></i>`).join('')}</div>${wordmark('opening-brand')}`,
    ),
    title('build-title', 'Build an app.', 'With a sentence.'),
    scene('build-prompt', 'paper', prompt('app-prompt', 'Build a tracker for my clients and deals', true)),
    scene(
      'app-built',
      'gray',
      `<div class="dashboard-camera"><div class="app-shell">${image('dashboard')}${image('dashboard-empty', 'app-loading')}<div class="app-blank"></div></div></div>`,
    ),
    scene(
      'agent-chat',
      'gray',
      `<div class="chat-camera">${image('chat-background', 'chat-plate')}<div class="chat-content">${image('chat-header', 'chat-header')}<div class="chat-message">Let’s add some agents</div><div class="planning">✣ &nbsp; Planning…</div><div class="chat-input"><span class="typed" data-text="Let’s add some"></span><span class="agent-chip">${image('agent-purple')}agents</span><div class="ask-empty">Ask anything…</div>${image('chat-toolbar', 'chat-toolbar')}${cursor()}</div></div></div>`,
    ),
    scene(
      'agents-title',
      'brown',
      `<div class="title"><div>Add in agents.</div><div class="secondary"><span class="typed" data-text="They keep it running."></span><i class="caret"></i></div></div>${['purple', 'yellow', 'green', 'aqua'].map((color, index) => dots(color, 'dotted-' + index)).join('')}`,
    ),
  ].join('');
}
