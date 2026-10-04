#!/usr/bin/env bash
# Build-time dependency only: the packer never copies this prefix into Beam.
set -euo pipefail

beam_ffmpeg_version=8.1.3
beam_ffmpeg_sha256=7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3
beam_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
beam_ffmpeg_prefix="${BEAM_FFMPEG_LGPL_PREFIX:-$beam_root/build/native/ffmpeg-lgpl}"
mkdir -p "$beam_ffmpeg_prefix"
beam_ffmpeg_prefix="$(cd "$beam_ffmpeg_prefix" && pwd)"
beam_archive="$beam_ffmpeg_prefix/ffmpeg-$beam_ffmpeg_version.tar.xz"

curl --fail --location --retry 3 --connect-timeout 15 --max-time 180 \
  "https://ffmpeg.org/releases/ffmpeg-$beam_ffmpeg_version.tar.xz" -o "$beam_archive"
printf '%s  %s\n' "$beam_ffmpeg_sha256" "$beam_archive" | sha256sum --check
tar --extract --file="$beam_archive" --directory="$beam_ffmpeg_prefix"
cd "$beam_ffmpeg_prefix/ffmpeg-$beam_ffmpeg_version"
./configure \
  --prefix="$beam_ffmpeg_prefix" --libdir="$beam_ffmpeg_prefix/lib" \
  --enable-shared --disable-static --disable-gpl --disable-nonfree --disable-version3 \
  --disable-autodetect --enable-vaapi --enable-libdrm --enable-libopus \
  --disable-doc --disable-debug --disable-ffplay
make -j "${BEAM_FFMPEG_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN)}"
make install

printf '\nLGPL build dependency ready at %s\n' "$beam_ffmpeg_prefix"
