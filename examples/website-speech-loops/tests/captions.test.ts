import { describe, expect, it, vi } from 'vitest';
import { captionContentAt } from '../../../packages/engine/src/shared/caption-text-layout';
import { drawCaptionText } from '../../../packages/runtime/src/composition/captions/render-caption-text';
import { captionClip, paintCaption } from '../src/captions';
vi.mock('../../../packages/runtime/src/composition/captions/render-caption-text', () => ({ drawCaptionText: vi.fn() }));
describe('native caption records', () => {
  it('uses supported text captions with timed words', () => {
    const clip = captionClip(3.5);
    expect(clip.caption.type).toBe('text');
    if (clip.caption.type !== 'text') throw new Error('Expected timed text captions');
    expect(clip.caption.sentences).toHaveLength(3);
    for (const sentence of clip.caption.sentences)
      for (const word of sentence.words) {
        expect(word.startMs).toBeGreaterThanOrEqual(sentence.startMs);
        expect(word.endMs).toBeLessThanOrEqual(sentence.endMs);
      }
  });
  it('keeps native typography and highlighting settings', () => {
    const style = captionClip(5.5).caption.style;
    expect(style.fontFamily).toBe('Hanken Grotesk');
    expect(style.fontSize).toBe(128);
    expect(style.wordHighlight.enabled).toBe(true);
    expect(style.wordHighlight.effect).toBe('pop');
    expect(style.shape.opacity).toBe(65);
  });
  it('resets styling at the seamless endpoint', () => expect(captionClip(8)).toEqual(captionClip(0)));
  it('resolves actual per-word highlighted content', () => {
    const content = captionContentAt(captionClip(3.5), 2700);
    expect(content.wordHighlight!.words.some((word) => word.active)).toBe(true);
    expect(content.text).toBe('Make your story stand out.');
  });
});
describe('native caption painter dispatch', () => {
  const context = {
    canvas: { width: 664, height: 416 },
  } as CanvasRenderingContext2D;
  it('does not draw captions before generation', () => {
    vi.mocked(drawCaptionText).mockClear();
    paintCaption(context, 1);
    expect(drawCaptionText).not.toHaveBeenCalled();
  });
  it('uses the native caption painter after generation', () => {
    vi.mocked(drawCaptionText).mockClear();
    paintCaption(context, 2);
    expect(drawCaptionText).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        text: 'Every word, beautifully clear.',
        viewport: { x: 0, y: 0, width: 664, height: 416 },
      }),
    );
  });
  it('sends real highlight runs to the native painter', () => {
    vi.mocked(drawCaptionText).mockClear();
    paintCaption(context, 3.5);
    expect(vi.mocked(drawCaptionText).mock.calls[0]![1].wordHighlight?.words.length).toBeGreaterThan(0);
  });
});
