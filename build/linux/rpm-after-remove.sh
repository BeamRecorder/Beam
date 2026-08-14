#!/bin/sh
set -eu

if [ "${1:-0}" != "0" ]; then
  exit 0
fi

if [ -x /usr/libexec/beam-input-helper ]; then
  /usr/libexec/beam-input-helper uninstall >/dev/null
fi
