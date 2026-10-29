#!/usr/bin/env bash
# Cloud sessions (Claude Code on the web) start from a fresh clone with no
# node_modules. Install from the lockfile so checks and tests can run.
# Local sessions exit here and are unaffected.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f package.json ] || exit 0

lock=package.json
for f in pnpm-lock.yaml package-lock.json; do [ -f "$f" ] && { lock=$f; break; }; done

# Already installed from this lockfile (a resumed session on the same machine).
stamp=node_modules/.cloud-session-setup
[ -f "$stamp" ] && [ "$stamp" -nt "$lock" ] && exit 0

log=/tmp/cloud-session-setup.log
: > "$log"

# Match .nvmrc's major Node version when the image has a different default.
want=$([ -f .nvmrc ] && tr -d 'v \n' < .nvmrc); want=${want%%.*}
have=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -n "$want" ] && [ "$want" != "$have" ] && [ -s "$nvm_sh" ]; then
  . "$nvm_sh"
  if nvm install "$want" >> "$log" 2>&1 && [ -n "$CLAUDE_ENV_FILE" ]; then
    echo "export PATH=\"$(dirname "$(nvm which "$want")"):\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

case "$lock" in
  pnpm-lock.yaml)
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    corepack enable >> "$log" 2>&1
    pnpm install --frozen-lockfile >> "$log" 2>&1 ;;
  package-lock.json) npm ci --no-audit --no-fund >> "$log" 2>&1 ;;
  *) npm install --no-audit --no-fund >> "$log" 2>&1 ;;
esac
status=$?

# Hook output goes into Claude's context, so keep it to one line.
if [ $status -eq 0 ]; then
  touch "$stamp"
  echo "Cloud setup: installed dependencies from $lock on Node $(node -v)."
else
  echo "Cloud setup: dependency install from $lock failed (exit $status). See $log."
fi
exit 0
