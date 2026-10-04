// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCaptureCommand } from './native-capture';
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'beam-native-'));
  directories.push(directory);
  const executable = join(directory, 'capture-engine');
  await writeFile(
    executable,
    `#!/usr/bin/env node\nconst fs=require('node:fs');require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const request=JSON.parse(line);fs.appendFileSync(${JSON.stringify(join(directory, 'commands.jsonl'))},JSON.stringify(request)+'\\n');if(request.command==='screenshot')fs.writeFileSync(request.config.output,Buffer.from('native pixels'));process.stdout.write(JSON.stringify({requestId:request.id,ok:request.command!=='invalid',result:{command:request.command},error:{message:'backend rejected'}})+'\\n');});\n`,
    { mode: 0o755 },
  );
  vi.stubEnv('BEAM_CAPTURE_ENGINE', executable);
  vi.stubEnv('XDG_DATA_HOME', directory);
  const config = join(directory, 'config.json');
  await writeFile(config, '{}');
  return {
    directory,
    config,
    commands: async () =>
      (await readFile(join(directory, 'commands.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
  };
}
it.runIf(process.platform !== 'win32')(
  'uses the shared native transport and shuts it down after success or a backend error',
  async () => {
    const state = await setup();
    expect(await runCaptureCommand(['capture', 'capabilities'])).toEqual({ command: 'capabilities' });
    await expect(runCaptureCommand(['capture', 'invalid'])).rejects.toThrow('backend rejected');
    expect((await state.commands()).map((command) => command.command)).toEqual([
      'capabilities',
      'stop',
      'invalid',
      'stop',
    ]);
  },
);
it.runIf(process.platform !== 'win32')('prepares, records and finalizes using Rust commands', async () => {
  const state = await setup();
  expect(await runCaptureCommand(['record', state.config, '.001'])).toEqual({ command: 'stop' });
  expect((await state.commands()).map((command) => command.command)).toEqual(['prepare', 'start', 'stop', 'stop']);
  await expect(runCaptureCommand(['record', state.config, '-1'])).rejects.toThrow('Usage');
});
it.runIf(process.platform !== 'win32')(
  'publishes native screenshots atomically and releases staged directories on destination conflicts',
  async () => {
    const state = await setup(),
      output = join(state.directory, 'image.png');
    expect(await runCaptureCommand(['screenshot', state.config, output])).toMatchObject({ path: output });
    expect(await readFile(output, 'utf8')).toBe('native pixels');
    await expect(runCaptureCommand(['screenshot', state.config, output])).rejects.toThrow();
    expect(
      (await readdir(state.directory)).filter((name) => name.startsWith('.beam-capture-') || name.endsWith('.tmp')),
    ).toEqual([]);
  },
);
