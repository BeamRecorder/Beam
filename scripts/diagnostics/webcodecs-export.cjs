const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const codecs = { avc: 'avc1.640028', vp9: 'vp09.00.40.08', av1: 'av01.0.08M.08' };

function parseProfile(args) {
  const profile = {
    codec: codecs.avc,
    width: 1920,
    height: 1080,
    framerate: 30,
    bitrate: 5_910_000,
    bitrateMode: 'constant',
    frames: 30,
  };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--(codec|width|height|bitrate-mode)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error(`Invalid or repeated option: ${arg}`);
    const [, option, value] = match;
    seen.add(option);
    if (option === 'codec') {
      if (!Object.hasOwn(codecs, value)) throw new Error('Codec must be avc, vp9 or av1.');
      profile.codec = codecs[value];
    } else if (option === 'bitrate-mode') {
      if (!['constant', 'variable'].includes(value)) throw new Error('Bitrate mode must be constant or variable.');
      profile.bitrateMode = value;
    } else {
      if (!/^[1-9]\d*$/.test(value) || Number(value) > 4096 || Number(value) % 2) {
        throw new Error(`${option} must be an even integer between 2 and 4096.`);
      }
      profile[option] = Number(value);
    }
  }
  return profile;
}

function probeArguments(settings, platform = process.platform) {
  const args = [join(__dirname, 'webcodecs-host.cjs'), JSON.stringify(settings)];
  if (platform === 'linux') args.unshift('--ozone-platform=x11');
  return args;
}

function readProbeResult(processResult, settings) {
  const line = processResult.stdout?.split('\n').find((value) => value.startsWith('BEAM_WEBCODECS_RESULT='));
  let result;
  try {
    result = line ? JSON.parse(line.slice('BEAM_WEBCODECS_RESULT='.length)) : null;
  } catch {
    result = null;
  }
  if (
    !result ||
    !['encoded', 'failed', 'unsupported'].includes(result.status) ||
    !Number.isSafeInteger(result.packets) ||
    result.packets < 0 ||
    !Number.isSafeInteger(result.bytes) ||
    result.bytes < 0 ||
    (result.status === 'encoded' &&
      (result.packets !== settings.profile.frames ||
        result.submittedFrames !== settings.profile.frames ||
        !result.bytes ||
        result.error))
  ) {
    result = null;
  }
  const diagnostics =
    processResult.stderr
      ?.split('\n')
      .filter((value) =>
        /ERROR:|FATAL:|EncoderStatus|Encoding error|mappable shared image|exited unexpectedly/.test(value),
      )
      .slice(-8)
      .join('\n')
      .slice(-4000) ?? '';
  return {
    input: settings.input,
    acceleration: settings.acceleration,
    ...result,
    status: processResult.status === 0 && result ? result.status : 'host-failed',
    hostExitCode: processResult.status,
    hostSignal: processResult.signal,
    hostError: processResult.error?.message ?? null,
    diagnostics,
  };
}

function diagnose(args) {
  const profile = parseProfile(args);
  const temporaryRoot = join(homedir(), '.cache');
  mkdirSync(temporaryRoot, { recursive: true });
  const directory = mkdtempSync(join(temporaryRoot, 'beam-codecs-'));
  const results = [];
  try {
    const electron = require('electron');
    const env = {
      ...process.env,
      TMPDIR: directory,
      TMP: directory,
      TEMP: directory,
      BEAM_DIAGNOSTIC_DIRECTORY: directory,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const acceleration of ['prefer-software', 'prefer-hardware']) {
      for (const input of ['cpu', 'gpu']) {
        const settings = { profile, input, acceleration };
        process.stderr.write(`Checking ${acceleration}, ${input} input…\n`);
        const outcome = spawnSync(electron, probeArguments(settings), {
          env,
          encoding: 'utf8',
          timeout: 20_000,
          killSignal: 'SIGKILL',
          maxBuffer: 128 * 1024,
        });
        const result = readProbeResult(outcome, settings);
        results.push(result);
        process.stderr.write(`  ${result.status}, ${result.packets ?? 0}/${profile.frames} packets\n`);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        platform: process.platform,
        arch: process.arch,
        profile,
        note: 'Functional frame-transfer check, not a throughput benchmark. WebCodecs does not expose the actual encoder implementation.',
        results,
      },
      null,
      2,
    ),
  );
  if (results.some((result) => result.status === 'host-failed')) process.exitCode = 1;
}

if (require.main === module) {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: bun run diagnose:webcodecs [--codec=avc|vp9|av1] [--bitrate-mode=constant|variable] [--width=1920] [--height=1080]\nPrints JSON to stdout. Each CPU/GPU hardware/software test runs in a separate sandboxed Electron application.',
    );
  } else {
    try {
      diagnose(process.argv.slice(2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { parseProfile, probeArguments, readProbeResult };
