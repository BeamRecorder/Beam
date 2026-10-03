import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const topics = {
  agent: 'docs/agent/README.md',
  html: 'docs/agent/html-compositions.md',
  gradients: 'docs/architecture/gradient-effects.md',
  commands: 'docs/architecture/authoring-protocol.md',
  architecture: 'docs/ARCHITECTURE.md',
};
export async function readAgentDocs(topic = 'agent') {
  if (!Object.hasOwn(topics, topic))
    throw new Error(`Unknown documentation topic. Choose ${Object.keys(topics).join(', ')}.`);
  const path = topics[topic as keyof typeof topics];
  const root = dirname(fileURLToPath(import.meta.url));
  const local = resolve(root, process.env.BEAM_COMPILED_CLI === 'true' ? '.' : '../../..', path);
  return {
    topic,
    path: local,
    github: `https://github.com/BeamRecorder/Beam/blob/main/${path}`,
    content: await readFile(local, 'utf8'),
    topics,
    next: [
      'beam tools list',
      'beam instances',
      'beam tools call projects.list',
      'beam docs html',
      'beam docs commands',
    ],
  };
}
