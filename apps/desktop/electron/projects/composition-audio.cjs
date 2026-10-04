const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 600;
const normalizeAudioAnalysis = (value) => {
  if (
    !value ||
    !Number.isSafeInteger(value.version) ||
    value.version <= 0 ||
    !id(value.key) ||
    ![value.rangeStartMs, value.rangeDurationMs, value.sampleRate, value.channels].every(finite) ||
    value.rangeStartMs < 0 ||
    value.rangeDurationMs <= 0 ||
    value.sampleRate <= 0 ||
    value.channels <= 0
  )
    throw new Error('Analyse audio invalide');
  const optionalLevel = (level) => (finite(level) ? Math.max(-240, Math.min(24, level)) : null);
  return {
    version: value.version,
    key: value.key,
    rangeStartMs: Math.round(value.rangeStartMs),
    rangeDurationMs: Math.round(value.rangeDurationMs),
    sampleRate: Math.round(value.sampleRate),
    channels: Math.round(value.channels),
    integratedLufs: optionalLevel(value.integratedLufs),
    samplePeakDbfs: optionalLevel(value.samplePeakDbfs),
    truePeakDbtp: optionalLevel(value.truePeakDbtp),
  };
};
const normalizeAudioNormalization = (value) => {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value.enabled !== 'boolean' ||
    !['lufs', 'peak'].includes(value.mode) ||
    ![value.targetLufs, value.targetPeakDbtp, value.appliedGainDb].every(finite) ||
    !Number.isSafeInteger(value.analysisVersion) ||
    value.analysisVersion <= 0 ||
    !id(value.analysisKey)
  )
    throw new Error('Normalisation audio invalide');
  return {
    enabled: value.enabled,
    mode: value.mode,
    targetLufs: Math.max(-60, Math.min(0, value.targetLufs)),
    targetPeakDbtp: Math.max(-24, Math.min(0, value.targetPeakDbtp)),
    appliedGainDb: Math.max(-24, Math.min(24, value.appliedGainDb)),
    analysisVersion: value.analysisVersion,
    analysisKey: value.analysisKey,
  };
};

module.exports = { normalizeAudioAnalysis, normalizeAudioNormalization };
