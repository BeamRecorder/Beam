import { createNativeClient } from './native-client';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createBinaryOutput } from '@beam/storage/node/binary-output';
import { jsonObject } from '@beam/engine/document/json-value';

/** Rust owns discovery, source permissions, recording clocks and capture encoding on every platform. */
export async function runCaptureCommand(args: string[]) {
  const [command, input, output, flag] = args;
  if (!input) throw new Error('Capture requires a command or configuration file.');
  const client = await createNativeClient();
  try {
    if (command === 'capture') {
      if (input === 'serve' && args.length === 2) {
        const lines = createInterface({
          input: process.stdin,
          crlfDelay: Infinity,
        });
        try {
          for await (const line of lines) {
            let id: unknown = null;
            try {
              const request = jsonObject(JSON.parse(line) as unknown);
              id = request.id;
              if (typeof request.command !== 'string' || typeof id !== 'string')
                throw new TypeError('Expected {id, command, payload}.');
              const result = await client.request(request.command, request.payload ? jsonObject(request.payload) : {});
              process.stdout.write(JSON.stringify({ id, ok: true, result }) + '\n');
            } catch (error) {
              process.stdout.write(JSON.stringify({ id, ok: false, error: String(error) }) + '\n');
            }
          }
        } finally {
          lines.close();
        }
        return;
      }
      if (args.length > 3) throw new Error('Usage: beam capture COMMAND [PAYLOAD.json]');
      return await client.request(
        input,
        output ? jsonObject(JSON.parse(await readFile(resolve(output), 'utf8')) as unknown) : {},
      );
    }
    const config = jsonObject(JSON.parse(await readFile(resolve(input), 'utf8')) as unknown);
    if (command === 'record') {
      const seconds = Number(output);
      if (args.length !== 3 || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86400)
        throw new Error('Usage: beam record CONFIG.json SECONDS (0 < seconds <= 86400).');
      await client.request('prepare', { config });
      await client.request('start');
      let cancel: (() => void) | undefined;
      try {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, seconds * 1000);
          cancel = () => {
            clearTimeout(timer);
            resolve();
          };
          process.once('SIGINT', cancel);
          process.once('SIGTERM', cancel);
        });
      } finally {
        if (cancel) {
          process.removeListener('SIGINT', cancel);
          process.removeListener('SIGTERM', cancel);
        }
      }
      return await client.request('stop');
    }
    if (command !== 'screenshot' || !output || (flag && flag !== '--overwrite') || args.length > 4)
      throw new Error('Usage: beam screenshot CONFIG.json OUTPUT [--overwrite]');
    const destination = resolve(output),
      directory = await mkdtemp(join(dirname(destination), '.beam-capture-'));
    try {
      const staged = await createBinaryOutput(destination, flag === '--overwrite');
      try {
        const result = await client.request('screenshot', {
          config: { ...config, output: join(directory, 'source.png') },
        });
        await staged.write(0, await readFile(join(directory, 'source.png')));
        await staged.finalize();
        return { path: destination, result };
      } finally {
        await staged.abort();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  } finally {
    await client.shutdown();
  }
}
