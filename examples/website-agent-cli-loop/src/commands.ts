import type { CommandCue } from './scene-types';
// Installed launcher syntax, verified against apps/cli and docs/agent/README.md.
export const commands: readonly CommandCue[] = [
  { label: 'Discover tools & schemas', command: 'beam-cli tools list', start: 0.3, end: 1.1 },
  {
    label: 'Inspect an open project',
    command: 'beam-cli tools call documents.snapshot @project.json',
    start: 1.8,
    end: 2.65,
  },
  {
    label: 'Apply a structured edit',
    command: 'beam-cli tools call documents.transact @edit.json',
    start: 3.4,
    end: 4.25,
  },
];
