#!/usr/bin/env bash
set -euo pipefail

engine_path=${1:?usage: verify-parent-death.sh /absolute/path/to/capture-engine}
case "$engine_path" in
  /*) ;;
  *) echo "capture-engine path must be absolute" >&2; exit 2 ;;
esac
test -x "$engine_path"

test_root=$(mktemp -d)
writer_pid=
owner_pid=
engine_pid=
cleanup() {
  if test -n "$owner_pid"; then
    kill -KILL "$owner_pid" 2>/dev/null || true
    wait "$owner_pid" 2>/dev/null || true
  fi
  if test -n "$engine_pid"; then
    kill -KILL "$engine_pid" 2>/dev/null || true
  fi
  if test -n "$writer_pid"; then
    kill "$writer_pid" 2>/dev/null || true
    wait "$writer_pid" 2>/dev/null || true
  fi
  rm -rf -- "$test_root"
}
trap cleanup EXIT

mkfifo "$test_root/engine-stdin"
tail -f /dev/null >"$test_root/engine-stdin" &
writer_pid=$!

bash -c '
  BEAM_PARENT_PID=$$ "$1" <"$2/engine-stdin" >"$2/out" 2>"$2/err" &
  printf "%s\n" "$!" >"$2/pid"
  wait
' _ "$engine_path" "$test_root" &
owner_pid=$!

deadline=$((SECONDS + 3))
while ! test -s "$test_root/pid" && test "$SECONDS" -lt "$deadline"; do
  read -r -t 0.1 _ </dev/null || true
done
test -s "$test_root/pid"

engine_pid=$(sed -n '1p' "$test_root/pid")
case "$engine_pid" in
  ''|*[!0-9]*) echo "invalid engine PID" >&2; exit 1 ;;
esac
kill -KILL "$owner_pid"
wait "$owner_pid" 2>/dev/null || true
owner_pid=

deadline=$((SECONDS + 6))
while test -e "/proc/$engine_pid/exe" && test "$SECONDS" -lt "$deadline"; do
  read -r -t 0.1 _ </dev/null || true
done
if test -e "/proc/$engine_pid/exe"; then
  echo "capture-engine PID $engine_pid survived direct parent death" >&2
  exit 1
fi
echo "PASS: capture-engine PID $engine_pid exited while stdin remained open"
