import { randomUUID } from 'node:crypto';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { validateHtmlComposition } from '@beam/engine';
import { prepareHtmlBundle } from './html-bundle';
import type { AgentClient, HtmlPublishArguments, LiveDocumentSnapshot, PublishResult } from './agent-types';
import type { DocumentResponse } from '@beam/engine/document/endpoint-types';
import type { DocumentCommand } from '@beam/engine/commands/command-types';
import type { DocumentTransactionEvent } from '@beam/engine/document/transaction-types';
import type { MediaAsset } from '@beam/engine/shared/composition-types';
import type { StillDocument } from '@beam/engine/screenshot/still-document-types';

export async function readLiveDocument(client: AgentClient, projectId: string): Promise<LiveDocumentSnapshot> {
  const response = await client.call<DocumentResponse>('documents.request', {
    projectId,
    request: { version: 1, id: randomUUID(), method: 'snapshot' },
  });
  if (!response.ok) throw new Error(response.error.message);
  return response.result as LiveDocumentSnapshot;
}

export function htmlPublishCommands(snapshot: LiveDocumentSnapshot, asset: MediaAsset, input: HtmlPublishArguments) {
  const still =
    'kind' in snapshot.document && snapshot.document.kind === 'image' ? (snapshot.document as StillDocument) : null;
  const appearance = { ...createDefaultClipAppearance('image'), cornerRadius: 0, shadowSize: 'none' as const };
  const layerId = input.layerId ?? randomUUID();
  const name = input.name ?? 'HTML composition';
  if (still) {
    if (input.durationMs !== 0) throw new Error('Screenshot HTML compositions use durationMs: 0.');
    const current = still.state.images?.find((layer) => layer.id === layerId);
    if (input.layerId && !current?.html) throw new Error('Choose an existing HTML layer to update.');
    return {
      layerId,
      commands: [
        current
          ? {
              type: 'still.layer.patch',
              payload: {
                layerId,
                patch: {
                  source: asset.src,
                  width: input.width,
                  height: input.height,
                  html: asset.html,
                  ...(input.name ? { name } : {}),
                },
              },
            }
          : {
              type: 'still.layer.add',
              payload: {
                id: layerId,
                kind: 'image',
                name,
                assetId: asset.id,
                source: asset.src,
                html: asset.html,
                width: input.width,
                height: input.height,
                enabled: true,
                order: 0,
                timelineStartMs: 0,
                timelineDurationMs: 1,
                sourceInMs: 0,
                sourceDurationMs: 1,
                playbackRate: 1,
                transitions: { entry: null, exit: null },
                transform: { x: 0, y: 0, width: 1, height: 1 },
                appearance,
                isMirrored: false,
                isMirroredY: false,
                cameraFramingPreset: 'fit',
              },
            },
      ] as DocumentCommand[],
    };
  }
  if (!('composition' in snapshot.document)) throw new Error('Unsupported live document.');
  const composition = snapshot.document.composition;
  const current = composition.clips.find((clip) => clip.id === layerId);
  const currentAsset =
    current && 'assetId' in current ? composition.assets.find((entry) => entry.id === current.assetId) : null;
  if (input.layerId && (current?.kind !== 'image' || !currentAsset?.html))
    throw new Error('Choose an existing HTML clip to update.');
  const commands: DocumentCommand[] = currentAsset
    ? [
        {
          type: 'asset.patch',
          payload: {
            assetId: currentAsset.id,
            patch: {
              src: asset.src,
              fileName: asset.fileName,
              width: asset.width,
              height: asset.height,
              html: asset.html,
            },
          },
        },
      ]
    : [{ type: 'asset.add', payload: { ...asset, name } }];
  if (current) {
    if (input.name) commands.push({ type: 'clip.patch', payload: { clipId: layerId, patch: { name } } });
  } else {
    const duration = input.durationMs || 5000;
    commands.push({
      type: 'clip.add',
      payload: {
        id: layerId,
        kind: 'image',
        name,
        trackId: `html:${layerId}`,
        assetId: asset.id,
        enabled: true,
        order: Math.min(0, ...composition.clips.map((clip) => clip.order)) - 1,
        timelineStartMs: input.startMs ?? 0,
        timelineDurationMs: duration,
        sourceInMs: 0,
        sourceDurationMs: duration,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance,
        isMirrored: false,
        isMirroredY: false,
        cameraFramingPreset: 'fit',
      },
    });
  }
  return { layerId, commands };
}

export async function publishHtml(
  client: AgentClient,
  input: HtmlPublishArguments,
  baseDirectory: string,
): Promise<PublishResult> {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
    throw new Error('Read documents.snapshot first and supply expectedRevision.');
  const snapshot = await readLiveDocument(client, input.projectId);
  if (snapshot.revision !== input.expectedRevision)
    throw new Error('Revision conflict. Read the current snapshot before publishing.');
  const composition = 'composition' in snapshot.document ? snapshot.document.composition : null;
  const clip = composition?.clips.find((item) => item.id === input.layerId);
  const existing = composition
    ? clip && 'assetId' in clip
      ? composition.assets.find((asset) => asset.id === clip.assetId)?.html
      : undefined
    : (snapshot.document as StillDocument).state.images?.find((layer) => layer.id === input.layerId)?.html;
  if (input.layerId && !existing) throw new Error('Choose an existing HTML layer to update.');
  if (!composition && input.durationMs !== 0) throw new Error('Screenshot HTML compositions use durationMs: 0.');
  const locked = composition
    ? clip?.locked
    : (snapshot.document as StillDocument).state.composition?.find((layer) => layer.id === input.layerId)?.locked;
  if (locked) throw new Error('HTML layer is locked.');
  const html = {
    version: 1 as const,
    id: existing?.id ?? randomUUID(),
    revision: randomUUID(),
    entry: 'index.html',
    width: input.width,
    height: input.height,
    durationMs: input.durationMs,
    fps: input.fps ?? 30,
    framework: input.framework ?? ('html' as const),
  };
  validateHtmlComposition(html);
  const references = await Promise.all(
    (input.references ?? []).map(async (reference) => {
      if (!reference.source.startsWith('project-media:')) return reference;
      const resolved = await client.call<{ path: string }>('assets.resolve', {
        projectId: reference.projectId ?? input.projectId,
        source: reference.source,
      });
      return { ...reference, source: resolved.path };
    }),
  );
  const bundle = await prepareHtmlBundle({ ...input, references }, baseDirectory);
  try {
    html.entry = bundle.entry;
    const asset = await client.call<MediaAsset>('html.stage', {
      projectId: input.projectId,
      html,
      sourceDirectory: bundle.sourceDirectory,
      bundleDirectory: bundle.bundleDirectory,
    });
    const { layerId, commands } = htmlPublishCommands(snapshot, asset, input);
    const response = await client.call<DocumentResponse>('documents.request', {
      projectId: input.projectId,
      request: {
        version: 1,
        id: randomUUID(),
        method: 'transaction',
        transaction: {
          version: 1,
          documentId: input.projectId,
          actorId: 'beam-cli',
          operationId: randomUUID(),
          expectedRevision: snapshot.revision,
          commands,
        },
      },
    });
    if (!response.ok) throw new Error(response.error.message);
    return {
      projectId: input.projectId,
      layerId,
      html,
      revision: (response.result as DocumentTransactionEvent).revision,
      commands,
    };
  } finally {
    await bundle.dispose();
  }
}
