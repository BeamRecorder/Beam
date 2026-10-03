import { describe, it, expect, vi } from 'vitest';
import { callAgentTool } from './agent-tools';
import { createRenderDocument, createStillDocument } from '@beam/engine';
import type { AgentClient } from './agent-types';
import { readAgentDocs } from './agent-docs';

const hooks = vi.hoisted(() => ({
  export: vi.fn(async () => ({ path: '/output' })),
  publish: vi.fn(async () => ({ layerId: 'layer' })),
}));
vi.mock('./export-backends', () => ({ exportWithBackend: hooks.export }));
vi.mock('./html-publish', () => ({ publishHtml: hooks.publish, readLiveDocument: vi.fn() }));
const video = () => ({
  projectName: 'Video',
  format: 'webm',
  preset: 'high',
  snapshot: createRenderDocument(undefined, 64, 64),
});
describe('agent export and host tool routing', () => {
  it('exports stills with the existing document settings and refuses timeline capture for images', async () => {
    const call = vi.fn(async () => ({
      kind: 'image',
      document: createStillDocument('project', '/source.png', 64, 64),
    }));
    const client = { call } as AgentClient;
    expect(
      await callAgentTool(
        'render.export',
        { projectId: 'project', output: 'image.png', overwrite: true },
        '/work',
        undefined,
        client,
      ),
    ).toHaveProperty('path');
    expect(hooks.export).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'image' }),
      '/work',
      '/work/image.png',
      { backend: 'webcodecs', overwrite: true },
    );
    await expect(
      callAgentTool(
        'render.frame',
        { projectId: 'project', output: 'image.png', timeMs: 0 },
        '/work',
        undefined,
        client,
      ),
    ).rejects.toThrow('video project');
  });
  it('exports current video snapshots and validates exact frame boundaries', async () => {
    const client = { call: vi.fn(async () => video()) } as AgentClient;
    await callAgentTool(
      'render.export',
      { projectId: 'project', output: 'video.webm', format: 'webm', preset: 'low' },
      '/work',
      undefined,
      client,
    );
    expect(client.call).toHaveBeenCalledWith('documents.export', {
      projectId: 'project',
      format: 'webm',
      preset: 'low',
    });
    await callAgentTool(
      'render.frame',
      { projectId: 'project', output: 'frame.png', timeMs: 0 },
      '/work',
      undefined,
      client,
    );
    expect(hooks.export).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'frame', timeMs: 0 }),
      '/work',
      '/work/frame.png',
      { backend: 'webcodecs', overwrite: false },
    );
    await expect(
      callAgentTool(
        'render.frame',
        { projectId: 'project', output: 'frame.png', timeMs: 34 },
        '/work',
        undefined,
        client,
      ),
    ).rejects.toThrow('inside the video');
  });
  it('resolves import paths and forwards host tools and validated HTML publications', async () => {
    const client = { call: vi.fn(async () => ({})) } as AgentClient;
    await callAgentTool(
      'assets.import',
      { projectId: 'project', kind: 'image', source: 'feature.png' },
      '/work',
      undefined,
      client,
    );
    expect(client.call).toHaveBeenLastCalledWith('assets.import', {
      projectId: 'project',
      kind: 'image',
      source: '/work/feature.png',
    });
    await callAgentTool('html.source', { projectId: 'project', html: {} }, '/work', undefined, client);
    expect(client.call).toHaveBeenLastCalledWith('html.source', { projectId: 'project', html: {} });
    await callAgentTool(
      'html.publish',
      { projectId: 'project', expectedRevision: 0, entry: 'index.html', width: 64, height: 64, durationMs: 0 },
      '/work',
      undefined,
      client,
    );
    expect(hooks.publish).toHaveBeenCalledWith(client, expect.objectContaining({ entry: 'index.html' }), '/work');
    expect(await callAgentTool('instances.list', {}, '/work', undefined, client)).toHaveProperty('instances');
  });
  it('fails clearly when an installed documentation bundle is absent', async () => {
    vi.stubEnv('BEAM_COMPILED_CLI', 'true');
    try {
      await expect(readAgentDocs('agent')).rejects.toThrow('ENOENT');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
