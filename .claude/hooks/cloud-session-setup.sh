#!/usr/bin/env bash
# Cloud sessions (Claude Code on the web) start from a fresh clone with no
# node_modules. Install from the lockfile so checks and tests can run.
# Local sessions exit here and are unaffected.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f package.json ] || exit 0

lock=package.json
for f in pnpm-lock.yaml package-lock.json; do [ -f "$f" ] && { lock=$f; break; }; done

log=${TMPDIR:-/tmp}/cloud-session-setup.log
: > "$log"

warn() {
  printf 'Cloud setup: %s See %s.\n' "$1" "$log" >> "$log"
  printf 'Cloud setup: %s See %s.\n' "$1" "$log"
}

# Match .nvmrc's major Node version when the image has a different default.
want=$([ -f .nvmrc ] && tr -d 'v \n' < .nvmrc); want=${want%%.*}
have=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -n "$want" ] && [ "$want" != "$have" ] && [ -s "$nvm_sh" ]; then
  # shellcheck source=/dev/null
  . "$nvm_sh"
  if { nvm use --silent "$want" || nvm install "$want"; } >> "$log" 2>&1 && [ -n "$CLAUDE_ENV_FILE" ]; then
    echo "export PATH=\"$(dirname "$(nvm which "$want")"):\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

# Never let npm ci remove a resumed session's dependencies on the wrong Node.
have=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
if [ -n "$want" ] && [ "$want" != "$have" ]; then
  warn "could not restore Node $want; skipping dependency install."
  exit 0
fi
node_version=$(node -v 2>/dev/null) || {
  warn 'Node is unavailable; skipping dependency install.'
  exit 0
}

# A resumed shell still needs Node restored before it can reuse dependencies.
# Content checks also detect manifest edits that preserve file timestamps.
stamp=node_modules/.cloud-session-setup
if command -v sha256sum >/dev/null 2>&1; then
  hash_command=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  hash_command=(shasum -a 256)
else
  warn 'no SHA-256 tool is available; skipping dependency install.'
  exit 0
fi
cache_key=$("${hash_command[@]}" "$lock" package.json && printf '%s\n' "$node_version") || {
  warn 'could not hash dependency manifests; skipping dependency install.'
  exit 0
}
[ -d node_modules ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$cache_key" ] && exit 0

case "$lock" in
  pnpm-lock.yaml)
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    corepack enable >> "$log" 2>&1
    pnpm install --frozen-lockfile >> "$log" 2>&1 ;;
  package-lock.json) npm ci --no-audit --no-fund >> "$log" 2>&1 ;;
  *) npm install --no-audit --no-fund >> "$log" 2>&1 ;;
esac
status=$?

# Stdout goes into Claude's context; keep each summary or warning to one line.
if [ $status -eq 0 ]; then
  printf '%s\n' "$cache_key" > "$stamp"
  echo "Cloud setup: installed dependencies from $lock on Node $(node -v)."
else
  echo "Cloud setup: dependency install from $lock failed (exit $status). See $log."
fi
exit 0
