import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./beam-cli.mjs";

function decode(name) {
  const path = resolve(root, "assets", name);
  const output = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-t",
      "8",
      "-f",
      "f32le",
      "-ar",
      "8000",
      "-ac",
      "1",
      "pipe:1",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  if (output.status !== 0)
    throw new Error("External FFmpeg could not decode waveform PCM.");
  const bytes = output.stdout;
  const pcm = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const peaks = Array.from({ length: 256 }, (_, index) => {
    let peak = 0;
    const start = Math.floor((index * pcm.length) / 256),
      end = Math.floor(((index + 1) * pcm.length) / 256);
    for (let sample = start; sample < end; sample++)
      peak = Math.max(peak, Math.abs(pcm[sample]));
    return Number(peak.toFixed(5));
  });
  const peak = Math.max(...peaks);
  return {
    bars: peaks.map((peak) => 2 + peak * 34),
    duration: pcm.length / 8000,
    gainDb: Number((-1 - 20 * Math.log10(peak)).toFixed(2)),
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  };
}
const voice = decode("voice.wav"),
  system = decode("system-audio.ogg");
writeFileSync(
  resolve(root, "assets/waveform.json"),
  JSON.stringify({ ...voice, systemBars: system.bars }, null, 2) + "\n",
);
