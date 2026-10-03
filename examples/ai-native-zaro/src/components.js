import { image, cursor } from './assets.js';

export const agents = [
  ['purple', 'Follow-up Writer', 'Drafts contextual outreach emails for deals using deal…'],
  ['yellow', 'Deal Monitor', 'Updates pipeline, & daily scan of all deals for risk signa…'],
  ['green', 'Weekly Digest', 'Monday morning summary of pipeline health, movem…'],
  ['aqua', 'Today’s Actions', 'Morning briefing on follow-ups due today — chase…'],
];
export function wordmark(id) {
  return `<div class="wordmark" id="${id}">${image('logo-mark', 'brand-mark')}${image('logo-word', 'brand-word')}</div>`;
}
export function prompt(id, text, connections = false) {
  return `<div class="prompt" id="${id}"><span class="plus">+</span><span class="typed prompt-copy" data-text="${text}"></span>${connections ? `<div class="prompt-connections">${image('salesforce')}${image('gmail')}${image('drive')}</div>` : ''}<span class="send">${image('send')}</span>${cursor()}</div>`;
}
export function title(id, first, second) {
  return `<section class="scene brown" id="${id}"><div class="title"><div>${first}</div><div class="secondary"><span class="typed" data-text="${second}"></span><i class="caret"></i></div></div></section>`;
}
export function agentList() {
  return `<div class="agent-list"><header><span>⌄ &nbsp; Deal Tracker agents</span><span><b>✓ 4</b> &nbsp; 4 agents</span></header>${agents.map(([color, name, description]) => `<div class="agent-row">${image('agent-' + color)}<div><strong>${name}</strong><span>${description}</span></div></div>`).join('')}</div>`;
}
export function dots(color, id) {
  return `<div class="dot-agent ${color}" id="${id}"><div class="dot-pill"></div><div class="dot-pointer"></div></div>`;
}
export function scene(id, className, content) {
  return `<section id="${id}" class="scene ${className}">${content}</section>`;
}
