import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectState } from '../scripts/publish-types';
import type { ToolCall } from './publish-types';

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
vi.mock('node:child_process', () => ({ default: { spawnSync: mocks.spawnSync }, spawnSync: mocks.spawnSync }));
vi.mock('node:fs', () => ({
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    mkdirSync: mocks.mkdirSync,
  },
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  mkdirSync: mocks.mkdirSync,
}));

let calls: ToolCall[];
let state: ProjectState | undefined;
let ready: boolean;
let cancel: boolean;
let failTool: string | undefined;
let failureDetail: 'stderr' | 'stdout' | 'empty';
let hasAudio: boolean;
let listCount: number;
let delayLists: number;
const originalArguments = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv('BEAM_INSTANCE', '');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  calls = [];
  state = undefined;
  ready = false;
  cancel = false;
  hasAudio = false;
  failTool = undefined;
  failureDetail = 'stderr';
  listCount = 0;
  delayLists = 0;
  process.argv = ['bun', 'publish.ts'];
  mocks.existsSync.mockImplementation((path: string) => (path.endsWith('project.json') ? !!state : true));
  mocks.readFileSync.mockImplementation((path: string) =>
    path.endsWith('.wav') ? Buffer.from('score') : JSON.stringify(state),
  );
  mocks.spawnSync.mockImplementation((_launcher: string, arguments_: string[]) => {
    const index = arguments_.indexOf('call');
    const name = arguments_[index + 1]!;
    const input = JSON.parse(arguments_[index + 2]!) as Record<string, unknown>;
    calls.push({ name, input });
    if (name === failTool)
      return {
        status: 1,
        stderr: failureDetail === 'stderr' ? 'Beam failed' : '',
        stdout: failureDetail === 'stdout' ? 'Beam failed' : '',
      };
    let result: unknown = {};
    if (name === 'projects.create') result = { id: 'project' };
    if (name === 'projects.open') {
      ready = !cancel;
      result = { status: cancel ? 'cancelled' : 'opened' };
    }
    if (name === 'projects.list')
      result = { open: ready && listCount++ >= delayLists ? [{ projectId: 'project' }] : [] };
    if (name === 'documents.snapshot')
      result = {
        revision: 4,
        document: {
          canvas: { width: 1920, height: 1080, showBackground: true, watermark: { enabled: true, text: 'beam' } },
          composition: { clips: hasAudio ? [{ id: 'audio-clip' }] : [] },
        },
      };
    if (name === 'html.publish') result = { layerId: 'html-layer', revision: 5 };
    if (name === 'assets.import')
      result = {
        id: 'audio-asset',
        kind: 'audio',
        src: 'project-media://score',
        fileName: 'score.wav',
        durationMs: 0,
        width: null,
        height: null,
        origin: 'project',
      };
    return { status: 0, stderr: '', stdout: JSON.stringify(result) };
  });
});
afterEach(() => {
  process.argv = originalArguments;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const publish = () => import('../scripts/publish');
describe('Beam project publication', () => {
  it('creates a separate editor, publishes timed HTML and adds its complete soundtrack', async () => {
    await publish();
    expect(calls.find((call) => call.name === 'projects.create')?.input).toEqual({ kind: 'video', name: 'Ai-Native' });
    expect(calls.find((call) => call.name === 'projects.open')?.input).toEqual({ projectId: 'project', kind: 'video' });
    expect(calls.find((call) => call.name === 'html.publish')?.input).toMatchObject({
      durationMs: 15000,
      fps: 30,
      width: 1920,
      height: 1080,
    });
    expect(calls.find((call) => call.name === 'documents.transact')?.input.commands).toEqual([
      expect.objectContaining({
        type: 'render.patch',
        payload: expect.objectContaining({
          canvas: expect.objectContaining({ showBackground: false, watermark: { enabled: false, text: 'beam' } }),
        }),
      }),
      expect.objectContaining({
        type: 'asset.add',
        payload: expect.objectContaining({ id: 'audio-asset', durationMs: 15000 }),
      }),
      expect.objectContaining({
        type: 'clip.add',
        payload: expect.objectContaining({
          assetId: 'audio-asset',
          timelineDurationMs: 15000,
          role: 'imported',
          volume: 100,
        }),
      }),
      expect.objectContaining({ type: 'clip.volume', payload: expect.objectContaining({ volume: 100 }) }),
    ]);
  });
  it('updates the remembered layer without opening another window or duplicating audio', async () => {
    state = {
      projectId: 'project',
      layerId: 'existing-html',
      audioClipId: 'audio-clip',
      audioHash: createHash('sha256').update('score').digest('hex'),
    };
    ready = true;
    hasAudio = true;
    await publish();
    expect(calls.map((call) => call.name)).not.toContain('projects.create');
    expect(calls.map((call) => call.name)).not.toContain('projects.open');
    expect(calls.map((call) => call.name)).not.toContain('assets.import');
    expect(calls.find((call) => call.name === 'html.publish')?.input.layerId).toBe('existing-html');
  });
  it('restores audio when its remembered clip was removed from the project', async () => {
    state = {
      projectId: 'project',
      audioClipId: 'audio-clip',
      audioHash: createHash('sha256').update('score').digest('hex'),
    };
    ready = true;
    await publish();
    expect(calls.map((call) => call.name)).toContain('assets.import');
  });
  it('replaces a changed soundtrack in place and restores its audible gain', async () => {
    state = { projectId: 'project', audioClipId: 'audio-clip', audioHash: 'old' };
    ready = true;
    hasAudio = true;
    await publish();
    const commands = calls.find((call) => call.name === 'documents.transact')?.input.commands;
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'asset.add' }),
        {
          type: 'clip.patch',
          payload: { clipId: 'audio-clip', patch: { assetId: 'audio-asset', name: 'CC0 music + impacts' } },
        },
        { type: 'clip.volume', payload: { clipId: 'audio-clip', volume: 100 } },
      ]),
    );
    expect(commands).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'clip.add' })]));
  });
  it('waits for the document registration instead of publishing into a loading editor', async () => {
    delayLists = 2;
    const pending = publish();
    await vi.runAllTimersAsync();
    await pending;
    expect(calls.filter((call) => call.name === 'projects.list')).toHaveLength(4);
  });
  it('fails explicitly when an editor never registers', async () => {
    delayLists = 100;
    const pending = expect(publish()).rejects.toThrow('not ready');
    await vi.runAllTimersAsync();
    await pending;
    expect(calls.map((call) => call.name)).not.toContain('html.publish');
  });
  it('stops immediately after a canceled opening', async () => {
    cancel = true;
    await expect(publish()).rejects.toThrow('canceled');
    expect(calls.map((call) => call.name)).not.toContain('html.publish');
  });
  it.each(['stderr', 'stdout', 'empty'] as const)('preserves CLI failure details from %s', async (detail) => {
    failureDetail = detail;
    failTool = 'projects.create';
    await expect(publish()).rejects.toThrow(detail === 'empty' ? 'Beam CLI failed' : 'Beam failed');
  });
  it('uses the installed CLI and explicit instance selection when exporting', async () => {
    mocks.existsSync.mockImplementation((path: string) => (path.endsWith('project.json') ? !!state : false));
    vi.stubEnv('BEAM_INSTANCE', '12345');
    process.argv.push('--export');
    await publish();
    expect(mocks.spawnSync.mock.calls[0]?.slice(0, 2)).toMatchObject([
      'beam-cli',
      expect.arrayContaining(['--instance', '12345']),
    ]);
    expect(calls.find((call) => call.name === 'render.export')?.input).toMatchObject({
      format: 'mp4',
      overwrite: true,
    });
  });
});
