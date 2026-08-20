#!/bin/sh
set -eu

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache --force /usr/share/icons/hicolor || true
fi

# electron-builder packages the Chromium SUID helper without its setuid bit;
# Electron aborts at startup unless chrome-sandbox is root-owned with mode 4755.
# This post-install script runs as root, so the failure is reported by the
# package manager and the installation is not silently broken.
if [ -f /opt/Beam/chrome-sandbox ]; then
  chown root:root /opt/Beam/chrome-sandbox
  chmod 4755 /opt/Beam/chrome-sandbox
fi

for directory in /opt/Beam/resources/input-helper /opt/beam/resources/input-helper
do
  helper=$(
    find "$directory" -maxdepth 1 -type f -name 'beam-input-helper-*' -perm /111 -print 2>/dev/null \
      | sort -V \
      | tail -n 1
  )
  if [ -n "$helper" ]; then
    "$helper" install >/dev/null
    exit 0
  fi
done

echo "Beam input helper was not found in the installed application" >&2
exit 1
