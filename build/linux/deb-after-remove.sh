#!/bin/sh
set -eu

case "${1:-remove}" in
  upgrade|failed-upgrade|abort-install|abort-upgrade|disappear)
    exit 0
    ;;
esac

if [ -x /usr/libexec/beam-input-helper ]; then
  /usr/libexec/beam-input-helper uninstall >/dev/null
fi
