const path = require('node:path');
const { recordingEnvironment } = require('../projects/recording-diagnostics.cjs');
const { readDiagnosticFile, readDiagnosticJson, readDiagnosticEvents } = require('./diagnostic-files.cjs');

const bounded = (value, limit = 12000) => {
  const text = JSON.stringify(value);
  return text.length <= limit
    ? value
    : {
        truncated: true,
        originalCharacters: text.length,
        head: text.slice(0, limit / 4),
        tail: text.slice(-limit / 4),
      };
};

function createRecordingDiagnosticService() {
  let native = null;
  let manifestPath = null;
  let commands = [];
  const begin = () => {
    native = null;
    manifestPath = null;
    commands = [];
  };
  const record = (command, result, error = null) => {
    const sampledAt = new Date().toISOString();
    if (result && typeof result === 'object' && typeof result.state === 'string') {
      native = { sampledAt, ...result };
      if (typeof result.manifestPath === 'string') manifestPath = result.manifestPath;
    }
    if (command !== 'status' || error) {
      commands = [
        ...commands,
        {
          command,
          sampledAt,
          ...(error
            ? { error: String(error.message || error), code: error.code ?? null, stack: error.stack ?? null }
            : { state: result?.state ?? null }),
        },
      ].slice(-16);
    }
  };
  const report = async (context) => {
    if (
      !context ||
      typeof context.message !== 'string' ||
      context.message.length > 16000 ||
      (context.phase !== undefined && (typeof context.phase !== 'string' || context.phase.length > 80)) ||
      (context.recordingTime !== undefined &&
        (typeof context.recordingTime !== 'string' || context.recordingTime.length > 80))
    )
      throw new TypeError('Invalid recording diagnostic context.');
    // Snapshot the association before asynchronous reads; a later recording must not replace it.
    const association = { native, manifestPath, commands };
    const result = {
      report: 'Beam recording diagnostics',
      version: 1,
      copiedAt: new Date().toISOString(),
      context: { message: context.message, phase: context.phase, recordingTime: context.recordingTime },
      environment: recordingEnvironment(),
      native: association.native,
      commands: bounded(association.commands),
    };
    if (!association.manifestPath)
      return JSON.stringify({ ...result, sessionFiles: { error: 'NO_SESSION_MANIFEST_REPORTED' } }, null, 2);
    const root = path.dirname(association.manifestPath);
    const [final, partial, health, timing, ...cursor] = await Promise.all([
      readDiagnosticJson(root, 'manifest.json'),
      readDiagnosticJson(root, 'manifest.partial.json'),
      readDiagnosticEvents(root, 'health.jsonl'),
      readDiagnosticEvents(root, 'timing.jsonl'),
      ...[
        'cursor.json',
        'cursor.partial.jsonl',
        'telemetry.json',
        'input.json',
        'input.partial.jsonl',
        'shapes.json',
      ].map(async (name) => ({
        path: `cursor/${name}`,
        ...(await readDiagnosticFile(root, `cursor/${name}`, { metadataOnly: true })),
      })),
    ]);
    const manifest = final.value ?? partial.value;
    return JSON.stringify(
      {
        ...result,
        manifest: manifest
          ? bounded(
              {
                schemaVersion: manifest.schemaVersion,
                projectId: manifest.projectId,
                sessionId: manifest.sessionId,
                createdAtUtc: manifest.createdAtUtc,
                permissions: manifest.permissions,
                durationNs: manifest.durationNs,
                platform: manifest.platform,
                selectedSources: manifest.selectedSources,
                completed: manifest.completed,
                cursorEmbedded: manifest.cursorEmbedded,
                cursorVisible: manifest.cursorVisible,
                warnings: manifest.warnings,
                tracks: Array.isArray(manifest.tracks)
                  ? manifest.tracks.map((track) => ({
                      ...track,
                      segmentCount: Array.isArray(track?.segments) ? track.segments.length : 0,
                      segments: Array.isArray(track?.segments) ? track.segments.slice(-8) : undefined,
                    }))
                  : manifest.tracks,
              },
              18000,
            )
          : { final, partial },
        manifestSource: final.value ? 'manifest.json' : partial.value ? 'manifest.partial.json' : null,
        health: bounded(health),
        timing: bounded(timing, 6000),
        cursorFiles: cursor,
      },
      null,
      2,
    );
  };
  return { begin, record, report };
}

module.exports = { createRecordingDiagnosticService };
