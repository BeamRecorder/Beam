import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { TOOL_CATALOG, describeTool } from './tool-catalog';
import { readAgentDocs } from './agent-docs';
import { listAgentInstances } from './agent-client';
import { callAgentTool } from './agent-tools';
import { watchHtml } from './html-watch';

export async function runAgentCommand(args: string[]) {
  const flagsAt = args.indexOf('--instance');
  let pid: number | undefined;
  if (flagsAt >= 0) {
    pid = Number(args[flagsAt + 1]);
    if (!Number.isSafeInteger(pid) || pid <= 0 || flagsAt + 2 !== args.length)
      throw new Error('Use --instance PID at the end of the command.');
    args = args.slice(0, flagsAt);
  }
  if (args[0] === 'instances' && args.length === 1) return { instances: listAgentInstances() };
  if (args[0] === 'docs' && args.length <= 2) return readAgentDocs(args[1]);
  if (args[0] === 'tools' && args[1] === 'list' && args.length === 2)
    return { protocolVersion: 1, tools: TOOL_CATALOG };
  if (args[0] === 'tools' && args[1] === 'describe' && args.length === 3) return describeTool(args[2]!);
  const isWatch = args[0] === 'html' && args[1] === 'watch';
  const name = isWatch ? 'html.publish' : args[2];
  const raw = args[isWatch ? 2 : 3];
  if ((!isWatch && (args[0] !== 'tools' || args[1] !== 'call')) || !name || args.length > (isWatch ? 3 : 4))
    throw new Error(
      'Use beam tools list | describe NAME | call NAME [JSON|@FILE|-] [--instance PID], beam docs [TOPIC], or beam html watch @FILE.',
    );
  let directory = process.cwd(),
    value: unknown = {};
  if (raw?.startsWith('@')) {
    const file = resolve(raw.slice(1));
    directory = dirname(file);
    value = JSON.parse(await readFile(file, 'utf8'));
  } else if (raw === '-') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw new Error('Tool input exceeds 8 MiB.');
      chunks.push(chunk);
    }
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } else if (raw) value = JSON.parse(raw);
  return isWatch ? watchHtml(value, directory, pid) : callAgentTool(name, value, directory, pid);
}
