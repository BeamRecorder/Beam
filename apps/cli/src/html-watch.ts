import { watch, type FSWatcher } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createAgentClient } from './agent-client';
import { publishHtml, readLiveDocument } from './html-publish';
import { validateToolArguments } from './tool-catalog';
import type { HtmlPublishArguments } from './agent-types';

/** File saves publish complete revisions; pending saves coalesce while a compile is in flight. */
export async function watchHtml(input: unknown, directory: string, pid?: number) {
  validateToolArguments('html.publish', input);
  const args = { ...input } as unknown as HtmlPublishArguments;
  const client = createAgentClient(pid);
  let closed = false,
    pending = false,
    running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = async () => {
    if (running || closed) return;
    running = true;
    try {
      do {
        pending = false;
        try {
          args.expectedRevision = (await readLiveDocument(client, args.projectId)).revision;
          const result = await publishHtml(client, args, directory);
          args.layerId = result.layerId;
          process.stdout.write(JSON.stringify({ event: 'html.published', ...result }) + '\n');
        } catch (error) {
          process.stderr.write(JSON.stringify({ event: 'html.error', error: String(error) }) + '\n');
        }
      } while (pending && !closed);
    } finally {
      running = false;
    }
  };
  const changed = (_event: string, file: string | Buffer | null) => {
    if (file && /(^|[/\\])(node_modules|\.git|dist|\.beam)([/\\]|$)/.test(String(file))) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void publish();
    }, 250);
  };
  const roots = new Set([
    dirname(resolve(directory, args.entry)),
    ...(args.references ?? [])
      .filter((item) => !item.source.startsWith('project-media:'))
      .map((item) => dirname(resolve(directory, item.source))),
  ]);
  const watchers: FSWatcher[] = [];
  try {
    for (const root of roots) watchers.push(watch(root, { recursive: true }, changed));
  } catch (error) {
    for (const watcher of watchers) watcher.close();
    throw error;
  }
  let end!: () => void;
  const stopped = new Promise<void>((resolveStop) => {
    end = resolveStop;
  });
  const stop = () => {
    closed = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    end();
  };
  for (const watcher of watchers)
    watcher.on('error', (error) => {
      process.stderr.write(`${error.message}\n`);
      stop();
    });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await publish();
    await stopped;
  } finally {
    stop();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
