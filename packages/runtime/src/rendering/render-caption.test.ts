import { beforeEach, expect, it, vi } from 'vitest';
import type { CaptionClip } from '@beam/engine/shared/composition-types';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import { context, snapshot } from './tests/render.test-support';
import { drawCaptionText } from '../composition/captions/render-caption-text';
import { drawCaption } from './render-caption';

vi.mock('../composition/captions/render-caption-text', () => ({ drawCaptionText: vi.fn() }));

function caption(text: string): CaptionClip {
  return {
    id: 'caption',
    kind: 'caption',
    name: 'Caption',
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    enabled: true,
    order: 1,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    caption: {
      type: 'text',
      sentences: [],
      style: { ...createDefaultCaptionStyle(24), customText: text },
    },
  };
}
beforeEach(() => vi.clearAllMocks());

it('does not paint empty captions', () => {
  drawCaption(context(), caption(''), 500, snapshot());
  expect(drawCaptionText).not.toHaveBeenCalled();
});

it('uses the document canvas when no separate reference size is needed', () => {
  const document = snapshot();
  drawCaption(context(), caption('Readable text'), 500, document);
  expect(drawCaptionText).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ text: 'Readable text', canvas: document.canvas }),
  );
});

it('keeps caption layout and cursor coordinates while rasterizing a higher resolution lens scene', () => {
  const document = snapshot();
  document.referenceCanvas = { ...document.canvas };
  document.canvas = { ...document.canvas, width: 500, height: 250 };
  const cursor = { x: 0.25, y: 0.75 };
  drawCaption(context(), caption('Readable text'), 500, document, cursor);
  expect(drawCaptionText).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      canvas: document.referenceCanvas,
      viewport: { x: 0, y: 0, width: 500, height: 250 },
      cursorPosition: cursor,
    }),
  );
});
