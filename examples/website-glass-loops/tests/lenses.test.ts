import { describe, it, expect } from 'vitest';
import { automaticLenses, contour, lensesAt, manualLens, previewClip, recordedTelemetry,
  recordingCursor, selectedLens, sourceTime } from '../src/scene-model';
import { clampTime, clickScale, createMotion, initialPose, stateAt } from '../src/motion';
import { fitGlassContour, glassHighlightsAt } from '../../../packages/engine/src/zoom/glass-highlight';
describe('Recorded source and native generation', () => {
  it('generates three lenses from four genuine clicks, grouping the last nearby pair', () => {
    expect(recordedTelemetry.filter(p => p.interactionType === 'click').map(p => p.timeMs)).toEqual([2271,4147,6784,7896]);
    expect(automaticLenses.map(lens => lens.id.split(':').at(-1))).toEqual(['2271','4147','6784']);
    expect(automaticLenses.every(lens => lens.generation === 'automatic' && lens.effect === 'glass')).toBe(true);
  });
  it('maps the source crop into the actual preview coordinates', () => {
    const click = recordedTelemetry.find(p => p.timeMs === 2271)!;
    expect(click.cx).toBeCloseTo(.16471354166);
    expect(click.cy).toBeCloseTo((.2320085929 * 1862 - 230) / 1632);
    expect(automaticLenses[0]!.focus.cy).toBeCloseTo(click.cy);
  });
  it('preserves generation provenance and other lenses when editing magnification', () => {
    const before = lensesAt('automatic', 7.5), after = lensesAt('automatic', 8.2);
    expect(after[0]!.depth).toBe(5); expect(before[0]!.depth).toBe(4);
    expect(after[0]!.id).toBe(before[0]!.id); expect(after[0]!.generation).toBe('automatic');
    expect(after.slice(1)).toEqual(before.slice(1)); expect(automaticLenses[0]!.depth).toBe(4);
  });
  it.each([0, -1])('uses the first actual cursor sample at %sms', time => {
    expect(recordingCursor(time)).toEqual(recordedTelemetry[0]);
  });
  it('interpolates recorded movement rather than fabricating the preview path', () => {
    const a = recordedTelemetry[1]!, b = recordedTelemetry[2]!;
    const point = recordingCursor((a.timeMs+b.timeMs)/2);
    expect(point.cx).toBeCloseTo((a.cx+b.cx)/2); expect(point.cy).toBeCloseTo((a.cy+b.cy)/2);
  });
  it('holds the last real sample after the source ends', () => {
    expect(recordingCursor(10000)).toEqual(recordedTelemetry.at(-1));
  });
});
describe('Freehand lens and appearance', () => {
  it('starts with a visible circular native lens', () => {
    const lens = manualLens(0); expect(lens.glass!.shape).toBe('circle');
    expect(glassHighlightsAt([lens], 1000, 1280, 720)).toHaveLength(1);
  });
  it('hides an unfinished freehand mask until the contour is committed', () => {
    const lens = manualLens(2.5); expect(lens.glass!.path).toEqual([]);
    expect(glassHighlightsAt([lens], 1000, 1280, 720)).toHaveLength(0);
  });
  it('stores the actual native fitted editable contour', () => {
    const lens = manualLens(3.5), fitted = fitGlassContour(contour, 1280, 720)!;
    expect(lens.focus).toEqual(fitted.focus); expect(lens.glass!.path).toEqual(fitted.path);
    expect(glassHighlightsAt([lens], 1000, 1280, 720)).toHaveLength(1);
  });
  it('updates refraction and rim independently while retaining shape and placement', () => {
    const a = manualLens(4.8), b = manualLens(5.5), c = manualLens(7.5);
    expect(a.glass!.refraction).toBe(.18); expect(b.glass!.refraction).toBeCloseTo(.29);
    expect(c.glass!.refraction).toBe(.4); expect(c.glass!.rim).toBeCloseTo(.6);
    expect(a.focus).toEqual(c.focus); expect(a.glass!.path).toEqual(c.glass!.path);
  });
  it('resets the lens exactly for the loop seam', () => { expect(manualLens(10)).toEqual(manualLens(0)); });
});
describe('Seek clock and native control states', () => {
  it.each([-5, NaN, Infinity])('clamps invalid time %s', time => { expect(clampTime(time)).toBe(0); });
  it('clamps the end and keeps milliseconds explicit', () => { expect(clampTime(20000)).toBe(10); expect(clampTime(1250)).toBe(1.25); });
  it.each(['glass', 'automatic'] as const)('seeks %s forwards, backwards and across the seam', kind => {
    const pose = initialPose(), tl = createMotion(pose, kind); tl.seek(5.5); const mid = { ...pose };
    tl.seek(1); tl.seek(5.5); expect(pose).toEqual(mid);
    tl.seek(10); expect(pose).toMatchObject({ ...initialPose(), time: 10 }); tl.kill();
  });
  it('keeps click springs visible without changing their source', () => {
    expect(clickScale(0,'glass')).toBe(1); expect(clickScale(0,'automatic')).toBe(1);
    expect(clickScale(1.85,'glass')).toBeLessThan(1); expect(clickScale(2.15,'automatic')).toBeLessThan(1);
  });
  it('opens the native selection then appearance with no competing section', () => {
    expect(stateAt(2.5,'glass')).toMatchObject({ selection:true, appearance:false, drawProgress:expect.any(Number) });
    expect(stateAt(5.5,'glass')).toMatchObject({ selection:false, appearance:true, drawProgress:1 });
    expect(stateAt(0,'glass').drawProgress).toBe(0);
  });
  it('opens confirmation before generation and exposes the editable inspector after selection', () => {
    expect(stateAt(2.5,'automatic')).toMatchObject({ dialog:true, automatic:true });
    expect(stateAt(7.5,'automatic')).toMatchObject({ dialog:false, automatic:false, magnification:true });
    expect(stateAt(10,'automatic')).toMatchObject({ style:true, opacity:1 });
    expect(stateAt(9.25,'glass').opacity).toBe(.5); expect(stateAt(9.75,'glass').opacity).toBe(.5);
  });
  it('keeps source time bounded and freezes the selected real click during editing', () => {
    expect([sourceTime(0),sourceTime(3.35),sourceTime(7.39),sourceTime(7.4),sourceTime(10)])
      .toEqual([0,0,8500,2700,0]);
    expect(sourceTime(5)).toBeCloseTo(3547.5);
  });
  it('keeps generated elements hidden before confirmation and after reset', () => {
    expect(lensesAt('automatic',0)).toEqual([]); expect(lensesAt('automatic',10)).toEqual([]);
    expect(lensesAt('glass',0)).toEqual([manualLens(0)]);
  });
  it('selects the first generated lens only while editing it', () => {
    expect(selectedLens('automatic',0)).toBeNull(); expect(selectedLens('automatic',8)).toEqual(lensesAt('automatic',8)[0]);
    expect(selectedLens('automatic',10)).toBeNull(); expect(selectedLens('glass',3)).toEqual(manualLens(3));
  });
  it('uses the correct native preview layer duration for each source', () => {
    expect(previewClip('glass')).toMatchObject({ timelineDurationMs:10000, name:'Beautiful Captures' });
    expect(previewClip('automatic')).toMatchObject({ timelineDurationMs:8600, name:'Quiet Aurora 4' });
  });
});
