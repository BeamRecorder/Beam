#!/bin/sh
set -eu

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache --force /usr/share/icons/hicolor || true
fi

for helper in \
  /opt/Beam/resources/input-helper/beam-input-helper \
  /opt/beam/resources/input-helper/beam-input-helper
do
  if [ -x "$helper" ]; then
    "$helper" install >/dev/null
    exit 0
  fi
done

echo "Beam input helper was not found in the installed application" >&2
exit 1
