import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TOOL_CATALOG, validateToolArguments } from './tool-catalog';
import { createAgentClient, listAgentInstances } from './agent-client';
import { readAgentDocs } from './agent-docs';
import { publishHtml, readLiveDocument } from './html-publish';
import { readExportRequest } from './export-request';
import { validateStillDocument } from '@beam/engine/screenshot/still-document';
import type { DocumentResponse } from '@beam/engine/document/endpoint-types';
import type { HtmlPublishArguments, AgentClient } from './agent-types';
import type { CliRenderJob } from './render-job-types';

export async function callAgentTool(
  name: string,
  input: unknown,
  directory: string,
  pid?: number,
  client?: AgentClient,
) {
  validateToolArguments(name, input);
  if (name === 'tools.list') return { protocolVersion: 1, tools: TOOL_CATALOG };
  if (name === 'docs.read') return readAgentDocs(input.topic as string | undefined);
  if (name === 'instances.list') return { instances: listAgentInstances() };
  const active = client ?? createAgentClient(pid);
  if (name === 'documents.snapshot') return readLiveDocument(active, input.projectId as string);
  if (name === 'html.publish') return publishHtml(active, input as unknown as HtmlPublishArguments, directory);
  if (name === 'documents.transact' || name === 'documents.undo' || name === 'documents.redo') {
    const request =
      name === 'documents.transact'
        ? {
            version: 1,
            id: randomUUID(),
            method: 'transaction',
            transaction: {
              version: 1,
              documentId: input.projectId,
              actorId: 'beam-cli',
              operationId: input.operationId,
              expectedRevision: input.expectedRevision,
              commands: input.commands,
            },
          }
        : { version: 1, id: input.requestId, method: name.split('.')[1], expectedRevision: input.expectedRevision };
    const response = await active.call<DocumentResponse>('documents.request', { projectId: input.projectId, request });
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
    return response.result;
  }
  if (name === 'render.export' || name === 'render.frame') {
    const job = await active.call<CliRenderJob>('documents.export', {
      projectId: input.projectId,
      format: input.format,
      preset: input.preset,
    });
    if ('kind' in job && job.kind === 'image') {
      validateStillDocument(job.document);
      if (name === 'render.frame') throw new Error('render.frame requires a video project.');
    } else if (!('kind' in job)) readExportRequest(job);
    const prepared =
      name === 'render.frame'
        ? { kind: 'frame' as const, request: readExportRequest(job), timeMs: input.timeMs as number }
        : job;
    if ('kind' in prepared && prepared.kind === 'frame' && prepared.timeMs >= prepared.request.snapshot.duration * 1000)
      throw new Error('Frame time must be inside the video timeline.');
    const { exportWithBackend } = await import('./export-backends');
    return exportWithBackend(prepared, directory, resolve(directory, input.output as string), {
      backend: 'webcodecs',
      overwrite: input.overwrite === true,
    });
  }
  if (name === 'assets.import' || name === 'fonts.import') input.source = resolve(directory, input.source as string);
  return active.call(name, input);
}
