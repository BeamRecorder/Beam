import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { readExportRequest } from './export-request';
import {
  createCompositionCommands,
  createRenderCommands,
  createStillCommands,
  createStillDocument,
  createRenderDocument,
  compositionDurationMs,
  validateStillDocument,
} from '@beam/engine';
import type { DocumentCommand } from '@beam/engine';
import { readDocumentFile } from './document-file';
import { benchmarkDocument } from './benchmark';
import { writeJsonOutput } from '@beam/storage/node/atomic-output';
import { createDocumentHost, serveDocument } from './document-host';
import type { StillDocument } from '@beam/engine';

const help = `beam inspect DOCUMENT
beam create video OUTPUT
beam create image SOURCE WIDTH HEIGHT OUTPUT
beam edit DOCUMENT COMMANDS.json OUTPUT [--overwrite]
beam benchmark DOCUMENT [ITERATIONS]
beam frame REQUEST.json TIME_MS OUTPUT [--overwrite]
beam motion JOB.json OUTPUT [--overwrite]
beam export REQUEST.json OUTPUT [--overwrite]
beam browser install
beam serve DOCUMENT
beam capture COMMAND [PAYLOAD.json]
beam record CONFIG.json SECONDS
beam screenshot CONFIG.json OUTPUT [--overwrite]

DOCUMENT accepts project.json, an export request/snapshot or composition JSON.
Commands are JSON objects {type, payload}; use "beam commands" to list them.
All successful results are JSON on stdout; errors use stderr and exit code 1.`;

export async function runCliCommand(args: string[]) {
  const [command, input, second, output, ...flags] = args;
  if (!command || command === '--help') return { usage: help };
  if (command === 'capture' || command === 'record' || command === 'screenshot') {
    const { runCaptureCommand } = await import('./native-capture');
    return runCaptureCommand(args);
  }
  if (command === 'create') {
    if (input === 'video' && second && args.length === 3) {
      await writeJsonOutput(resolve(second), {
        documentId: randomUUID(),
        projectName: 'Untitled',
        format: 'mp4',
        preset: 'high',
        snapshot: createRenderDocument(),
      });
      return { path: resolve(second) };
    }
    if (input === 'image' && second && output && flags.length === 2) {
      const [height, destination] = flags;
      await writeJsonOutput(
        resolve(destination!),
        createStillDocument(randomUUID(), resolve(second), Number(output), Number(height)),
      );
      return { path: resolve(destination!) };
    }
    throw new Error(help);
  }
  if (command === 'browser' && input === 'install' && args.length === 2) {
    const { installChromium } = await import('./chromium-install');
    return installChromium();
  }
  if (command === 'frame') {
    if (!input || !second || !output || flags.some((flag) => flag !== '--overwrite')) throw new Error(help);
    const request = readExportRequest(JSON.parse(await readFile(resolve(input), 'utf8')) as unknown);
    const timeMs = Number(second);
    if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs >= request.snapshot.duration * 1000)
      throw new RangeError('Frame time must be inside the composition.');
    const { exportInChromium } = await import('./chromium-export');
    const result = await exportInChromium(
      { kind: 'frame', request, timeMs },
      dirname(resolve(input)),
      resolve(output),
      flags.includes('--overwrite'),
    );
    return {
      ...(result as object),
      document: createStillDocument(
        randomUUID(),
        resolve(output),
        request.snapshot.canvas.width,
        request.snapshot.canvas.height,
      ),
    };
  }
  if (command === 'motion') {
    if (!input || !second || (output && output !== '--overwrite') || flags.length) throw new Error(help);
    const { prepareMotionJob } = await import('./motion-job');
    const { exportInChromium } = await import('./chromium-export');
    const prepared = prepareMotionJob(
      JSON.parse(await readFile(resolve(input), 'utf8')) as unknown,
      dirname(resolve(input)),
    );
    return exportInChromium(
      prepared.request,
      dirname(resolve(input)),
      resolve(second),
      output === '--overwrite',
      prepared.host,
    );
  }
  const commands = createCompositionCommands();
  if (command === 'commands' && args.length === 1)
    return { video: createRenderCommands().types, image: createStillCommands().types };
  if (!input || !['inspect', 'edit', 'benchmark', 'export', 'serve'].includes(command)) throw new Error(help);
  const value: unknown = JSON.parse(await readFile(resolve(input), 'utf8'));
  if (command === 'serve' && args.length === 2) return serveDocument(value);
  const still =
    value && typeof value === 'object' && 'kind' in value && value.kind === 'image' ? (value as StillDocument) : null;
  if (still) validateStillDocument(still);
  if (command === 'export') {
    if (!second || (output && output !== '--overwrite') || flags.length) throw new Error(help);
    const { exportInChromium } = await import('./chromium-export');
    return exportInChromium(
      still ? { kind: 'image', document: still } : readExportRequest(value),
      dirname(resolve(input)),
      resolve(second),
      output === '--overwrite',
    );
  }
  if (still && command === 'inspect' && args.length === 2)
    return {
      kind: 'image',
      width: still.state.canvas.width,
      height: still.state.canvas.height,
      layers: still.state.composition?.length ?? 0,
      commands: createStillCommands().types,
    };
  const document = still ? null : readDocumentFile(value);
  if (document && command === 'inspect' && args.length === 2)
    return {
      schemaVersion: document.composition.schemaVersion,
      clips: document.composition.clips.length,
      assets: document.composition.assets.length,
      durationMs: compositionDurationMs(document.composition),
      commands: commands.types,
    };
  if (document && command === 'benchmark' && args.length <= 3)
    return benchmarkDocument(document.composition, second === undefined ? 1000 : Number(second));
  if (command !== 'edit' || !second || !output || flags.some((flag) => flag !== '--overwrite')) throw new Error(help);
  const edits: unknown = JSON.parse(await readFile(resolve(second), 'utf8'));
  if (
    !Array.isArray(edits) ||
    edits.some(
      (edit: unknown) =>
        !edit || typeof edit !== 'object' || !('type' in edit) || typeof edit.type !== 'string' || !('payload' in edit),
    )
  ) {
    throw new TypeError('Expected an array of {type, payload} commands.');
  }
  const host = createDocumentHost(value);
  host.edit(edits as DocumentCommand[]);
  await writeJsonOutput(resolve(output), host.document, flags.includes('--overwrite'));
  return {
    path: resolve(output),
    commandsApplied: edits.length,
    revision: host.revision,
  };
}
