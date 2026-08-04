import { describe, expect, it } from 'vitest'
import type { CursorEvent } from '../../../../api/types/capture-api'
import { createDefaultCursorMotionSettings } from '../../../../api/types/cursor-settings'
import {
  createCursorMotionPlayer,
  createCursorMotionTimeline,
  extractCursorMotionAnchors,
  minimumJerk,
  motionBlurTrail,
  stepSpringAxis,
} from '../cursor-motion'

const move = (time: number, x: number, y: number): CursorEvent => ({
  event: 'move',
  sessionNs: time * 1_000_000_000,
  pixelX: x * 1920,
  pixelY: y * 1080,
  normalizedX: x,
  normalizedY: y,
  visible: true,
})

const button = (time: number, x = 0.86, y = 0.84): CursorEvent => ({
  event: 'button',
  sessionNs: time * 1_000_000_000,
  button: 1,
  pressed: true,
  normalizedX: x,
  normalizedY: y,
})
const events = (...items: CursorEvent[]) => items

describe('cursor motion', () => {
  it('has zero velocity and acceleration at minimum-jerk endpoints', () => {
    expect(minimumJerk(0)).toBe(0)
    expect(minimumJerk(1)).toBe(1)
    expect(minimumJerk(0.01)).toBeLessThan(0.001)
    expect(1 - minimumJerk(0.99)).toBeLessThan(0.001)
  })

  it('keeps start, end and click positions as anchors', () => {
    const anchors = extractCursorMotionAnchors(
      events(move(0, 0, 0), move(1, 0.3, 0.2), move(2, 1, 1), button(1.8, 0.91, 0.17)),
    )
    expect(anchors[0]).toMatchObject({
      kind: 'start',
      timeSeconds: 0,
      x: 0,
      y: 0,
    })
    const clickAnchor = anchors.find((anchor) => anchor.kind === 'click')
    expect(clickAnchor?.timeSeconds).toBe(1.8)
    expect(clickAnchor).toMatchObject({ x: 0.91, y: 0.17 })
    expect(anchors.at(-1)).toMatchObject({
      kind: 'end',
      timeSeconds: 2,
      x: 1,
      y: 1,
    })
  })

  it('retimes a long movement into a bounded segment and uses spline easing', () => {
    const settings = createDefaultCursorMotionSettings()
    const timeline = createCursorMotionTimeline(events(move(0, 0, 0), move(2, 1, 1)), settings)
    expect(timeline.segments[0].endSeconds).toBe(2)
    expect(timeline.segments[0].startSeconds).toBeGreaterThan(1.5)
    expect(timeline.targetAt(0)).toEqual({ x: 0, y: 0 })
    expect(timeline.targetAt(2)).toEqual({ x: 1, y: 1 })
    const middle = timeline.targetAt(1.85)
    expect(middle?.x).toBeGreaterThan(0)
    expect(middle?.x).toBeLessThan(1)
  })

  it('enforces the minimum travel time for a short movement', () => {
    const settings = createDefaultCursorMotionSettings()
    const timeline = createCursorMotionTimeline(events(move(0, 0, 0), move(0.2, 0.1, 0.05)), settings)
    expect(timeline.segments[0].endSeconds - timeline.segments[0].startSeconds).toBeGreaterThanOrEqual(0.18)
  })

  it('arrives at a click deadline even when the recorded move is fast', () => {
    const settings = createDefaultCursorMotionSettings()
    const timeline = createCursorMotionTimeline(events(move(0, 0, 0), move(0.06, 1, 0), button(0.06, 1, 0)), settings)
    expect(timeline.targetAt(0.06)).toEqual({ x: 1, y: 0 })
    expect(timeline.segments.at(-1)?.endSeconds).toBe(0.06)
  })

  it('keeps the spring within normalized bounds and resets after a seek', () => {
    const settings = createDefaultCursorMotionSettings()
    let spring = { position: 0, velocity: 0 }
    spring = stepSpringAxis(spring, 1, 1 / 60, settings)
    expect(spring.position).toBeGreaterThanOrEqual(0)
    expect(spring.position).toBeLessThanOrEqual(1)
    const player = createCursorMotionPlayer(events(move(0, 0, 0), move(1, 1, 0)), settings)
    const raw = {
      x: 0,
      y: 0,
      visible: true,
      cursorId: null,
      shapeId: null,
      cursorKind: null,
      hotspot: { x: 0, y: 0 },
    }
    player.sample(0, raw)
    const forward = player.sample(0.2, { ...raw, x: 1 })
    const seek = player.sample(0.05, { ...raw, x: 0 })
    expect(forward?.x).toBeGreaterThanOrEqual(0)
    expect(seek?.x).toBeCloseTo(player.timeline.targetAt(0.05)?.x ?? 0)
  })

  it('selects a larger directional blur kernel as speed increases', () => {
    const slow = motionBlurTrail({ x: 0.1, y: 0.1 }, { x: 0.09, y: 0.1 }, 0.1, 0.4, { width: 1920, height: 1080 })
    const fast = motionBlurTrail({ x: 0.9, y: 0.1 }, { x: 0.1, y: 0.1 }, 1 / 30, 0.4, { width: 1920, height: 1080 })
    expect(slow.length).toBe(5)
    expect(fast.length).toBe(9)
    expect(fast[0].x).toBeLessThan(fast.at(-1)!.x)
  })
})
