#!/usr/bin/env bash
# Start the local Synapse on WSL. Do not run this from Windows Docker Desktop.
set -euo pipefail

if [ -z "${WSL_DISTRO_NAME:-}" ] && [ "$(uname -s)" != "Linux" ]; then
  echo "Run this inside WSL:  wsl -e bash packages/frontend/test/synapse/start.sh" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR/data"

if ! command -v docker >/dev/null; then
  echo "docker is not installed in this WSL distro." >&2
  exit 1
fi

if [ ! -f "$DIR/data/homeserver.yaml" ]; then
  docker run --rm \
    -e SYNAPSE_SERVER_NAME=localhost \
    -e SYNAPSE_REPORT_STATS=no \
    -e SYNAPSE_NO_TLS=1 \
    -v "$DIR/data:/data" \
    matrixdotorg/synapse:latest generate
fi

CONFIG="$DIR/data/homeserver.yaml"
python3 - "$CONFIG" <<'PY'
from pathlib import Path
import re
import sys
path = Path(sys.argv[1])
text = path.read_text()
for key, value in {
    "enable_registration": "true",
    "enable_registration_without_verification": "true",
    "suppress_key_server_warning": "true",
}.items():
    pattern = re.compile(rf"^{re.escape(key)}:.*$", re.M)
    if pattern.search(text):
        text = pattern.sub(f"{key}: {value}", text)
    else:
        text = text.rstrip() + f"\n{key}: {value}\n"

# Synapse rate limits registration, login, sends and joins by default. A test run does all four in
# bursts and would otherwise fail with 429s that say nothing about the client under test.
MARKER = "# mercury-test-rate-limits"
if MARKER not in text:
    limits = "\n".join([
        "",
        MARKER,
        "rc_message:",
        "  per_second: 1000",
        "  burst_count: 1000",
        "rc_registration:",
        "  per_second: 1000",
        "  burst_count: 1000",
        "rc_login:",
        "  address:",
        "    per_second: 1000",
        "    burst_count: 1000",
        "  account:",
        "    per_second: 1000",
        "    burst_count: 1000",
        "  failed_attempts:",
        "    per_second: 1000",
        "    burst_count: 1000",
        "rc_joins:",
        "  local:",
        "    per_second: 1000",
        "    burst_count: 1000",
        "  remote:",
        "    per_second: 1000",
        "    burst_count: 1000",
        "rc_invites:",
        "  per_room:",
        "    per_second: 1000",
        "    burst_count: 1000",
        "  per_user:",
        "    per_second: 1000",
        "    burst_count: 1000",
        "",
    ])
    text = text.rstrip() + "\n" + limits
path.write_text(text)
PY

docker compose -f "$DIR/docker-compose.yml" up -d

WSL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "Synapse is running inside WSL."
echo "  from WSL:              http://127.0.0.1:8008"
echo "  from Windows browser:  http://127.0.0.1:8008"
if [ -n "${WSL_IP:-}" ]; then
  echo "  via WSL IP:            http://${WSL_IP}:8008"
fi
echo "Matrix IDs look like @alice:localhost"
