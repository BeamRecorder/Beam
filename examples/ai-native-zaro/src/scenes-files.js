import { image, cursor } from './assets.js';
import { scene, title, prompt, wordmark } from './components.js';

const folderNames = [
  'app-data',
  'aws-dashboard',
  'company-benefits',
  'compliance',
  'config',
  'content-ops',
  'crm',
  'data',
  'demos',
  'docs',
  'documents',
  'email-digests',
];
const files = [
  'design.md',
  'Revenue Dashboard Export - May 2026.csv',
  'Q2 Planning Notes.md',
  'Hiring Pipeline Review.md',
  'Meeting Transcript - Product Sync.md',
];
const sources = [
  'Reading sources…',
  'Searching 2142 Files',
  'Checking Google Docs',
  'Reading Granola',
  'Checking Gmail',
  'Matching the dots',
  'Searching Notion',
  'Read Slack',
  'Scanning database',
  'Indexing Notes',
  'Reviewing Drive',
  'Cross-referencing',
  'Building context',
];
export function fileScenes() {
  return [
    scene(
      'files',
      'paper',
      `<div class="files-camera">${image('files-browser', 'files-browser')}<div class="folder-grid">${folderNames.map((name) => `<div class="folder-card">${image('folder-icon')}<strong>${name}</strong><span>Browse &nbsp; ›</span></div>`).join('')}</div><div class="folder-popup"><header>data <small>56 Files</small></header>${['2026 Product Strategy.md', 'Investor Update - June 2026.md', 'deployment.md', 'Growth Funnel Analysis.md'].map((name) => `<p>${image('file-icon')}<span>${name}</span><small>4.2kb</small></p>`).join('')}</div>${cursor()}</div>`,
    ),
    scene(
      'file-list',
      'paper',
      `<div class="file-list-camera">${files.map((name) => `<div class="file-row">${image('file-icon')}<span>${name}</span></div>`).join('')}</div>`,
    ),
    scene(
      'connections',
      'paper',
      `<div class="connections-card"><div>Connections</div><div class="connections-logos">${image('connection-badges')}<span>+ 12 more</span></div></div>`,
    ),
    title('ask-title', 'Ask anything.', 'Your files answer.'),
    scene('question', 'paper', prompt('question-prompt', 'What did we actually agree to deliver for FluxCo?')),
    scene(
      'answer',
      'paper',
      `<div class="answer-camera">${image('answer-browser')}</div><div class="answer-closeup"><div class="question-bubble">What did we actually agree to deliver for FluxCo?</div><small>just now</small><p>TL;DR: The Contract v3 is the binding document — £48k/year, 40 seats, SSO included, 45-day onboarding (by 29 April), no Success Manager, and FluxCo owes you a case study.</p></div><div class="answer-header"><span>What did we actually agree to deliver for FluxCo?</span><div class="answer-tools">${image('answer-tools')}</div><small>just now</small><p>£48k/year, 40 seats, SSO included, 45-day onboarding<br>and FluxCo owes you a case study.</p>${cursor()}</div>`,
    ),
    scene(
      'sources',
      'paper',
      `<div class="source-list">${sources.map((text, index) => `<div class="source-line" data-source-index="${index}">${text}</div>`).join('')}</div><div class="source-panel">${image('assets-panel')}</div>`,
    ),
    scene(
      'works',
      'paper',
      `<div class="works-title"><div>Workswhere</div><div>you <span class="work-icons">${image('teams')}${image('slack')}${image('telegram')}</span> work.</div></div><div class="phone-panel"><div class="slack-phone"><div class="slack-message"><div class="avatar-orange"></div><div><strong>Dwayne</strong><small>1 minute ago</small><p>What did we actually agree to deliver for FluxCo?</p></div></div><div class="slack-reply"><div class="avatar-zaro">${wordmark('slack-brand')}</div><div><strong>Zaro</strong><small>APP &nbsp; Just now</small><p class="thinking">Thinking…</p><p class="reply-text">SSO free, 45-day onboarding, £48k.<br>SSO was originally a paid add-on — we included it to close.</p><p class="reply-attachment"><span>fluxco_contract_v3.pdf</span> <small>(29 KB)</small></p><p class="reply-link">Link: https://app.zaro.ai/5n43e92m</p></div></div></div><div class="slack-closeup"><div class="slack-message"><div class="avatar-orange"></div><div><strong>Dwayne</strong><small>1 minute ago</small><p>What did we actually agree to deliver for FluxCo?</p></div></div><div class="slack-reply"><div class="avatar-zaro">${wordmark('slack-closeup-brand')}</div><div><strong>Zaro</strong><small>APP &nbsp; Just now</small><p class="thinking">Thinking…</p><p class="reply-text">SSO free, 45-day onboarding, £48k.<br>SSO was originally a paid add-on — we included it to close.</p><p class="reply-attachment"><span>fluxco_contract_v3.pdf</span> <small>(29 KB)</small></p><p class="reply-link">Link: https://app.zaro.ai/5n43e92m</p></div></div></div></div>`,
    ),
  ].join('');
}
