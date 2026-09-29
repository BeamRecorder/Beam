import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AnalysisAlgorithm, ArtifactData, Capabilities, Container, Event, ExtensionPack, GarbageCollection, ImportPublication, JobInfo, PackDraft, ProjectInfo, ProxySettings, Query, ReadTarget, Receipt, RenderContext, RenderQuality, Request, Response, ServiceError, SourceContext, Time, Transaction } from './generated/contracts.ts';
import { API_VERSION } from './generated/contracts.ts';
import { Batch } from './batch.ts';
import { EditorConnection } from './transport.ts';
import type { EditorTransport, RequestOptions } from './transport-types.ts';
import type { CommitOptions, PollOptions } from './client-types.ts';

export class EditorServiceError extends Error {
  constructor(readonly detail: ServiceError) { super(detail.message); this.name = 'EditorServiceError'; }
}

async function pause(intervalMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('Request cancelled');
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Request cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, intervalMs);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class EditorClient {
  constructor(readonly transport: EditorTransport) {}
  static async connect(endpoint: string, tokenFile: string): Promise<EditorClient> {
    const token = (await readFile(tokenFile, 'utf8')).trim();
    return new EditorClient(await EditorConnection.connect({ endpoint, token }));
  }
  async invoke<T extends Response['type']>(request: Request, type: T, options?: RequestOptions): Promise<Extract<Response, { type: T }>> {
    const response = await this.transport.request(request, options);
    if (response.type === 'error') throw new EditorServiceError(response.error);
    if (response.type !== type) throw new Error(`Expected ${type}, received ${response.type}`);
    return response as Extract<Response, { type: T }>;
  }
  async discover(): Promise<Capabilities> { return (await this.invoke({ method: 'discovery' }, 'discovery')).capabilities; }
  async sealPack(pack: PackDraft): Promise<ExtensionPack> { return (await this.invoke({ method: 'sealPack', pack }, 'pack')).pack; }
  async garbageCollect(projectId: string, expectedRevision: number): Promise<GarbageCollection> {
    return (await this.invoke({ method: 'garbageCollect', projectId, expectedRevision }, 'garbageCollection')).result;
  }
  query<T extends Query['kind']>(query: Extract<Query, { kind: T }>, options?: RequestOptions): Promise<Extract<Response, { type: T }>> {
    return this.invoke({ method: 'query', query }, query.kind, options);
  }
  async project(): Promise<ProjectInfo> { return (await this.query({ kind: 'project' })).project; }
  clipHeaders(sequenceId: string, offset = 0, limit = 256, options?: RequestOptions): Promise<Extract<Response, { type: 'clipHeaders' }>> {
    return this.query({ kind: 'clipHeaders', sequenceId, offset, limit }, options);
  }
  parameters(target: ReadTarget, time: Time, options?: RequestOptions): Promise<Extract<Response, { type: 'scopedParameterValues' }>> {
    return this.query({ kind: 'scopedParameterValues', target, time }, options);
  }
  async create(projectGrant: string, name: string): Promise<EditorSession> {
    const response = await this.invoke({ method: 'create', projectGrant, name }, 'project');
    return new EditorSession(this, response.project);
  }
  async open(projectGrant: string): Promise<EditorSession> {
    const response = await this.invoke({ method: 'open', projectGrant }, 'project');
    return new EditorSession(this, response.project);
  }
  import(context: RenderContext, sourceGrants: readonly string[]): Promise<Extract<Response, { type: 'imported' }>> {
    return this.invoke({ method: 'import', context, sourceGrants: [...sourceGrants] }, 'imported');
  }
  async importStart(context: RenderContext, sourceGrants: readonly string[]): Promise<JobInfo> {
    return (await this.invoke({ method: 'importStart', context, sourceGrants: [...sourceGrants] }, 'job')).job;
  }
  async relink(context: RenderContext, assetId: string, sourceGrant: string, clipIds: readonly string[]): Promise<Receipt> {
    return (await this.invoke({ method: 'relink', context, assetId, sourceGrant, clipIds: [...clipIds] }, 'receipt')).receipt;
  }
  async commit(transaction: Transaction, options: CommitOptions = {}): Promise<Receipt> {
    const method = options.dryRun ? 'validateTransaction' : 'transaction';
    return (await this.invoke({ method, transaction }, 'receipt', options)).receipt;
  }
  async *events(afterRevision: number, options: PollOptions = {}): AsyncGenerator<Event> {
    const intervalMs = options.intervalMs ?? 250;
    if (!Number.isFinite(intervalMs) || intervalMs < 1) throw new RangeError('Event polling interval must be positive');
    let revision = afterRevision;
    while (!options.signal?.aborted) {
      const { page } = await this.invoke({ method: 'events', afterRevision: revision, limit: 256 }, 'events', options);
      for (const event of page.items) { revision = Math.max(revision, event.revision); yield event; }
      if (page.next === null || page.next === undefined) await pause(intervalMs, options.signal);
    }
  }
  async export(context: RenderContext, destinationGrant: string, fileName: string, container: Container): Promise<JobInfo> {
    return (await this.invoke({ method: 'export', context, destinationGrant, fileName, container }, 'job')).job;
  }
  async preview(context: RenderContext, time: Time, quality: RenderQuality = 'full'): Promise<JobInfo> {
    return (await this.invoke({ method: 'previewRender', context, time, quality }, 'job')).job;
  }
  async analyze(context: SourceContext, algorithm: AnalysisAlgorithm = 'zoomClicksV1'): Promise<JobInfo> {
    return (await this.invoke({ method: 'analysisStart', context, algorithm }, 'job')).job;
  }
  async proxy(context: SourceContext, settings: ProxySettings): Promise<JobInfo> {
    return (await this.invoke({ method: 'proxyStart', context, settings }, 'job')).job;
  }
  async job(id: string, options?: RequestOptions): Promise<JobInfo> { return (await this.invoke({ method: 'jobGet', id }, 'job', options)).job; }
  async cancelJob(id: string): Promise<JobInfo> { return (await this.invoke({ method: 'jobCancel', id }, 'job')).job; }
  async artifact(id: string, offset = 0, length = 256 * 1024, options?: RequestOptions): Promise<ArtifactData> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 256 * 1024) throw new RangeError('Artifact chunks require offset >= 0 and length 1–262144');
    return (await this.invoke({ method: 'artifactRead', id, offset, length }, 'artifactData', options)).data;
  }
  async waitForJob(jobId: string, options: PollOptions = {}): Promise<JobInfo> {
    const intervalMs = options.intervalMs ?? 100;
    if (!Number.isFinite(intervalMs) || intervalMs < 1) throw new RangeError('Job polling interval must be positive');
    for (;;) {
      const job = await this.job(jobId, options);
      if (job.id !== jobId) throw new Error('Job response ID differs from the requested job');
      if (job.phase === 'failed') throw new Error(job.error ?? 'Rendering failed');
      if (job.phase === 'completed' || job.phase === 'cancelled') return job;
      await pause(intervalMs, options.signal);
    }
  }
  close(): void { this.transport.close(); }
}

/** The session carries revision context; every content change is one shared transaction. */
export class EditorSession {
  constructor(readonly client: EditorClient, public info: ProjectInfo) {}
  async refresh(): Promise<ProjectInfo> { this.info = await this.client.project(); return this.info; }
  renderContext(idempotencyKey: string = randomUUID()): RenderContext {
    return { projectId: this.info.id, sequenceId: this.info.activeSequence, expectedRevision: this.info.revision, idempotencyKey };
  }
  sourceContext(assetId: string, idempotencyKey: string = randomUUID()): SourceContext {
    return { projectId: this.info.id, assetId, expectedRevision: this.info.revision, idempotencyKey };
  }
  export(destinationGrant: string, fileName: string, container: Container, idempotencyKey?: string): Promise<JobInfo> {
    return this.client.export(this.renderContext(idempotencyKey), destinationGrant, fileName, container);
  }
  preview(time: Time, quality: RenderQuality = 'full', idempotencyKey?: string): Promise<JobInfo> {
    return this.client.preview(this.renderContext(idempotencyKey), time, quality);
  }
  analyze(assetId: string, algorithm: AnalysisAlgorithm = 'zoomClicksV1', idempotencyKey?: string): Promise<JobInfo> {
    return this.client.analyze(this.sourceContext(assetId, idempotencyKey), algorithm);
  }
  proxy(assetId: string, settings: ProxySettings, idempotencyKey?: string): Promise<JobInfo> {
    return this.client.proxy(this.sourceContext(assetId, idempotencyKey), settings);
  }
  async import(sourceGrants: readonly string[], idempotencyKey?: string): Promise<ImportPublication> {
    const response = await this.client.import(this.renderContext(idempotencyKey), sourceGrants);
    this.info = response.project;
    return response.publication;
  }
  importStart(sourceGrants: readonly string[], idempotencyKey?: string): Promise<JobInfo> {
    return this.client.importStart(this.renderContext(idempotencyKey), sourceGrants);
  }
  async relink(assetId: string, sourceGrant: string, clipIds: readonly string[], idempotencyKey?: string): Promise<Receipt> {
    const receipt = await this.client.relink(this.renderContext(idempotencyKey), assetId, sourceGrant, clipIds);
    await this.refresh();
    return receipt;
  }
  async batch(build: (batch: Batch) => void, options: CommitOptions = {}): Promise<Receipt> {
    const batch = new Batch(); build(batch);
    const receipt = await this.client.commit({
      apiVersion: API_VERSION, projectId: this.info.id, sequenceId: this.info.activeSequence,
      expectedRevision: this.info.revision, idempotencyKey: options.idempotencyKey ?? randomUUID(), commands: batch.commands,
    }, options);
    if (!options.dryRun) await this.refresh();
    return receipt;
  }
  undo(): Promise<Receipt> { return this.batch((batch) => { batch.edit({ type: 'undo' }); }); }
  redo(): Promise<Receipt> { return this.batch((batch) => { batch.edit({ type: 'redo' }); }); }
}
