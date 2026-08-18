import { describe, expect, it } from 'vitest';
import { createMediaProcessingCollector } from '../media-processing-pressure';

describe('media processing pressure collector', () => {
  it('aggregates activity and capacity across independent reporters', () => {
    let now = 100;
    const collector = createMediaProcessingCollector(() => now);
    const thumbnails = collector.reporter('thumbnails', 4);
    const waveforms = collector.reporter('waveforms', 2);

    expect(collector.metrics.value).toEqual({
      activeJobs: 0,
      pendingJobs: 0,
      capacity: 0,
      errorCount: 0,
      oldestJobAgeMs: 0,
    });

    thumbnails.update(2, 3);
    now += 125;
    waveforms.update(1, 0);

    expect(collector.metrics.value).toEqual({
      activeJobs: 3,
      pendingJobs: 3,
      capacity: 6,
      errorCount: 0,
      oldestJobAgeMs: 125,
    });
  });

  it('tracks reporter errors without changing activity counts', () => {
    let now = 0;
    const collector = createMediaProcessingCollector(() => now);
    const reporter = collector.reporter('thumbnails', 3);
    reporter.update(1, 2);
    now = 80;
    reporter.error();

    expect(collector.metrics.value).toEqual({
      activeJobs: 1,
      pendingJobs: 2,
      capacity: 3,
      errorCount: 1,
      oldestJobAgeMs: 80,
    });
  });

  it('resets age when a reporter becomes idle and removes it on dispose', () => {
    let now = 10;
    const collector = createMediaProcessingCollector(() => now);
    const thumbnails = collector.reporter('thumbnails', 4);
    const waveforms = collector.reporter('waveforms', 2);
    thumbnails.update(1, 0);
    now = 210;
    thumbnails.update(1, 0);
    expect(collector.metrics.value.oldestJobAgeMs).toBe(200);

    thumbnails.update(0, 0);
    expect(collector.metrics.value).toEqual({
      activeJobs: 0,
      pendingJobs: 0,
      capacity: 0,
      errorCount: 0,
      oldestJobAgeMs: 0,
    });

    waveforms.update(1, 0);
    waveforms.dispose();
    expect(collector.metrics.value).toEqual({
      activeJobs: 0,
      pendingJobs: 0,
      capacity: 0,
      errorCount: 0,
      oldestJobAgeMs: 0,
    });
  });

  it('clamps invalid reporter values to safe counters', () => {
    const collector = createMediaProcessingCollector(() => 0);
    const reporter = collector.reporter('waveforms', 0.4);
    reporter.update(-3.8, 2.6);

    expect(collector.metrics.value).toMatchObject({ activeJobs: 0, pendingJobs: 3, capacity: 1 });
  });
});
