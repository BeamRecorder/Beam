#!/bin/sh
case "$2" in
-version) printf 'ffmpeg version 8.0.1-3ubuntu2+esm1 Copyright (c) 2000-2025 the FFmpeg developers\n' ;;
-encoders) printf ' V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10\n' ;;
-muxers) printf '  E  mp4             MP4 (MPEG-4 Part 14)\n' ;;
esac
