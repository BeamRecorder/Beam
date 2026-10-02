const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { homedir } = require('node:os');
const { spawnSync } = require('node:child_process');
const enabled = process.platform === 'linux' && process.env.BEAM_TEST_FFMPEG_GPU === '1';
const root = path.resolve(__dirname, '..');
const colors = [
  [0, 255, 0],
  [0, 255, 0],
  [0, 255, 0],
  ...Array(3)
    .fill([
      [255, 0, 0],
      [0, 0, 255],
      [255, 255, 0],
    ])
    .flat(),
];
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 30000, ...options });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, String(result.stderr));
  return result.stdout;
}
function runCase(
  format,
  { audio = false, cancel = false, fourK = false, highFps = false, video: sourceVideo = false } = {},
) {
  const count = highFps ? 120 : 12;
  const fps = highFps ? 60 : 10;
  const directory = fs.mkdtempSync(path.join(homedir(), '.cache/beam-gpu-test-'));
  const env = {
    ...process.env,
    TMPDIR: directory,
    BEAM_TEST_DIRECTORY: directory,
    BEAM_TEST_FORMAT: format,
    BEAM_TEST_AUDIO: audio ? '1' : '0',
    BEAM_TEST_CANCEL: cancel ? '1' : '0',
    BEAM_TEST_4K: fourK ? '1' : '0',
    BEAM_TEST_VIDEO: sourceVideo ? '1' : '0',
    ...(highFps ? { BEAM_TEST_FPS: String(fps), BEAM_TEST_FRAMES: String(count) } : {}),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    if (sourceVideo)
      command('ffmpeg', [
        '-v',
        'error',
        '-vaapi_device',
        process.env.BEAM_FFMPEG_DRM_DEVICE || '/dev/dri/renderD128',
        '-f',
        'lavfi',
        '-i',
        "color=c=lime:s=3840x2160:r=10:d=1.2,drawbox=color=red:t=fill:enable='eq(mod(n,3),1)',drawbox=color=blue:t=fill:enable='eq(mod(n,3),2)'",
        '-vf',
        'format=rgb24,scale=out_color_matrix=bt709,format=nv12,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=limited,hwupload',
        '-c:v',
        'h264_vaapi',
        '-b:v',
        '3000000',
        '-bf',
        '0',
        '-g',
        '10',
        '-colorspace',
        'bt709',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        path.join(directory, 'source.mp4'),
      ]);
    command(
      path.join(root, 'node_modules/electron/dist/electron'),
      ['--ozone-platform=x11', path.join(__dirname, 'fixtures/ffmpeg-export/host.cjs')],
      { env },
    );
    if (cancel) {
      assert.equal(fs.existsSync(path.join(directory, 'diagnostics.json')), false);
      return;
    }
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'diagnostics.json')));
    assert.equal(report.encoderCodec, format === 'mp4' ? 'h264_vaapi' : 'vp9_vaapi');
    assert.equal(report.frameTransfer, 'dma-buf-direct');
    assert.equal(report.encodedPacketCount, count);
    assert.ok(report.presentationMs >= 0);
    assert.ok(report.nativeConversionMs > 0);
    assert.ok(report.nativeEncodingMs > 0);
    const destination = path.join(directory, `result.${format}`);
    const probe = JSON.parse(
      command('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', destination]),
    );
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    assert.equal(Number(video.nb_read_frames), count);
    assert.equal(video.width, fourK ? 3840 : highFps || sourceVideo ? 1920 : 640);
    assert.equal(video.height, fourK ? 2160 : highFps || sourceVideo ? 1080 : 360);
    assert.ok(Math.abs(Number(probe.format.duration) - count / fps) < 0.03);
    // CPU decoding here validates the file; it is outside the GPU export path.
    const pixels = command(
      'ffmpeg',
      ['-v', 'error', '-i', destination, '-vf', 'crop=2:2:320:180', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { encoding: null },
    );
    assert.equal(pixels.length, count * 12);
    let expectedColors = colors;
    if (sourceVideo) {
      const sourcePixels = command(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          path.join(directory, 'source.mp4'),
          '-vf',
          'crop=2:2:320:180',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          '-',
        ],
        { encoding: null },
      );
      expectedColors = Array.from({ length: count }, (_, index) => [
        ...sourcePixels.subarray(index * 12, index * 12 + 3),
      ]);
      assert.deepEqual(report.inputVideoCodecs, ['avc']);
    }
    Array.from(
      { length: count },
      (_, index) => expectedColors[Math.floor((index * 10) / fps) % expectedColors.length],
    ).forEach((rgb, frame) =>
      rgb.forEach((value, channel) =>
        assert.ok(
          Math.abs(pixels[frame * 12 + channel] - value) < 8,
          `frame ${frame}, channel ${channel}: actual ${pixels[frame * 12 + channel]}, expected ${value}`,
        ),
      ),
    );
    if (audio) {
      const stream = probe.streams.find((stream) => stream.codec_type === 'audio');
      assert.equal(stream.sample_rate, '48000');
      assert.equal(stream.channels, 2);
      assert.equal(report.audioEncoderImplementation, 'ffmpeg');
      const pcm = command('ffmpeg', ['-v', 'error', '-i', destination, '-map', '0:a:0', '-f', 'f32le', '-'], {
        encoding: null,
      });
      const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
      assert.ok(samples.some((value) => Math.abs(value) > 0.1));
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test('Linux DMA-BUF → VA-API exports all ordered/static MP4 frames and audio', { skip: !enabled, timeout: 35000 }, () =>
  runCase('mp4', { audio: true }),
);
test('Linux DMA-BUF → VA-API exports all WebM frames and Opus audio', { skip: !enabled, timeout: 35000 }, () =>
  runCase('webm', { audio: true }),
);
test('cancellation terminates the GPU renderer and native processes', { skip: !enabled, timeout: 35000 }, () =>
  runCase('mp4', { cancel: true }),
);
test('Linux GPU export preserves 4K output dimensions and ordered frames', { skip: !enabled, timeout: 35000 }, () =>
  runCase('mp4', { fourK: true }),
);
test(
  'fast capture preserves every static and changing frame of a 1080p60 export',
  { skip: !enabled, timeout: 35000 },
  () => runCase('mp4', { highFps: true }),
);
test(
  'fast GPU capture preserves ordered decoded 4K video frames when exporting 1080p',
  { skip: !enabled, timeout: 35000 },
  () => runCase('mp4', { video: true }),
);
