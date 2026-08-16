#!/bin/sh
set -eu

mkdir -p /run/clamav /var/log/clamav
chown -R clamav:clamav /run/clamav /var/log/clamav /var/lib/clamav 2>/dev/null || true

# Refresh signatures on boot when network is available. The official image also
# ships a database, so a transient FreshClam failure must not prevent startup.
freshclam --stdout || true
freshclam -d -c "${FRESHCLAM_CHECKS:-12}" >/proc/1/fd/1 2>/proc/1/fd/2 || true

clamd --config-file=/etc/clamav/clamd.conf >/proc/1/fd/1 2>/proc/1/fd/2 &
CLAMD_PID=$!

attempt=0
until printf 'zPING\0' | nc 127.0.0.1 3310 2>/dev/null | tr '\0' '\n' | grep -q '^PONG$'; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 180 ]; then
    echo "clamd failed to become ready" >&2
    kill "$CLAMD_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

exec /opt/dollar-scanner/scanner
