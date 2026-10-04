import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishHtml } from './html-publish';
import { createRenderDocument, createStillDocument } from '@beam/engine';
import type { AgentClient, HtmlPublishArguments } from './agent-types';
import type { MediaAsset } from '@beam/engine/shared/composition-types';
import type { HtmlComposition } from '@beam/engine/html/html-types';

const bundle = vi.hoisted(() => ({ prepare: vi.fn(), dispose: vi.fn() }));
vi.mock('./html-bundle', () => ({ prepareHtmlBundle: bundle.prepare }));
const input = (): HtmlPublishArguments => ({
  projectId: 'project',
  expectedRevision: 0,
  entry: 'index.html',
  width: 64,
  height: 64,
  durationMs: 1000,
});
beforeEach(() => {
  vi.clearAllMocks();
  bundle.prepare.mockResolvedValue({
    sourceDirectory: '/source',
    bundleDirectory: '/bundle',
    entry: 'index.html',
    dispose: bundle.dispose,
  });
});
function client(document: object = createRenderDocument()) {
  const call = vi.fn(async (tool: string, args: Record<string, unknown>): Promise<unknown> => {
    if (tool === 'assets.resolve') return { path: '/references/reference.png' };
    if (tool === 'html.stage')
      return {
        id: 'asset',
        kind: 'image',
        origin: 'project',
        name: 'HTML',
        fileName: 'preview.png',
        src: '/preview.png',
        width: 64,
        height: 64,
        durationMs: 0,
        html: args.html as HtmlComposition,
      } satisfies MediaAsset;
    const request = args.request as { method: string };
    return request.method === 'snapshot'
      ? { ok: true, result: { documentId: 'project', revision: 0, document } }
      : { ok: true, result: { revision: 1 } };
  });
  return { call, host: { call } as AgentClient };
}
describe('HTML publication lifecycle', () => {
  it('resolves project references before compiling and disposes the bundle after a versioned transaction', async () => {
    const { host, call } = client();
    const result = await publishHtml(
      host,
      {
        ...input(),
        references: [
          { name: 'feature.png', source: 'project-media://screenshot/source', projectId: 'reference-project' },
        ],
      },
      '/working',
    );
    expect(result.revision).toBe(1);
    expect(result.layerId).toBeTruthy();
    expect(call).toHaveBeenCalledWith('assets.resolve', {
      projectId: 'reference-project',
      source: 'project-media://screenshot/source',
    });
    expect(bundle.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        references: [{ name: 'feature.png', source: '/references/reference.png', projectId: 'reference-project' }],
      }),
      '/working',
    );
    expect(bundle.dispose).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid revisions, stale revisions, absent targets and animated stills before compiling', async () => {
    const { host, call } = client();
    await expect(publishHtml(host, { ...input(), expectedRevision: -1 }, '.')).rejects.toThrow('expectedRevision');
    call.mockResolvedValueOnce({
      ok: true,
      result: { documentId: 'project', revision: 2, document: createRenderDocument() },
    });
    await expect(publishHtml(host, input(), '.')).rejects.toThrow('Revision conflict');
    await expect(publishHtml(host, { ...input(), layerId: 'missing' }, '.')).rejects.toThrow('existing HTML');
    await expect(
      publishHtml(client(createStillDocument('project', '/source.png', 64, 64)).host, input(), '.'),
    ).rejects.toThrow('durationMs');
    expect(bundle.prepare).not.toHaveBeenCalled();
  });
  it('preserves the previous editor state after stage/transaction failure and disposes staged compilation', async () => {
    const { host, call } = client();
    call.mockImplementation(async (tool) => {
      if (tool === 'html.stage') throw new Error('Renderer failure');
      return { ok: true, result: { documentId: 'project', revision: 0, document: createRenderDocument() } };
    });
    await expect(publishHtml(host, input(), '.')).rejects.toThrow('Renderer failure');
    expect(bundle.dispose).toHaveBeenCalledTimes(1);
    const other = client();
    const original = other.call.getMockImplementation()!;
    other.call.mockImplementation(async (tool, args) =>
      (args.request as { method: string } | undefined)?.method === 'transaction'
        ? { ok: false, error: { message: 'Revision changed during build.' } }
        : original(tool, args),
    );
    await expect(publishHtml(other.host, input(), '.')).rejects.toThrow('Revision changed');
    expect(bundle.dispose).toHaveBeenCalledTimes(2);
  });
});
