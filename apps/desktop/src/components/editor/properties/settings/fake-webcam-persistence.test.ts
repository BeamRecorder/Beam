// @vitest-environment node
import { createRequire } from 'node:module';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createComposition, validateComposition } from '@beam/engine/commands/clip-engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { attachWebcamRecordingOverlay, hasRecordingWebcam } from '@beam/engine/composition/webcam-recording-overlay';
import { recordingMediaOwner, recordingLinkedClipIds } from '@beam/engine/composition/recording-media-links';
import { cameraScreenPartner } from '@beam/engine/composition/camera-screen-link';
import type { MediaAsset, VisualClip } from '@beam/engine/shared/composition-types';
import type { FakeWebcamPersistenceModules } from './fake-webcam-persistence.test-types';

const require = createRequire(import.meta.url);
const { createProjectStore } =
  require('../../../../../electron/projects/project-store.cjs') as FakeWebcamPersistenceModules;
const { normalizeComposition } =
  require('../../../../../electron/projects/clip-composition.cjs') as FakeWebcamPersistenceModules;

describe('demo webcam project persistence', () => {
  it.each([18425, 24001, 65432.1])('saves, reopens and saves again without overlaps for %s ms', (durationMs) => {
    const root = mkdtempSync(join(tmpdir(), 'beam-webcam-persistence-'));
    try {
      const store = createProjectStore(root);
      const project = store.create({ name: 'Quiet Aurora 4' });
      const directory = store.directoryFor(project.id);
      const source = resolve('public/dev-media/demo-webcam.mp4');
      mkdirSync(join(directory, 'sessions', 'recording', 'screen'), { recursive: true });
      copyFileSync(source, join(directory, 'sessions', 'recording', 'screen', 'segment.mp4'));
      const manifestPath = join(directory, 'project.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { sessions: unknown[] };
      manifest.sessions = [{ sessionId: 'recording', relativePath: 'sessions/recording' }];
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const screenAsset: MediaAsset = {
        id: 'recording-screen',
        kind: 'video',
        name: 'Recording',
        origin: 'session',
        sessionId: 'recording',
        sessionPath: 'screen/segment.mp4',
        src: 'screen.mp4',
        fileName: null,
        durationMs,
        width: 1920,
        height: 1080,
      };
      const screen: VisualClip = {
        id: 'screen',
        kind: 'screen',
        name: 'Screen',
        assetId: screenAsset.id,
        trackId: 'screen-track',
        timelineStartMs: 0,
        timelineDurationMs: durationMs,
        sourceInMs: 0,
        sourceDurationMs: durationMs,
        playbackRate: 1,
        enabled: true,
        order: 0,
        transitions: { entry: null, exit: null },
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance: createDefaultClipAppearance('screen'),
        isMirrored: false,
        isMirroredY: false,
      };
      const imported = store.importEditorMedia(project.id, { kind: 'video', source });
      const composition = attachWebcamRecordingOverlay(createComposition([screenAsset], [screen]), {
        screenClipId: screen.id,
        asset: { ...imported, durationMs: 8000, width: 640, height: 480 },
        name: 'Demo webcam',
        appearance: createDefaultClipAppearance('webcam'),
      });
      expect(() => normalizeComposition(composition)).not.toThrow();
      store.saveEditorState(project.id, { ...store.editorState(project.id), composition });
      const reopenedStore = createProjectStore(root);
      const reopened = reopenedStore.editorState(project.id);
      expect(() => validateComposition(reopened.composition)).not.toThrow();
      const cameras = reopened.composition.clips.filter((clip): clip is VisualClip => clip.kind === 'webcam');
      expect(cameras.length).toBe(Math.ceil(durationMs / 8000));
      let endMs = 0;
      for (const camera of cameras) {
        expect(camera.timelineStartMs).toBe(endMs);
        endMs += camera.timelineDurationMs;
        expect(camera.reactToZoom).toBe(true);
        expect(cameraScreenPartner(reopened.composition, camera)?.id).toBe(screen.id);
        expect(recordingMediaOwner(reopened.composition, camera)?.id).toBe(screen.id);
        const asset = reopened.composition.assets.find((asset) => asset.id === camera.assetId)!;
        expect(asset.sessionId).toBeUndefined();
        expect(Buffer.compare(readFileSync(reopenedStore.mediaFileForUrl(asset.src)), readFileSync(source))).toBe(0);
      }
      expect(endMs).toBe(Math.round(durationMs));
      expect(hasRecordingWebcam(reopened.composition, screen)).toBe(true);
      expect(recordingLinkedClipIds(reopened.composition, [screen.id])).toEqual(
        expect.arrayContaining(cameras.map((clip) => clip.id)),
      );
      expect(() => reopenedStore.saveEditorState(project.id, reopened)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
