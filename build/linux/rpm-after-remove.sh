#!/bin/sh
set -eu

if [ "${1:-0}" != "0" ]; then
  exit 0
fi

if [ -x /usr/libexec/beam-input-helper ]; then
  /usr/libexec/beam-input-helper uninstall >/dev/null
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache --force /usr/share/icons/hicolor || true
fi
