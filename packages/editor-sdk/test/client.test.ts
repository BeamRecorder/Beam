import { expect, it } from 'vitest';
import { EditorClient, EditorServiceError, EditorSession } from '../src/client.ts';
import type { EditorTransport } from '../src/transport-types.ts';
import type { JobInfo, ProjectInfo, Request, Response, Transaction } from '../src/generated/contracts.ts';
import { assertContract } from '../src/validation.ts';
const id = '00000000-0000-4000-8000-000000000001';
const project: ProjectInfo = { id, activeSequence: id, name: 'test', revision: 0, canvas: { width: 64, height: 64, fps: 30, fpsDenominator: 1, background: 0 }, recordingStyle: { version: 1, cursor: { enabled: true, shape: 'pointer', size: 24, color: [1, 1, 1, 1], borderColor: [0.08, 0.08, 0.08, 1], smoothingMs: 60, hideAfterMs: 3000, clicks: true }, zoom: { scale: 2, entryMs: 500, exitMs: 500, followCursor: true } }, assetCount: 0, sequenceCount: 1, canUndo: false, canRedo: false, canProjectUndo: false, canProjectRedo: false, recovered: false, warnings: [] };
const job: JobInfo = { id, projectId:id,scope:{kind:'sequence',sequenceId:id},kind:{kind:'export',container:'webm'},revision: 0, phase: 'rendering', progress: 0, error: null,snapshotId:null,sourceVersions:{},artifacts:[] };
class Transport implements EditorTransport {
  requests: Request[] = []; closed = false;
  constructor(private responses: Response[] = []) {}
  async request(request: Request): Promise<Response> { assertContract('Request', request); this.requests.push(request); const response = this.responses.shift(); if (!response) throw new Error('Unexpected request'); return response; }
  close(): void { this.closed = true; }
}
const receipt: Response = { type: 'receipt', receipt: { revision: 1, sequenceId: id, idempotencyKey: 'key', fingerprint: 'hash', results: [] } };
const imported: Extract<Response,{type:'imported'}> = {type:'imported',project,publication:{projectId:id,sequenceId:id,revision:1,idempotencyKey:'import-key',fingerprint:'a'.repeat(64),assetIds:[id],clipIds:[id]}};
const transaction: Transaction = { apiVersion: 1, projectId: id, sequenceId: id, expectedRevision: 0, idempotencyKey: 'key', commands: [{ commandId: 'a', operation: { type: 'edit', edit: { type: 'rename', name: 'new' } } }] };
it('maps open, import, pages, discovery and export to shared requests', async () => {
  const transport = new Transport([
    { type: 'discovery', capabilities: { apiVersion: 1, documentVersion: 2, exports: [], platform: 'test', rendering: false, processors: [], pageLimit: 256, messageBudgetBytes: 8388608 } },
    { type: 'project', project }, { type: 'project', project }, imported,
    { type: 'project', project }, { type: 'clips', page: { revision: 0, total: 0, items: [], next: null } },
    { type: 'job', job }, { type: 'job', job }, { type: 'job', job: { ...job, phase: 'cancelled' } },
  ]);
  const client = new EditorClient(transport);
  expect((await client.discover()).rendering).toBe(false);
  const created = await client.create('p', 'test'); expect(created.info.id).toBe(id);
  const opened = await client.open('p'); expect(await opened.import(['s'],'import-key')).toEqual(imported.publication); await opened.refresh();
  expect(transport.requests[3]).toEqual({method:'import',context:{projectId:id,sequenceId:id,expectedRevision:0,idempotencyKey:'import-key'},sourceGrants:['s']});
  expect((await client.query({ kind: 'clips', sequenceId: id, offset: 0, limit: 1 })).page.total).toBe(0);
  await opened.export('d', 'out.webm', 'webm'); await client.job(id); expect((await client.cancelJob(id)).phase).toBe('cancelled');
  client.close(); expect(transport.closed).toBe(true);
});
it('uses dedicated import publications for replay and source job contexts without false sequence IDs',async()=>{
  const transport=new Transport([imported,imported,{type:'error',error:{code:'conflict',message:'stale',expectedRevision:0,actualRevision:1}}]);
  const session=new EditorSession(new EditorClient(transport),project);
  const context=session.renderContext('import-key');
  expect((await session.client.import(context,['source'])).publication).toEqual(imported.publication);
  expect((await session.client.import(context,['new-grant'])).publication).toEqual(imported.publication);
  await expect(session.client.import(context,['new-grant'])).rejects.toBeInstanceOf(EditorServiceError);
  expect(session.sourceContext(id,'analysis-key')).toEqual({projectId:id,assetId:id,expectedRevision:0,idempotencyKey:'analysis-key'});
  expect(session.sourceContext(id).idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
});
it('seals extension packs through the shared Rust authority and queries versioned presets', async () => {
  const draft = { id:'example.pack',namespace:'example',version:1,definitions:[],presets:[] };
  const pack = { ...draft,sha256:'a'.repeat(64) };
  const transport = new Transport([{ type:'pack',pack },{ type:'presets',page:{revision:0,total:0,items:[],next:null} }]);
  const client = new EditorClient(transport);
  expect(await client.sealPack(draft)).toEqual(pack);
  expect(transport.requests[0]).toEqual({method:'sealPack',pack:draft});
  expect((await client.query({kind:'presets',offset:0,limit:1})).page.total).toBe(0);
});
it('passes the project scope and expected revision to native garbage collection', async () => {
  const result = { retainedBlocks: 4, removedBlocks: 2, freedBytes: 128 };
  const transport = new Transport([{ type: 'garbageCollection', result }, { type: 'error', error: { code: 'conflict', message: 'stale', expectedRevision: 0, actualRevision: 1 } }]);
  const client = new EditorClient(transport);
  expect(await client.garbageCollect(id, 0)).toEqual(result);
  expect(transport.requests[0]).toEqual({ method: 'garbageCollect', projectId: id, expectedRevision: 0 });
  await expect(client.garbageCollect(id, 0)).rejects.toBeInstanceOf(EditorServiceError);
});
it('relinks explicit clips through a source grant and refreshes the accepted revision', async () => {
  const transport = new Transport([receipt,{type:'project',project:{...project,revision:1}}]);
  const session = new EditorSession(new EditorClient(transport),project);
  expect(await session.relink(id,'source-grant',[id],'source-version')).toEqual(receipt.type==='receipt'?receipt.receipt:undefined);
  expect(transport.requests[0]).toEqual({method:'relink',context:{projectId:id,sequenceId:id,expectedRevision:0,idempotencyKey:'source-version'},assetId:id,sourceGrant:'source-grant',clipIds:[id]});
  expect(session.info.revision).toBe(1);
});
it('builds revisioned transactions, dry runs, durable IDs and undo/redo', async () => {
  const transport = new Transport([receipt, { type: 'project', project: { ...project, revision: 1 } }, receipt, receipt, { type: 'project', project }, receipt, { type: 'project', project }]);
  const session = new EditorSession(new EditorClient(transport), project);
  await session.batch((batch) => { batch.edit({ type: 'rename', name: 'new' }); }, { idempotencyKey: 'key' });
  expect(transport.requests[0]).toMatchObject({ method: 'transaction', transaction: { expectedRevision: 0, idempotencyKey: 'key' } });
  expect(session.info.revision).toBe(1);
  await session.batch((batch) => { batch.edit({ type: 'rename', name: 'dry' }); }, { dryRun: true });
  expect(transport.requests[2]).toMatchObject({ method: 'validateTransaction' }); expect(session.info.revision).toBe(1);
  await session.undo(); await session.redo();
  expect(transport.requests[3]).toMatchObject({ transaction: { commands: [{ operation: { edit: { type: 'undo' } } }] } });
  expect(transport.requests[5]).toMatchObject({ transaction: { commands: [{ operation: { edit: { type: 'redo' } } }] } });
});
it('preserves structured conflicts and rejects unexpected result kinds', async () => {
  const detail = { code: 'conflict' as const, message: 'stale', expectedRevision: 0, actualRevision: 1 };
  const client = new EditorClient(new Transport([{ type: 'error', error: detail }, { type: 'acknowledged' }]));
  try { await client.commit(transaction); throw new Error('missing error'); } catch (error) { expect(error).toBeInstanceOf(EditorServiceError); expect((error as EditorServiceError).detail).toEqual(detail); }
  await expect(client.project()).rejects.toThrow('Expected project');
  await expect(EditorClient.connect('/unused', '/tmp/missing-beam-token')).rejects.toThrow();
});
it('waits for jobs, detects mismatched identity, failure, cancellation and abort', async () => {
  const complete = new EditorClient(new Transport([{ type: 'job', job }, { type: 'job', job: { ...job, phase: 'completed' } }]));
  expect((await complete.waitForJob(id, { intervalMs: 1 })).phase).toBe('completed');
  for (const [result, text] of [[{ ...job, id: 'other' }, 'differs'], [{ ...job, phase: 'failed' as const, error: 'encoder' }, 'encoder'], [{ ...job, phase: 'failed' as const,error:null }, 'Rendering failed']] as const) {
    await expect(new EditorClient(new Transport([{ type: 'job', job: result }])).waitForJob(id)).rejects.toThrow(text);
  }
  expect((await new EditorClient(new Transport([{ type: 'job', job: { ...job, phase: 'cancelled' } }])).waitForJob(id)).phase).toBe('cancelled');
  await expect(complete.waitForJob(id, { intervalMs: 0 })).rejects.toThrow('positive');
  await expect(new EditorClient(new Transport([{ type: 'job', job }])).waitForJob(id, { signal: AbortSignal.abort() })).rejects.toThrow('cancelled');
  const abort = new AbortController(); const waiting = new EditorClient(new Transport([{ type: 'job', job }])).waitForJob(id, { intervalMs: 1000, signal: abort.signal }); setTimeout(() => abort.abort(), 1);
  await expect(waiting).rejects.toThrow('cancelled');
});
it('pins preview/export context and reads bounded opaque artifact chunks',async()=>{
  const data={artifactId:id,offset:0,byteLength:4,dataBase64:'dGVzdA==',next:null};
  const transport=new Transport([{type:'job',job},{type:'job',job},{type:'artifactData',data}]);
  const session=new EditorSession(new EditorClient(transport),project);
  await session.preview({ticks:0,timescale:1000},'half','preview-key');
  await session.export('d','file.webm','webm','export-key');
  expect(transport.requests[0]).toMatchObject({method:'previewRender',context:{projectId:id,sequenceId:id,expectedRevision:0,idempotencyKey:'preview-key'},quality:'half'});
  expect(transport.requests[1]).toMatchObject({method:'export',context:{idempotencyKey:'export-key'}});
  expect(await session.client.artifact(id)).toEqual(data);
  for(const [offset,length] of [[-1,1],[0,0],[0,262145],[0,1.5]]) await expect(session.client.artifact(id,offset,length)).rejects.toThrow('Artifact chunks');
});
it('starts versioned source analysis and proxies without inventing sequence scope',async()=>{
  const settings={container:'webm' as const,width:128,height:96,frameRate:{numerator:30000,denominator:1001}};
  const sourceJob:JobInfo={...job,scope:{kind:'source',assetId:id},kind:{kind:'analysis',algorithm:'zoomClicksV1'}};
  const transport=new Transport([{type:'job',job:sourceJob},{type:'job',job:{...sourceJob,kind:{kind:'proxy',settings}}}]);
  const session=new EditorSession(new EditorClient(transport),project);
  expect((await session.analyze(id,'zoomClicksV1','analysis-key')).scope).toEqual({kind:'source',assetId:id});
  expect((await session.proxy(id,settings,'proxy-key')).kind).toEqual({kind:'proxy',settings});
  expect(transport.requests[0]).toEqual({method:'analysisStart',context:{projectId:id,assetId:id,expectedRevision:0,idempotencyKey:'analysis-key'},algorithm:'zoomClicksV1'});
  expect(transport.requests[1]).toEqual({method:'proxyStart',context:{projectId:id,assetId:id,expectedRevision:0,idempotencyKey:'proxy-key'},settings});
});
it('streams revisioned events and leaves idle clients unpolled', async () => {
  const event = { revision: 1, sequenceId: id, commandIds: ['a'] };
  const transport = new Transport([{ type: 'events', page: { revision: 1, total: 1, next: 1, items: [event] } }, { type: 'events', page: { revision: 2, total: 1, next: null, items: [{ ...event, revision: 2 }] } }]);
  const client = new EditorClient(transport); const events = client.events(0);
  expect(transport.requests).toHaveLength(0); expect((await events.next()).value).toEqual(event); expect((await events.next()).value?.revision).toBe(2); await events.return(undefined);
  expect(transport.requests[1]).toMatchObject({ afterRevision: 1 });
  const aborted = new AbortController(); const idle = new EditorClient(new Transport([{ type: 'events', page: { revision: 0, total: 0, next: null, items: [] } }])).events(0, { intervalMs: 1000, signal: aborted.signal });
  const pending = idle.next(); setTimeout(() => aborted.abort(), 1); await expect(pending).rejects.toThrow('cancelled');
  await expect(client.events(0, { intervalMs: 0 }).next()).rejects.toThrow('positive');
  expect(await client.events(0, { signal: AbortSignal.abort() }).next()).toEqual({ done: true, value: undefined });
});
it('reads lightweight headers and revisioned values with explicit scope addresses',async()=>{
  const target={kind:'track' as const,sequenceId:id,trackId:id};const time={ticks:1500,timescale:1000};
  const headers:Extract<Response,{type:'clipHeaders'}>={type:'clipHeaders',page:{revision:7,total:0,items:[],next:null}};
  const values:Extract<Response,{type:'scopedParameterValues'}>={type:'scopedParameterValues',revision:7,target,time,values:{}};
  const transport=new Transport([headers,values]);const client=new EditorClient(transport);
  expect(await client.clipHeaders(id,4,32)).toEqual(headers);
  expect(await client.parameters(target,time)).toEqual(values);
  expect(transport.requests).toEqual([{method:'query',query:{kind:'clipHeaders',sequenceId:id,offset:4,limit:32}},{method:'query',query:{kind:'scopedParameterValues',target,time}}]);
});
it('starts an actual async import request and exposes its sequence-scoped job',async()=>{
  const importing:JobInfo={...job,kind:{kind:'import',sourceCount:2},phase:'queued'};
  const transport=new Transport([{type:'job',job:importing}]);const session=new EditorSession(new EditorClient(transport),project);
  expect(await session.importStart(['source-one','source-two'],'import-job')).toEqual(importing);
  expect(transport.requests).toEqual([{method:'importStart',context:{projectId:id,sequenceId:id,expectedRevision:0,idempotencyKey:'import-job'},sourceGrants:['source-one','source-two']}]);
  expect(session.info.revision).toBe(0);
});
