import { describe, expect, it } from 'vitest'
import { videoPreviewTime } from '../useBackgroundPreviews'

describe('videoPreviewTime', () => {
  it('uses the middle of a finite video', () => expect(videoPreviewTime(12)).toBe(6))
  it('uses the first frame for live videos', () => expect(videoPreviewTime(Infinity)).toBe(0))
  it('uses the first frame for invalid durations', () => expect(videoPreviewTime(-3)).toBe(0))
})
