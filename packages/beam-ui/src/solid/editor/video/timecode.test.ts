import { expect, it } from 'vitest';
import { frameTimecode, parseTimecode, stepFrame } from './timecode';
it.each([[0, 30, '00:00:00:00'], [1000 / 30, 30, '00:00:00:01'], [61000, 30, '00:01:01:00'], [3600999, 60, '01:00:00:59'], [-1, 30, '00:00:00:00']])('formats frame time %s', (time, fps, expected) => expect(frameTimecode(Number(time), Number(fps))).toBe(expected));
it.each(['bad', '00:60:00:00', '00:00:60:00', '00:00:00:30', '-1:00:00:00'])('rejects impossible timecode %s', value => expect(parseTimecode(value, 30)).toBeUndefined());
it('round trips a frame position and supports rates clamped to one', () => {
  expect(parseTimecode('01:02:03:15', 30)).toBe(3723500);
  expect(frameTimecode(1000, 0)).toBe('00:00:01:00'); expect(parseTimecode('00:00:01:00', 0)).toBe(1000);
});
it('round trips fractional frame clocks, including millisecond transport rounding',()=>{
  for(const frame of [0,1,29,30,9000,108000]){
    const time=frame*1000*1001/30000;
    expect(parseTimecode(frameTimecode(time,30000,1001),30000,1001)).toBeCloseTo(time,8);
    expect(frameTimecode(Math.round(time),30000,1001)).toBe(frameTimecode(time,30000,1001));
  }
});
it('rejects timecodes whose frame address cannot be represented exactly',()=>expect(parseTimecode('99999999999999999999:00:00:00',30)).toBeUndefined());
it('steps by absolute fractional frame positions without accumulating rounded milliseconds',()=>{
  let time=0;
  for(let index=0;index<10000;index++)time=Math.round(stepFrame(time,1,30000,1001));
  expect(time).toBe(Math.round(10000*1000*1001/30000));
  expect(stepFrame(0,-1,24)).toBe(0);expect(stepFrame(1000,1,24)).toBeCloseTo(25000/24,8);
});
