function validateExperimentalRequest(request) {
  if (!request || !['mp4', 'webm'].includes(request.format) || !['low', 'medium', 'high'].includes(request.preset))
    throw new Error('Invalid experimental export request.');
  const snapshot = request.snapshot;
  const { width, height } = snapshot?.canvas ?? {};
  const fps = snapshot?.render?.fps;
  if (![width, height].every((value) => Number.isSafeInteger(value) && value >= 2 && value <= 8192 && value % 2 === 0))
    throw new Error('Experimental export requires even dimensions from 2 to 8192.');
  if (
    !Number.isSafeInteger(fps) ||
    fps < 1 ||
    fps > 120 ||
    !Number.isFinite(snapshot?.duration) ||
    snapshot.duration <= 0 ||
    snapshot.duration > 86_400
  )
    throw new Error('Invalid experimental export duration or frame rate.');
  if (
    !Array.isArray(snapshot.composition?.clips) ||
    !Array.isArray(snapshot.composition?.assets) ||
    snapshot.composition.clips.length > 100_000 ||
    snapshot.composition.assets.length > 100_000 ||
    Buffer.byteLength(JSON.stringify(request)) > 32 * 1024 * 1024
  )
    throw new Error('Invalid or oversized experimental export document.');
  return { width, height, fps, frames: Math.ceil(snapshot.duration * fps) };
}

function readNativeResult(stdout, frames) {
  const line = stdout.split('\n').find((value) => value.startsWith('BEAM_FFMPEG_RESULT='));
  const result = line ? JSON.parse(line.slice('BEAM_FFMPEG_RESULT='.length)) : null;
  if (
    !result ||
    result.packets !== frames ||
    !Number.isSafeInteger(result.bytes) ||
    result.bytes <= 0 ||
    !Number.isSafeInteger(result.keyframes) ||
    result.keyframes < 1 ||
    result.keyframes > frames ||
    ![result.conversionMs, result.encodingMs].every((value) => Number.isFinite(value) && value >= 0)
  )
    throw new Error('FFmpeg did not confirm a complete hardware export.');
  return result;
}
module.exports = { validateExperimentalRequest, readNativeResult };
