/** Real media scenario: bun scripts/editor/scenario.ts sdk|cli|mcp <beam-editor> <source> <output-root> */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { EditorClient, EditorConnection, McpConnection, constant, curve, keyframe, number, seconds } from '../../packages/editor-sdk/src/index.ts';
import { assertContract } from '../../packages/editor-sdk/src/validation.ts';
import type { EditorTransport, OwnerReady, Request, Response } from '../../packages/editor-sdk/src/index.ts';

async function checksum(path: string): Promise<string> {
  const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes); return hash.digest('hex');
}
const [mode, executable, source, rootArgument, scopeOption] = process.argv.slice(2);
const nativeScopes = scopeOption === "--scopes";
if (scopeOption && !nativeScopes) throw new Error("Unknown scenario option");
if (!mode || !executable || !source || !rootArgument || !['sdk', 'cli', 'mcp'].includes(mode)) throw new Error('usage: scenario.ts sdk|cli|mcp <beam-editor> <source> <output-root>');
const root = resolve(rootArgument); await mkdir(root, { recursive: true, mode: 0o700 });
const projectRoot = join(root, mode); const destination = join(root, 'exports'); await mkdir(destination, { recursive: true });
const before = await checksum(source);
async function startOwner(): Promise<{ process: ReturnType<typeof spawn>; ready: OwnerReady }> {
  const child = spawn(executable!, ['serve', '--project-root', projectRoot, '--source', resolve(source!), '--destination-root', destination], { stdio: 'pipe' });
  let logs = ''; child.stderr!.on('data', (bytes: Buffer) => { logs = (logs + bytes.toString()).slice(-4096); });
  const ready = await new Promise<OwnerReady>((accept, reject) => {
    const lines = createInterface({ input: child.stdout! });
    lines.once('line', (line) => { lines.close(); try { const value: unknown = JSON.parse(line); assertContract('OwnerReady', value); accept(value as OwnerReady); } catch (error) { reject(error); } });
    child.once('error', reject); child.once('exit', (code) => reject(new Error(`Owner exited ${code}: ${logs}`)));
  });
  return { process: child, ready };
}
async function stopOwner(child: ReturnType<typeof spawn>): Promise<void> {
  child.stdin!.end(); const timer = setTimeout(() => child.kill(), 5000); timer.unref();
  await new Promise<void>((accept) => { if (child.exitCode !== null) accept(); else child.once('exit', () => accept()); }); clearTimeout(timer);
}
function verifyCanvas(path: string, width: number, height: number, frameRate?: string): void {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate', '-of', 'json', path], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) throw new Error(`Cannot inspect rendered artifact: ${probe.error?.message ?? probe.stderr}`);
  const metadata: unknown = JSON.parse(probe.stdout);
  const streams = (metadata as { streams?: { width?: number; height?: number; avg_frame_rate?: string }[] }).streams;
  if (streams?.[0]?.width !== width || streams[0].height !== height) throw new Error(`Rendered canvas differs from ${width}x${height}: ${JSON.stringify(streams)}`);
  if (frameRate && streams[0].avg_frame_rate !== frameRate) throw new Error(`Rendered frame rate differs from ${frameRate}: ${JSON.stringify(streams)}`);
}
async function resourceBytes(client: EditorClient, id: string): Promise<Buffer> {
  const chunks: Buffer[] = []; let offset = 0;
  for (;;) {
    const data = await client.artifact(id, offset);
    if (data.artifactId !== id || data.offset !== offset) throw new Error('Artifact chunk identity or offset differs');
    chunks.push(Buffer.from(data.dataBase64, 'base64'));
    if (data.next === undefined || data.next === null) return Buffer.concat(chunks);
    if (data.next <= offset) throw new Error('Artifact cursor did not advance');
    offset = data.next;
  }
}
let { process: owner, ready } = await startOwner();
async function connect(): Promise<EditorTransport> {
  const endpoint = ready.endpoint;
  if (mode === 'sdk') return EditorConnection.connect({ endpoint, token: (await readFile(ready.tokenFile, 'utf8')).trim() });
  if (mode === 'mcp') return McpConnection.connect({ binary: executable!, args: ['mcp', '--endpoint', endpoint] });
  return {
    async request(request: Request): Promise<Response> {
      const result = spawnSync(executable!, ['call', '--endpoint', endpoint, '--file', '-'], { input: JSON.stringify(request), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      if (result.error) throw result.error;
      const response: unknown = JSON.parse(result.stdout); assertContract('Response', response); return response as Response;
    }, close() {},
  };
}
let transport: EditorTransport | undefined;
try {
  transport = await connect();
  let client = new EditorClient(transport);
  const capabilities = await client.discover();
  const session = await client.create(ready.grants.project, `Programmatic ${mode}`);
  const importContext = session.renderContext(`${mode}-initial-import`);
  const importJob = await client.importStart(importContext, ready.grants.sources);
  const importCompleted = await client.waitForJob(importJob.id, { intervalMs: 25 });
  const importArtifact = importCompleted.artifacts[0];
  if (importCompleted.phase !== 'completed' || !importArtifact || importJob.kind.kind !== 'import' || importJob.scope.kind !== 'sequence' || importJob.scope.sequenceId !== session.info.activeSequence) throw new Error('Native import job lost its actual sequence scope or publication resource');
  const importBytes = await resourceBytes(client, importArtifact);
  const publication: unknown = JSON.parse(importBytes.toString('utf8'));
  assertContract('ImportPublication', publication);
  const imported = { project: await client.project(), publication: publication as Extract<Response, { type: 'imported' }>['publication'] };
  const importReplayed = await client.importStart(importContext, ready.grants.sources);
  if (importReplayed.id !== importJob.id || importCompleted.sourceVersions[imported.publication.assetIds[0]!]?.sha256 !== before) throw new Error('Native import job lost its durable replay or copied source identity');
  session.info = imported.project;
  const importedAgain = await client.import(importContext, ready.grants.sources);
  if (!isDeepStrictEqual(importedAgain.publication, imported.publication) || importedAgain.project.assetCount !== 1 || importedAgain.project.revision !== imported.project.revision) throw new Error('Import retry changed its publication or created duplicate sources');
  const importedEvents = await client.invoke({ method: 'events', afterRevision: 0, limit: 1 }, 'events');
  if (importedEvents.page.items[0]?.revision !== session.info.revision || importedEvents.page.items[0]?.commandIds.length !== 0) throw new Error('The real import did not publish its own durable change event');
  const { page: tracks } = await client.query({ kind: 'tracks', sequenceId: session.info.activeSequence, offset: 0, limit: 256 });
  const { page: clips } = await client.query({ kind: 'clips', sequenceId: session.info.activeSequence, offset: 0, limit: 256 });
  if (clips.items.length !== 1 || clips.items[0]?.id !== imported.publication.clipIds[0] || clips.items[0]?.assetId !== imported.publication.assetIds[0]) throw new Error('Import publication lost its created source and clip identities');
  const { page: definitions } = await client.query({ kind: 'definitions', offset: 0, limit: 256 });
  const color = definitions.items.find((definition) => definition.id === 'beam.color');
  const crossfade = definitions.items.find((definition) => definition.id === 'beam.crossfade');
  const solid = definitions.items.find((definition) => definition.id === 'beam.solid');
  if (!color || !crossfade || !solid) throw new Error('Required native processor definitions are missing');
  const { page: presets } = await client.query({ kind: 'presets', offset: 0, limit: 256 });
  const warm = presets.items.find((preset) => preset.id === 'beam.color.warm' && preset.version === 1);
  if (!warm) throw new Error('Required versioned color preset is missing');
  const pack = await client.sealPack({ id: 'demo.modules', namespace: 'demo', version: 1, definitions: [
    { ...color, id: 'demo.tint', label: 'Warm tint', parameters: color.parameters.map((parameter) => parameter.key === 'brightness' ? { ...parameter, default: { kind: 'number', value: 0.02 } } : parameter) },
    { ...crossfade, id: 'demo.transition', label: 'Custom crossfade' },
    { ...solid, id: 'demo.annotation', label: 'Color annotation', timelineRegion: true },
  ], presets: [{ ...warm, id: 'demo.tint.warm', definitionId: 'demo.tint' }] });
  const video = tracks.items.find((track) => track.kind === 'video'); const clip = clips.items.find((clip) => clip.trackId === video?.id);
  if (!clip || !video || clip.durationMs < 2400) throw new Error('The real source must contain at least 2.4 seconds of video');
  const sourceGrant = ready.grants.sources[0];
  if (!sourceGrant) throw new Error('Missing authorized source grant');
  const relinkContext = session.renderContext(`${mode}-source-version`);
  const relinked = await client.relink(relinkContext, clip.assetId, sourceGrant, [clip.id]);
  await session.refresh();
  const sourceVersionId = relinked.results[0]?.created[0];
  if (!sourceVersionId || sourceVersionId === clip.assetId) throw new Error('Relink did not create a new immutable source version');
  const version = await client.query({ kind: 'asset', id: sourceVersionId });
  const original = await client.query({ kind: 'asset', id: clip.assetId });
  if (version.asset.identity?.sha256 !== before || original.asset.identity?.sha256 !== before || version.revision !== session.info.revision) throw new Error('Relink source versions lost their real identity or revision');
  const linked = await client.query({ kind: 'clip', sequenceId: session.info.activeSequence, clipId: clip.id });
  if (linked.clip.assetId !== sourceVersionId) throw new Error('Relink did not retarget the explicit clip');
  const replay = await client.relink(relinkContext, clip.assetId, sourceGrant, [clip.id]);
  if (JSON.stringify(replay) !== JSON.stringify(relinked) || (await client.query({ kind: 'assets', offset: 0, limit: 256 })).page.total !== 2) throw new Error('Source-publication retry created another asset or changed its receipt');
  const montage = await session.batch((batch) => {
    batch.edit({ type: 'canvas', canvas: { width: 64, height: 64, fps: 30, fpsDenominator: 1, background: 4279637526 } });
    const second = batch.edit({ type: 'split', id: clip.id, timeMs: 1000 }, 'cut');
    const transform = batch.effect(clip.id, 'beam.transform', { scaleX: number(1), scaleY: number(1) }, 1, 'camera');
    batch.parameter(clip.id, transform, 'rotation', curve('clipLocal', [keyframe(seconds(0), { kind: 'number', value: 0 }), keyframe(seconds(1), { kind: 'number', value: 12 })]));
    batch.parameter(clip.id, transform, 'scaleX', curve('clipLocal', [keyframe(seconds(0), { kind: 'number', value: 1 }), keyframe(seconds(1), { kind: 'number', value: 1.2 })]));
    batch.keyframeAt(clip.id, transform, 'scaleY', 'clipLocal', seconds(0), { kind: 'number', value: 1 });
    batch.keyframeAt(clip.id, transform, 'scaleY', 'clipLocal', seconds(1), { kind: 'number', value: 1.2 });
    for (let index = 0; index < 10; index++) batch.effect(clip.id, 'beam.color', { brightness: number(0.005) });
    batch.register(pack);
    batch.effect(clip.id, 'demo.tint');
    batch.transition(clip.id, second, 300, 'demo.transition');
    const overlay = batch.edit({ type: 'addTrack', name: 'Annotation', kind: 'video' }, 'overlay');
    batch.generator(overlay, 'demo.annotation', 1400, 300, { color: constant({ kind: 'color', value: [1, 0.35, 0.08, 0.2] }) });
    if (nativeScopes) {
    const trackFx = batch.trackEffect(video.id, 'beam.opacity', { opacity: number(1) }, 2, 'track-fx');
    batch.scoped({ kind: 'track', track: video.id }, { type: 'range', instance: trackFx, range: { space: 'sequence', start: seconds(0.25), end: seconds(1.75) } });
    const sequenceFx = batch.sequenceEffect(session.info.activeSequence, 'beam.opacity', { opacity: curve('sequence', [keyframe(seconds(0), { kind: 'number', value: 0.8 }), keyframe(seconds(1), { kind: 'number', value: 1 })]) }, 2, 'sequence-fx');
    batch.scoped({ kind: 'sequence', sequenceId: session.info.activeSequence }, { type: 'range', instance: sequenceFx, range: { space: 'sequence', start: seconds(0.25), end: seconds(1.75) } });
    }
  }, { idempotencyKey: `${mode}-montage-v1` });
  const trackEffectId = montage.results.find((result) => result.commandId === 'track-fx')?.created[0];
  const sequenceEffectId = montage.results.find((result) => result.commandId === 'sequence-fx')?.created[0];
  if (nativeScopes && (!trackEffectId || !sequenceEffectId)) throw new Error('Scoped effects lost their actual instance IDs');
  const headers = await client.clipHeaders(session.info.activeSequence);
  if (headers.page.items.find((item) => item.id === clip.id)?.effectCount !== 12 || headers.page.items.some((item) => 'instances' in item)) throw new Error('Header page exposed FX payloads or lost its effect counts');
  const playhead = seconds(0.5);
  const trackValues = await client.parameters({ kind: 'track', sequenceId: session.info.activeSequence, trackId: video.id }, playhead);
  const sequenceValues = await client.parameters({ kind: 'sequence', sequenceId: session.info.activeSequence }, playhead);
  if (nativeScopes && trackEffectId && sequenceEffectId && (trackValues.values[trackEffectId]?.opacity?.kind !== 'number' || sequenceValues.values[sequenceEffectId]?.opacity?.kind !== 'number' || sequenceValues.values[sequenceEffectId]?.opacity?.value !== 0.9 || sequenceValues.revision !== session.info.revision)) throw new Error('Rust scoped parameters did not evaluate the absolute sequence clock');
  const regions = await client.query({ kind: 'regions', sequenceId: session.info.activeSequence, start: seconds(0), end: seconds(3), offset: 0, limit: 256 });
  if (nativeScopes && (!regions.page.items.some((region) => region.id === trackEffectId && region.target.kind === 'track' && region.target.trackId === video.id) || !regions.page.items.some((region) => region.id === sequenceEffectId && region.target.kind === 'sequence'))) throw new Error('Scoped regions lost their actual target addresses');
  let snapshot = await client.query({ kind: 'clips', sequenceId: session.info.activeSequence, offset: 0, limit: 256 });
  const target = snapshot.page.items.find((item) => item.id === clip.id)?.instances?.find((instance) => instance.definitionId === 'demo.tint');
  if (!target) throw new Error('The registered effect instance is missing');
  await session.batch((batch) => { batch.applyPreset({ kind: 'effect', clipId: clip.id, instanceId: target.id }, 'demo.tint.warm'); });
  const detail = await client.query({ kind: 'clip', sequenceId: session.info.activeSequence, clipId: clip.id });
  if (detail.revision !== session.info.revision || detail.clip.instances?.find((instance) => instance.id === target.id)?.parameters.brightness?.kind !== 'constant') throw new Error('Inspector query lacks its revisioned preset payload');
  snapshot = await client.query({ kind: 'clips', sequenceId: session.info.activeSequence, offset: 0, limit: 256 });
  await session.undo(); await session.redo();
  client.close(); await stopOwner(owner);
  ({ process: owner, ready } = await startOwner());
  transport = await connect(); client = new EditorClient(transport);
  const reopened = await client.open(ready.grants.project);
  const recovered = await client.query({ kind: 'clips', sequenceId: reopened.info.activeSequence, offset: 0, limit: 256 });
  const persistedImport = await client.import(importContext, ready.grants.sources);
  if (!isDeepStrictEqual(persistedImport.publication, imported.publication) || persistedImport.project.assetCount !== 2 || persistedImport.project.revision !== reopened.info.revision) throw new Error('Durable import retry changed state after owner restart');
  const durableImportJob = await client.importStart(importContext, ready.grants.sources);
  if (durableImportJob.id !== importJob.id || !(await resourceBytes(client, importArtifact)).equals(importBytes)) throw new Error('Import job/publication artifact changed after owner restart');
  const persistedScope = await client.parameters({ kind: 'sequence', sequenceId: reopened.info.activeSequence }, playhead);
  if (nativeScopes && sequenceEffectId && (persistedScope.values[sequenceEffectId]?.opacity?.kind !== 'number' || persistedScope.values[sequenceEffectId]?.opacity?.value !== 0.9)) throw new Error('Sequence effects lost their evaluated state after restart');
  if (JSON.stringify(snapshot.page.items) !== JSON.stringify(recovered.page.items)) throw new Error('Reopening changed edit decisions or keyframe IDs');
  const reopenedGrant = ready.grants.sources[0];
  if (!reopenedGrant || JSON.stringify(await client.relink(relinkContext, clip.assetId, reopenedGrant, [clip.id])) !== JSON.stringify(relinked)) throw new Error('Source publication did not replay after owner restart with its new source grant');
  if (before !== await checksum(source)) throw new Error('Source media changed');
  await client.invoke({ method: 'seek', positionMs: 500 }, 'transport');
  const container = capabilities.exports.includes('webm') ? 'webm' : capabilities.exports[0];
  if (!container) throw new Error(`Editing, modules, undo/redo and reopening passed via ${mode}; no hardware export backend is available`);
  if (!ready.grants.destination) throw new Error('Missing configured destination grant');
  let minimumDiagnostic: string | null = null;
  const trialName = `${mode}-64x64-${Date.now()}.${container}`;
  const trial = await reopened.export(ready.grants.destination, trialName, container);
  try {
    const finished = await client.waitForJob(trial.id);
    if (finished.phase !== 'completed') throw new Error('Small-canvas export was unexpectedly cancelled');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const explicitMinimum = /minimum/i.test(message) && message.includes('128') && message.includes('96');
    const explicitCaps = message.includes('cannot encode canvas 64x64') && /width=\(int\)\[\s*128\s*,/.test(message) && /height=\(int\)\[\s*96\s*,/.test(message);
    if (!explicitMinimum && !explicitCaps) throw error;
    if ((await client.job(trial.id)).phase !== 'failed') throw new Error('Unsupported hardware canvas did not produce a failed job');
    minimumDiagnostic = message;
  }
  if (!minimumDiagnostic) verifyCanvas(join(destination, trialName), 64, 64);
  await reopened.batch((batch) => { batch.edit({ type: 'canvas', canvas: { width: 128, height: 96, fps: 30, fpsDenominator: 1, background: 4279637526 } }); });
  const preview = await reopened.preview(seconds(0.5), 'half');
  const previewFinished = await client.waitForJob(preview.id);
  const previewArtifact = previewFinished.artifacts[0];
  if (previewFinished.phase !== 'completed' || !previewArtifact) throw new Error('Real frame preview did not complete');
  const previewBytes = Buffer.from((await client.artifact(previewArtifact)).dataBase64, 'base64');
  if (!previewBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || previewBytes.readUInt32BE(16) !== 64 || previewBytes.readUInt32BE(20) !== 48) throw new Error('Half-quality preview is not a real 64x48 PNG');
  const fileName = `${mode}-128x96-${Date.now()}.${container}`;
  const job = await reopened.export(ready.grants.destination, fileName, container);
  const finished = await client.waitForJob(job.id);
  if (finished.phase !== 'completed' || (await stat(join(destination, fileName))).size === 0) throw new Error('Export did not produce a real artifact');
  verifyCanvas(join(destination, fileName), 128, 96);
  if (before !== await checksum(source)) throw new Error('Rendering changed the original source media');
  const artifactId = finished.artifacts[0];
  if (!artifactId || !finished.snapshotId || finished.sourceVersions[sourceVersionId]?.sha256 !== before || clip.assetId in finished.sourceVersions) throw new Error('Completed job lacks its exact new source version, pinned snapshot or artifact');
  const chunk = await client.artifact(artifactId);
  const renderedBytes = await readFile(join(destination, fileName));
  if (!Buffer.from(chunk.dataBase64, 'base64').equals(renderedBytes.subarray(0, 262144))) throw new Error('Artifact resource bytes differ from the real export');
  const beforeSourceJobs = await client.query({kind:'clips',sequenceId:reopened.info.activeSequence,offset:0,limit:256});
  const beforeScopes = JSON.stringify([await client.query({kind:'track',sequenceId:reopened.info.activeSequence,trackId:video.id}),await client.query({kind:'sequence',sequenceId:reopened.info.activeSequence})]);
  const analysis = await reopened.analyze(sourceVersionId, 'zoomClicksV1', `${mode}-analysis-without-telemetry`);
  try { await client.waitForJob(analysis.id); throw new Error('Ordinary video acquired fabricated click suggestions'); }
  catch (error) { if (!(error instanceof Error) || !error.message.includes('requires nonempty separated cursor telemetry')) throw error; }
  if ((await client.job(analysis.id)).phase !== 'failed') throw new Error('Missing telemetry did not fail its accepted analysis job');
  const proxyContext = reopened.sourceContext(sourceVersionId, `${mode}-full-source-proxy`);
  const proxySettings = {container,width:128,height:96,frameRate:{numerator:30,denominator:1}};
  const proxy = await client.proxy(proxyContext,proxySettings);
  const proxyFinished = await client.waitForJob(proxy.id);
  const proxyArtifact = proxyFinished.artifacts[0];
  if (proxyFinished.phase !== 'completed' || !proxyArtifact || proxyFinished.scope.kind !== 'source' || proxyFinished.scope.assetId !== sourceVersionId || proxyFinished.sourceVersions[sourceVersionId]?.sha256 !== before) throw new Error('Source proxy has no exact source scope, identity or completed artifact');
  const proxyBytes = await resourceBytes(client,proxyArtifact);
  const {page:artifactMetadata} = await client.query({kind:'artifacts',offset:0,limit:256});
  const proxyMetadata = artifactMetadata.items.find((item)=>item.id === proxyArtifact);
  if (!proxyMetadata || proxyMetadata.byteLength !== proxyBytes.length || proxyMetadata.sha256 !== createHash('sha256').update(proxyBytes).digest('hex')) throw new Error('Proxy resource differs from its immutable artifact metadata');
  const proxyPath = join(destination,`${mode}-source-proxy.${container}`);await writeFile(proxyPath,proxyBytes);
  verifyCanvas(proxyPath,128,96,'30/1');
  if ((await client.proxy(proxyContext,proxySettings)).id !== proxy.id) throw new Error('Proxy retry created a second job');
  const afterSourceJobs = await client.query({kind:'clips',sequenceId:reopened.info.activeSequence,offset:0,limit:256});
  const afterScopes = JSON.stringify([await client.query({kind:'track',sequenceId:reopened.info.activeSequence,trackId:video.id}),await client.query({kind:'sequence',sequenceId:reopened.info.activeSequence})]);
  if (beforeScopes !== afterScopes || JSON.stringify(beforeSourceJobs) !== JSON.stringify(afterSourceJobs) || before !== await checksum(source)) throw new Error('Source analysis or proxy changed montage decisions or original source bytes');
  client.close(); await stopOwner(owner);
  ({ process: owner, ready } = await startOwner());
  transport = await connect(); client = new EditorClient(transport);
  await client.open(ready.grants.project);
  const durable = await client.job(job.id);
  if (durable.phase !== 'completed' || durable.snapshotId !== finished.snapshotId) throw new Error('Completed pinned job did not survive owner restart');
  const durableChunk = await client.artifact(artifactId);
  if (durableChunk.dataBase64 !== chunk.dataBase64) throw new Error('Artifact resources changed after owner restart');
  if ((await client.job(preview.id)).phase !== 'completed') throw new Error('Preview job did not survive owner restart');
  if ((await client.job(proxy.id)).phase !== 'completed' || (await client.job(analysis.id)).phase !== 'failed' || !(await resourceBytes(client,proxyArtifact)).equals(proxyBytes) || (await client.proxy(proxyContext,proxySettings)).id !== proxy.id) throw new Error('Source jobs or proxy artifact lost their durable state after restart');
  console.log(JSON.stringify({ mode, asyncImportJobId:importJob.id,asyncImportPublicationResourceVerified:true,nativeScopes,scopedValuesVerified:nativeScopes,regionTargetsVerified:nativeScopes,parameterQueriesVerified:true,headerPageVerified:true,privateEndpoint:ready.endpoint, projectId: reopened.info.id, revision: reopened.info.revision, sourceVersionId, sourcePublicationReplayed: true, importPublicationReplayed: true, importAssetIds: imported.publication.assetIds, importClipIds: imported.publication.clipIds, jobId: job.id, previewJobId: preview.id, previewWidth: 64, previewHeight: 48, artifact: join(destination, fileName), proxyJobId:proxy.id,proxyArtifact:proxyPath,proxyWidth:128,proxyHeight:96,sourceJobsLeaveDecisionsUnchanged:true,analysisWithoutTelemetryRejected:true,sourceUnchanged: true, importEventVerified: true, presetApplied: true, sealedPack: pack.sha256, artifactResourceVerified: true, jobSurvivedRestart: true, minimumRejected: minimumDiagnostic !== null, minimumDiagnostic, width: 128, height: 96 }));
} finally {
  transport?.close(); await stopOwner(owner);
}
