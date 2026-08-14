#!/bin/sh
set -eu

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
