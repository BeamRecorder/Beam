import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";

if (!process.argv[2]) throw new Error("Provide the website-private directory.");
const website = resolve(process.argv[2]);
function probe(path, countFrames = false) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      ...(countFrames ? ["-count_frames"] : []),
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}
for (const theme of ["light", "dark"]) {
  const path = resolve(website, `public/media/editing-studio-${theme}.webm`);
  const video = probe(path, true);
  assert.equal(
    video.streams.length,
    1,
    "Silent video must have exactly one stream",
  );
  const stream = video.streams[0];
  assert.equal(stream.codec_type, "video");
  assert.equal(stream.codec_name, "vp9");
  assert.equal(stream.width, 1280);
  assert.equal(stream.height, 800);
  assert.equal(stream.r_frame_rate, "60/1");
  assert.equal(Number(stream.nb_read_frames), 900);
  assert.equal(Number(video.format.duration), 15);
  assert.ok(statSync(path).size < 4000000, "Website video size budget");
  const posterPath = resolve(
    website,
    `public/images/features/editing-studio-${theme}.webp`,
  );
  const poster = probe(posterPath).streams[0];
  assert.equal(poster.codec_name, "webp");
  assert.equal(poster.width, 1280);
  assert.equal(poster.height, 800);
  assert.ok(statSync(posterPath).size < 200000, "Website poster size budget");
  console.log(
    `${theme}: VP9, 900 frames, 15 seconds, 1280 × 800 / 60 fps, no audio; WebP poster verified.`,
  );
}
