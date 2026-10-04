const assert = require('node:assert/strict');
const { test } = require('node:test');
const { probeFrames } = require('../scripts/diagnostics/webcodecs-frame-probe.cjs');
const { parseProfile } = require('../scripts/diagnostics/webcodecs-export.cjs');

function installBrowser(t, options = {}) {
  const saved = Object.fromEntries(
    ['VideoEncoder', 'VideoFrame', 'OffscreenCanvas'].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  t.after(() => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const calls = { context: [], frames: [], encodes: [], closedEncoders: 0 };
  globalThis.OffscreenCanvas = class {
    getContext(name, settings) {
      calls.context.push({ name, settings });
      return options.missingContext
        ? null
        : {
            COLOR_BUFFER_BIT: 0x4000,
            fillRect() {},
            clearColor() {},
            clear() {},
          };
    }
  };
  globalThis.VideoFrame = class {
    constructor(_canvas, settings) {
      this.timestamp = settings.timestamp;
      this.format = options.changingFormat && calls.frames.length ? 'BGRA' : 'RGBX';
      this.closed = false;
      calls.frames.push(this);
    }
    close() {
      this.closed = true;
    }
  };
  globalThis.VideoEncoder = class {
    static async isConfigSupported() {
      return { supported: options.supported !== false };
    }
    constructor(callbacks) {
      this.callbacks = callbacks;
      this.state = 'unconfigured';
      this.encodeQueueSize = 0;
    }
    configure(config) {
      this.config = config;
      this.state = 'configured';
    }
    encode(frame) {
      calls.encodes.push(frame.timestamp);
      if (options.nativeError) {
        this.state = 'closed';
        this.callbacks.error(new Error('Native image allocation failed'));
        throw new Error('Codec closed');
      }
      if (!options.noPackets) this.callbacks.output({ byteLength: 40 });
    }
    async flush() {
      if (options.flushError) throw new Error('Flush failed');
    }
    close() {
      this.state = 'closed';
      calls.closedEncoders++;
    }
  };
  return calls;
}

test('frame probe verifies every packet, frame ownership and timeline timestamps', async (t) => {
  const calls = installBrowser(t);
  const result = await probeFrames(parseProfile([]), 'gpu', 'prefer-hardware');
  assert.equal(result.status, 'encoded');
  assert.equal(result.packets, 30);
  assert.equal(result.bytes, 1200);
  assert.equal(result.submittedFrames, 30);
  assert.equal(result.error, null);
  assert.deepEqual(calls.context, [{ name: 'webgl2', settings: { alpha: false, preserveDrawingBuffer: true } }]);
  assert.equal(calls.encodes[29], Math.round((29 * 1_000_000) / 30));
  assert.ok(calls.frames.every((frame) => frame.closed));
  assert.equal(calls.closedEncoders, 1);
});

test('unsupported configuration never allocates a canvas or video frame', async (t) => {
  const calls = installBrowser(t, { supported: false });
  const result = await probeFrames(parseProfile([]), 'cpu', 'prefer-hardware');
  assert.equal(result.status, 'unsupported');
  assert.equal(result.packets, 0);
  assert.deepEqual(calls.context, []);
  assert.deepEqual(calls.frames, []);
});

test('CPU witness uses a CPU-backed context and cannot pass without packets', async (t) => {
  const calls = installBrowser(t, { noPackets: true });
  const result = await probeFrames(parseProfile([]), 'cpu', 'prefer-software');
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Expected 30 packets, received 0/);
  assert.deepEqual(calls.context, [{ name: '2d', settings: { willReadFrequently: true } }]);
  assert.ok(calls.frames.every((frame) => frame.closed));
  assert.equal(calls.closedEncoders, 1);
});

test('native allocation error survives a subsequent closed-codec exception', async (t) => {
  const calls = installBrowser(t, { nativeError: true });
  const result = await probeFrames(parseProfile([]), 'gpu', 'prefer-hardware');
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Native image allocation failed/);
  assert.equal(result.submittedFrames, 0);
  assert.ok(calls.frames.every((frame) => frame.closed));
  assert.equal(calls.closedEncoders, 0);
});

test('missing GPU context fails explicitly without starting an encoder', async (t) => {
  const calls = installBrowser(t, { missingContext: true });
  const result = await probeFrames(parseProfile([]), 'gpu', 'prefer-hardware');
  assert.match(result.error, /Unable to create gpu canvas context/);
  assert.equal(result.status, 'failed');
  assert.deepEqual(calls.frames, []);
});

test('flush failure releases frames and records the original GPU input format', async (t) => {
  const calls = installBrowser(t, { changingFormat: true, flushError: true });
  const result = await probeFrames(parseProfile([]), 'gpu', 'prefer-hardware');
  assert.equal(result.frameFormat, 'RGBX');
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Flush failed/);
  assert.ok(calls.frames.every((frame) => frame.closed));
  assert.equal(calls.closedEncoders, 1);
});
