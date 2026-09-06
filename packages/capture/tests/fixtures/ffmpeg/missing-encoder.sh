#!/bin/sh
case "$2" in
-version) printf 'ffmpeg version fake\n' ;;
-encoders) printf ' V..... mpeg4 fake\n' ;;
-muxers) printf ' E mp4 fake\n' ;;
esac
