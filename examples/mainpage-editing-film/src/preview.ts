import { ALL_FORMATS, BufferSource, CanvasSink, Input } from 'mediabunny';
import type { CameraSample } from '@beam/engine/zoom/composition-camera-types';
import { renderCompositionFrame, disposeCompositionRenderer } from '../../../packages/runtime/src/rendering/render';
import { createSnapshotCameraEvaluator } from '../../../packages/runtime/src/rendering/snapshot-camera';
import { createRetainedCamera } from '../../../packages/runtime/src/zoom/retained-camera';
import { createCursorMotionPlayer } from '@beam/engine/cursor/cursor-motion';
import { sourceTimeAt } from '@beam/engine/shared/timeline-mapping';
import type { RenderableMedia } from '../../../packages/runtime/src/rendering/render-types';
import { BASE, CURSOR_URLS, LOGO_URL, SCREEN, VIDEO_URL, WALLPAPERS, snapshotAt } from './scene-model';
import { EDIT_END, ENDING_START, INTRO_END, previewTimeAt } from './motion';

export async function createFilmPainter(canvas: HTMLCanvasElement) {
  const response = await fetch(VIDEO_URL);
  if (!response.ok) throw new Error('Original recording is unavailable.');
  const input = new Input({ source: new BufferSource(await response.arrayBuffer()), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) throw new Error('Original recording cannot be decoded.');
  const sink = new CanvasSink(track, { poolSize: 2, decoderOptions: { hardwareAcceleration: 'prefer-software' } });
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...new Set([LOGO_URL, ...WALLPAPERS.map((entry) => entry.url), ...CURSOR_URLS.values()])].map(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      images.set(url, image);
    }),
  );
  const cursors = new Map([...CURSOR_URLS].map(([id, url]) => [id, images.get(url)!]));
  const motion = createCursorMotionPlayer(
    BASE.cursor.events,
    BASE.cursorSettings.motion,
    track.displayWidth,
    track.displayHeight,
  );
  const originalCamera = createRetainedCamera(),
    editedCamera = createRetainedCamera();
  let lastSource = NaN,
    decoded: RenderableMedia | null = null,
    lastKey = '';
  let lastCamera: CameraSample = { focus: { cx: 0.5, cy: 0.5 }, scale: 1 };
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Film canvas unavailable.');
  return {
    async paint(time: number) {
      const editing = time >= INTRO_END && time < EDIT_END;
      const snapshot = editing ? snapshotAt(time) : BASE;
      const sourceTime = editing ? previewTimeAt(time) : time < INTRO_END ? time : ENDING_START + time - EDIT_END;
      const key = JSON.stringify([
        editing,
        sourceTime,
        snapshot.blurPercent,
        snapshot.background,
        snapshot.composition.clips,
      ]);
      if (key === lastKey) return lastCamera;
      const screen = snapshot.composition.clips.find((clip) => clip.id === SCREEN.id)!;
      const sourceMs = sourceTimeAt(screen, sourceTime * 1000);
      const visuals = new Map<string, RenderableMedia>();
      if (sourceMs !== null) {
        if (lastSource !== sourceMs) {
          const wrapped = await sink.getCanvas(sourceMs / 1000);
          if (!wrapped) throw new Error(`Missing source frame at ${sourceMs} ms.`);
          decoded = { source: wrapped.canvas, width: track.displayWidth, height: track.displayHeight };
          lastSource = sourceMs;
        }
        visuals.set(screen.id, decoded!);
      }
      for (const clip of snapshot.composition.clips)
        if (clip.kind === 'image') {
          const image = images.get(LOGO_URL)!;
          visuals.set(clip.id, { source: image, width: image.naturalWidth, height: image.naturalHeight });
        }
      const camera = (editing ? editedCamera : originalCamera).get({
        composition: snapshot.composition,
        zooms: snapshot.zooms,
        stableInputs: [BASE.canvas, BASE.cursor.telemetry, BASE.zoomAutoFollow],
        create: (reuse) => createSnapshotCameraEvaluator(snapshot, track.displayWidth, track.displayHeight, reuse),
      });
      const background = snapshot.background?.kind === 'image' ? images.get(snapshot.background.src)! : null;
      renderCompositionFrame(
        context,
        sourceMs === null ? null : decoded,
        snapshot,
        sourceTime,
        background ? { source: background, width: background.naturalWidth, height: background.naturalHeight } : null,
        cursors,
        visuals,
        motion,
        camera,
      );
      lastKey = key;
      lastCamera = camera.sample(sourceTime * 1000);
      return lastCamera;
    },
    dispose() {
      input.dispose();
      originalCamera.clear();
      editedCamera.clear();
      disposeCompositionRenderer();
    },
  };
}
