import { image, cursor } from './assets.js';
import { scene, agentList } from './components.js';

function node(id, className, x, y, label, detail) {
  return `<div id="${id}" class="workflow-node ${className}" style="left:${x}px;top:${y}px">${image('agent-' + (className === 'purple' ? 'purple' : 'green'))}<div><strong>${label}</strong><span>${detail}</span></div></div>`;
}
export function agentScenes() {
  return [
    scene(
      'agents-list',
      'paper',
      `<div class="agent-list-camera"><div class="agent-outline"></div>${agentList()}</div>`,
    ),
    scene(
      'agents-result',
      'paper',
      `<div class="result-camera">${image('dashboard', 'result-board')}${image('agents-result', 'result-panel')}</div>`,
    ),
    scene(
      'pipeline',
      'paper',
      `<div class="pipeline-camera">${image('dashboard', 'pipeline-plate')}<div class="drag-ghost"></div><div class="deal-drag"><strong>Harbour Logistics — New Business</strong><span>Harbour Logistics</span><b>$90K</b><small>35%</small><span class="monitor-label">Deal Monitor</span>${cursor()}</div></div>`,
    ),
    scene('charts', 'paper', `<div class="chart-camera">${image('charts')}</div>`),
    scene(
      'simple',
      'paper',
      `<div class="split-brown"><div class="split-title"><div>Simple</div><div>to start.</div></div></div><div class="digest-prompt"><header>${image('agent-green')}<div><strong>Weekly Digest</strong><span>Monday email summary of pipeline health, risks, and top…</span></div></header><div class="digest-input"><span class="typed" data-text="Send me the digest on"></span><span class="slack-chip">${image('slack')}<b>Slack</b></span><span class="digest-too">too.</span><i class="caret"></i><span class="plus">+</span><span class="send">${image('send')}</span>${cursor()}</div></div>`,
    ),
    scene(
      'powerful',
      'paper',
      `<div class="split-brown"><div class="split-title"><div>Powerful</div><div>to scale.</div></div></div><div class="workflow-camera"><div class="workflow-grid"></div><div class="workflow-heading">${image('agent-green')}<strong>Weekly Digest</strong></div><div class="workflow-wires"><i></i><i></i><i></i></div>${node('node-input', 'green', 340, 122, 'Input', 'input_start')}${node('node-deals', 'purple', 60, 240, 'Agent', 'You are the Deal & Contract Analyst. Read…')}${node('node-activity', 'purple', 556, 240, 'Agent', 'You are the Activity & Timeline Analyst…')}${node('node-merge', 'green', 340, 382, 'Merge', '{ results: […] }')}${node('node-risks', 'purple', 299, 493, 'Agent', 'You are the Risk Assessor. Using the com…')}${node('node-branch', 'green', 269, 615, 'Branch', 'Critical Pipeline &nbsp;&nbsp; Normal')}${node('node-trigger', 'purple', 84, 826, 'Trigger', 'trigger_riskscan')}</div>`,
    ),
  ].join('');
}
