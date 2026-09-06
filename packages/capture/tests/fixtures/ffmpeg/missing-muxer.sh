#!/bin/sh
case "$2" in
-version) printf 'ffmpeg version fake\n' ;;
-encoders) printf ' V....D libx264 fake\n' ;;
-muxers) printf ' E matroska fake\n' ;;
esac
