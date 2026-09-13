import { describe, expect, it } from 'vitest';
import { WaveformBands } from '../waveform-bands';

const analyzeSine = (frequency: number, sampleRate = 48_000, frames = sampleRate) => {
  const output = new Float32Array(4);
  const analyser = new WaveformBands(sampleRate, output);
  for (let frame = 0; frame < frames; frame += 1) {
    analyser.add(0.3 * Math.sin((2 * Math.PI * frequency * frame) / sampleRate), 0);
  }
  analyser.flush();
  return output;
};

describe('WaveformBands', () => {
  it('maps silence to four silent bands', () => {
    const output = new Float32Array(4);
    const analyser = new WaveformBands(48_000, output);
    for (let frame = 0; frame < 1_024; frame += 1) analyser.add(0, 0);
    analyser.flush();

    expect(output).toEqual(new Float32Array(4));
  });

  it('places a low sine primarily in the low-frequency band', () => {
    const bands = analyzeSine(80);

    expect(bands[0]).toBeGreaterThan(0);
    expect(bands[0]).toBeGreaterThan(bands[1]!);
    expect(bands[0]).toBeGreaterThan(bands[2]!);
    expect(bands[0]).toBeGreaterThan(bands[3]!);
  });

  it('places a high sine primarily in the high-frequency band', () => {
    const bands = analyzeSine(12_000);

    expect(bands[3]).toBeGreaterThan(0);
    expect(bands[3]).toBeGreaterThan(bands[0]!);
    expect(bands[3]).toBeGreaterThan(bands[1]!);
    expect(bands[3]).toBeGreaterThan(bands[2]!);
  });

  it('flushes a partial point before the next point and flushes the final tail', () => {
    const sampleRate = 48_000;
    const output = new Float32Array(8);
    const analyser = new WaveformBands(sampleRate, output);

    for (let frame = 0; frame < 128; frame += 1) {
      analyser.add(0.3 * Math.sin((2 * Math.PI * 80 * frame) / sampleRate), 0);
    }
    expect(output.slice(0, 4)).toEqual(new Float32Array(4));

    for (let frame = 0; frame < 128; frame += 1) {
      analyser.add(0.3 * Math.sin((2 * Math.PI * 12_000 * frame) / sampleRate), 1);
    }
    expect(output[0]).toBeGreaterThan(output[3]!);
    expect(output.slice(4)).toEqual(new Float32Array(4));

    analyser.flush();

    expect(output[7]).toBeGreaterThan(0);
    expect(output[7]).toBeGreaterThan(output[4]!);
  });
});
