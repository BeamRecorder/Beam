import type { PreviewQuality } from '~/media/playback';
import type {
  PreviewPerformanceChannel,
  PreviewPerformanceHealthState,
  PreviewPerformanceScores,
} from './preview-performance-types';

const WARNING_SCORE = 0.55;
const RECOVERY_SCORE = 0.32;
const WARNING_SAMPLES = 4;
const CRITICAL_SAMPLES = 8;
const RECOVERY_SAMPLES = 4;

export const clampPerformanceScore = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

export function previewPerformanceIssues(scores: PreviewPerformanceScores): PreviewPerformanceChannel[] {
  return (['ui', 'worker', 'audio', 'media'] as const).filter((channel) => scores[channel] >= WARNING_SCORE);
}

export function nextPreviewPerformanceHealth(
  previous: PreviewPerformanceHealthState,
  scores: PreviewPerformanceScores,
): PreviewPerformanceHealthState {
  const severity = Math.max(scores.ui, scores.worker, scores.audio);
  if (severity >= WARNING_SCORE) {
    const badSamples = previous.badSamples + 1;
    return {
      status: badSamples >= CRITICAL_SAMPLES ? 'critical' : badSamples >= WARNING_SAMPLES ? 'warning' : previous.status,
      badSamples,
      goodSamples: 0,
    };
  }
  if (severity <= RECOVERY_SCORE) {
    const goodSamples = previous.goodSamples + 1;
    return {
      status: goodSamples >= RECOVERY_SAMPLES ? 'good' : previous.status,
      badSamples: 0,
      goodSamples,
    };
  }
  return { ...previous, badSamples: 0, goodSamples: 0 };
}

export function recommendedPreviewQuality(status: PreviewPerformanceHealthState['status'], quality: PreviewQuality) {
  if (status !== 'warning' && status !== 'critical') return null;
  if (quality === 'auto' || quality === 'full') return 'half' as const;
  if (quality === 'half') return 'quarter' as const;
  return null;
}

export const idlePreviewPerformanceHealth = (): PreviewPerformanceHealthState => ({
  status: 'idle',
  badSamples: 0,
  goodSamples: 0,
});
