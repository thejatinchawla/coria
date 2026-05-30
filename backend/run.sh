#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  echo "Creating .venv (macOS has no global pip — use this script)..."
  python3 -m venv .venv
fi

echo "Installing deps into .venv..."
.venv/bin/pip install -r requirements.txt

exec .venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000
