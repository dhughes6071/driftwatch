#!/usr/bin/env bash
#
# Safely write a secret into .env.
#
# Why a script rather than "just edit the file": typing a key on the command
# line puts it in your shell history in plaintext, which is how keys leak.
# `read -rs` reads without echoing to the screen and without the VALUE ever
# reaching your history. The key goes straight from your clipboard into .env.
#
# Usage:  bash scripts/set-key.sh ANTHROPIC_API_KEY
#         bash scripts/set-key.sh GITHUB_TOKEN

set -euo pipefail

VAR="${1:-ANTHROPIC_API_KEY}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env found at $ENV_FILE"
  echo "Create it first:  cp .env.example .env"
  exit 1
fi

echo "Setting $VAR in .env"
echo "Paste the value and press Enter. Nothing will appear as you type -- that's expected."
printf '  > '

# -r: don't mangle backslashes.  -s: don't echo to the terminal.
read -rs VALUE
echo

if [ -z "$VALUE" ]; then
  echo "Nothing entered. No change made."
  exit 1
fi

# Warn about the most common paste mistakes rather than writing a broken value.
case "$VALUE" in
  *" "*) echo "WARNING: the value contains a space. Did an extra character get copied?" ;;
esac
if [ "$VAR" = "ANTHROPIC_API_KEY" ] && [[ "$VALUE" != sk-ant-* ]]; then
  echo "WARNING: an Anthropic key normally starts with 'sk-ant-'. Continuing anyway."
fi

# Rewrite the line in place. Python rather than sed so the value is passed via
# the environment and never becomes part of a command line other processes
# could see in the process table.
VALUE="$VALUE" VAR="$VAR" ENV_FILE="$ENV_FILE" python3 - <<'PY'
import os, re

var, value, path = os.environ["VAR"], os.environ["VALUE"], os.environ["ENV_FILE"]
text = open(path).read()
line = f"{var}={value}"

if re.search(rf"^{re.escape(var)}=.*$", text, flags=re.M):
    text = re.sub(rf"^{re.escape(var)}=.*$", lambda _: line, text, flags=re.M)
else:
    text = text.rstrip("\n") + "\n" + line + "\n"

open(path, "w").write(text)
os.chmod(path, 0o600)
print(f"OK: {var} written to .env ({len(value)} characters). File permissions set to 0600.")
PY

unset VALUE
echo
echo "Done. The value is in .env, which is gitignored and readable only by you."
echo "It did NOT go into your shell history."
