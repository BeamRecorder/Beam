import type { ReaderBounds, ReaderProgress } from './playbackTypes'

function validateContent(bounds: ReaderBounds): void {
  if (![bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height < 0) {
    throw new Error('Teleprompter reader has invalid layout bounds')
  }
}

function validateViewport(bounds: ReaderBounds): void {
  if (![bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('Teleprompter reader has invalid layout bounds')
  }
}

/** Preserves reading progress when text or viewport metrics change. */
export function measuredReaderProgress(content: ReaderBounds, viewport: ReaderBounds,
  previous: ReaderProgress, replayAtEnd: boolean): ReaderProgress {
  validateContent(content)
  validateViewport(viewport)
  const maximum = Math.max(0, content.height - viewport.height)
  const fraction = previous.maximum > 0 ? previous.current / previous.maximum : 0
  let current = previous.maximum > 0 ? fraction * maximum : Math.min(previous.current, maximum)
  if (replayAtEnd && fraction >= 1) current = 0
  return { current, maximum }
}
