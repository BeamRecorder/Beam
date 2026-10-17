import { beforeEach, expect, it, vi } from 'vitest';
import { drawSnapshotBackground } from '../render-snapshot-background';
import { context, snapshot } from './render.test-support';
const paint = vi.hoisted(() => vi.fn());
vi.mock('../../composition/background/render-background', () => ({ renderBackground: paint }));
beforeEach(() => paint.mockClear());

it('does no background work when neither a value nor pixels are present', () => {
  const ctx = context();
  drawSnapshotBackground(ctx, snapshot(), undefined);
  expect(ctx.drawImage).not.toHaveBeenCalled();
  expect(paint).not.toHaveBeenCalled();
});
it('copies an already rendered preview background without filtering it again', () => {
  const ctx = context(),
    value = snapshot(),
    source = {} as CanvasImageSource;
  drawSnapshotBackground(ctx, value, { source, width: 100, height: 50, preRendered: true });
  expect(ctx.drawImage).toHaveBeenCalledExactlyOnceWith(source, 0, 0, 100, 50);
  expect(paint).not.toHaveBeenCalled();
});
it('renders configured colors and media with their source geometry and blur', () => {
  const value = snapshot(),
    ctx = context();
  value.background = { kind: 'color', color: '#123456' };
  value.blurPercent = 25;
  drawSnapshotBackground(ctx, value, null);
  expect(paint).toHaveBeenLastCalledWith(
    ctx,
    expect.objectContaining({ value: value.background, blurPixels: 12, sourceSize: undefined }),
  );
  const source = {} as CanvasImageSource;
  drawSnapshotBackground(ctx, value, { source, width: 200, height: 50 });
  expect(paint).toHaveBeenLastCalledWith(
    ctx,
    expect.objectContaining({ source, sourceSize: { width: 200, height: 50 } }),
  );
});
