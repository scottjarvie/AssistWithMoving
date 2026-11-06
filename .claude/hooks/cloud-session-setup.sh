#!/usr/bin/env bash
# Cloud sessions (Claude Code on the web) start from a fresh clone with no
# node_modules. Install from the lockfile so checks and tests can run.
# Local sessions exit here and are unaffected.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f package.json ] || exit 0

log=$(mktemp "${TMPDIR:-/tmp}/cloud-session-setup.XXXXXX") || {
  echo 'Cloud setup: could not create a diagnostic log; skipping dependency install.'
  exit 0
}

warn() {
  printf 'Cloud setup: %s See %s.\n' "$1" "$log" >> "$log"
  printf 'Cloud setup: %s See %s.\n' "$1" "$log"
}

[ -f package-lock.json ] || {
  warn 'package-lock.json is missing; skipping dependency install.'
  exit 0
}

# Match .nvmrc's major Node version when the image has a different default.
want=$([ -f .nvmrc ] && tr -d 'v \n' < .nvmrc); want=${want%%.*}
have=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -n "$want" ] && [ "$want" != "$have" ] && [ -s "$nvm_sh" ]; then
  # shellcheck source=/dev/null
  . "$nvm_sh" >> "$log" 2>&1
  if { nvm use --silent "$want" || nvm install "$want"; } >> "$log" 2>&1 && [ -n "$CLAUDE_ENV_FILE" ]; then
    printf 'export PATH=%q:"$PATH"\n' "$(dirname "$(command -v node)")" >> "$CLAUDE_ENV_FILE"
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

# Always rebuild from the lockfile, including on resume. A manifest stamp cannot
# prove that installed packages are intact or that patch-package inputs match.
# npm ci removes old success stamps with the dependency tree, and lifecycle
# scripts apply the current patches. CI makes patch-package propagate patch
# failures instead of its default local success exit. Never cache a failure.
CI=true NODE_ENV=development npm ci --include=dev --ignore-scripts=false --no-audit --no-fund >> "$log" 2>&1
status=$?

# Stdout goes into Claude's context; keep each summary or warning to one line.
if [ $status -eq 0 ]; then
  echo "Cloud setup: installed dependencies from package-lock.json on Node $node_version."
else
  echo "Cloud setup: dependency install from package-lock.json failed (exit $status). See $log."
fi
exit 0
