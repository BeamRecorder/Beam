const RECORDER_SIZE = { width: 352, height: 88 };
const RECORDER_LAYOUT_VERSION = 1;

function normalizeRecorderLayout(extras) {
  const next = extras && typeof extras === 'object' && !Array.isArray(extras) ? { ...extras } : {};
  if (next.recorderLayoutVersion !== RECORDER_LAYOUT_VERSION) {
    next.recorderPositions = {};
    next.quickSnipBarPositions = {};
    delete next.lastRecorderPosition;
    next.recorderLayoutVersion = RECORDER_LAYOUT_VERSION;
  }
  return next;
}

function bottomCenterRecorder(workArea) {
  return {
    x: Math.round(workArea.x + Math.max(0, (workArea.width - RECORDER_SIZE.width) / 2)),
    y: Math.max(workArea.y, workArea.y + workArea.height - RECORDER_SIZE.height - 16),
    ...RECORDER_SIZE,
  };
}

module.exports = { RECORDER_SIZE, normalizeRecorderLayout, bottomCenterRecorder };
