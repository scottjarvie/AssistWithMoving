#!/usr/bin/env bash
# Offline contract tests: runtime managers/installers are fixture tools only.
# Run: bash .claude/hooks/cloud-session-setup.test.sh
set -eu
test_dir=$(cd -- "$(dirname -- "$0")" && pwd)
hook=${1:-$test_dir/cloud-session-setup.sh}
shell=${TEST_SHELL:-bash}
work=$(mktemp -d "${TMPDIR:-/tmp}/cloud-setup-test.XXXXXX")
case "$work" in "${TMPDIR:-/tmp}"/cloud-setup-test.*) ;; *) exit 1 ;; esac
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/old/bin" "$work/new/bin" "$work/nvm" "$work/project/patches" "$work/tmp"
cat > "$work/old/bin/node" <<'MOCK'
#!/bin/sh
[ "${MOCK_NODE_UNAVAILABLE:-0}" = 0 ] || exit 1
case "$1" in -v) echo v22.0.0 ;; -p) echo 22 ;; *) exit 1 ;; esac
MOCK
cat > "$work/new/bin/node" <<'MOCK'
#!/bin/sh
case "$1" in -v) echo v24.0.0 ;; -p) echo 24 ;; *) exit 1 ;; esac
MOCK
cat > "$work/old/bin/npm" <<'MOCK'
#!/bin/sh
printf '%s %s\n' "$(node -v)" "$*" >> "$MOCK_WORK/installs"
[ "$NODE_ENV" = development ] || exit 2
[ "$*" = 'ci --include=dev --ignore-scripts=false --no-audit --no-fund' ] || exit 2
# Model tree replacement and postinstall. Failure deliberately leaves stale
# evidence and damages a package, so rollback tests cannot pass by cache reuse.
if [ "${MOCK_INSTALL_STATUS:-0}" != 0 ]; then
  mkdir -p node_modules
  rm -f node_modules/required-package
  echo old-success > node_modules/.cloud-session-setup
  exit 1
fi
rm -rf node_modules
mkdir -p node_modules
echo usable > node_modules/required-package
if [ -f patches/fixture.patch ]; then
  cp patches/fixture.patch node_modules/patched-code
else
  echo original > node_modules/patched-code
fi
MOCK
cat > "$work/nvm/nvm.sh" <<'MOCK'
nvm() {
  case "$1" in
    use)
      echo use >> "$MOCK_WORK/nvm-calls"
      [ "${MOCK_NVM_USE_STATUS:-0}" = 0 ] || return 1
      export PATH="$MOCK_WORK/new/bin:$PATH" ;;
    install)
      echo install >> "$MOCK_WORK/nvm-calls"
      [ "${MOCK_NVM_INSTALL_STATUS:-0}" = 0 ] || return 1
      export PATH="$MOCK_WORK/new/bin:$PATH" ;;
    which) printf '%s/new/bin/node\n' "$MOCK_WORK" ;;
    *) return 1 ;;
  esac
}
MOCK
chmod +x "$work/old/bin/"* "$work/new/bin/node"
export MOCK_WORK="$work" NVM_DIR="$work/nvm" TMPDIR="$work/tmp"
export CLAUDE_PROJECT_DIR="$work/project" CLAUDE_CODE_REMOTE=true
export CLAUDE_ENV_FILE="$work/session-path"
export PATH="$work/old/bin:$PATH"
printf '24\n' > "$work/project/.nvmrc"
printf '{"name":"fixture","version":"1.0.0"}\n' > "$work/project/package.json"
printf '{"lockfileVersion":3}\n' > "$work/project/package-lock.json"
run_hook() { "$shell" "$hook" > "$work/stdout" 2> "$work/stderr"; }
count() { wc -l < "$work/installs" | tr -d ' '; }
equal() { [ "$1" = "$2" ] || { echo "FAIL: $3 (got $1, expected $2)" >&2; exit 1; }; }
one_line() {
  equal "$(wc -l < "$work/stdout" | tr -d ' ')" 1 'one summary line'
  equal "$(wc -c < "$work/stderr" | tr -d ' ')" 0 'no stderr'
}
healthy() {
  equal "$(cat "$work/project/node_modules/required-package")" usable 'dependency restored'
  [ ! -f "$work/project/node_modules/.cloud-session-setup" ] || { echo 'FAIL: stale stamp remains'; exit 1; }
}
CLAUDE_CODE_REMOTE=false run_hook
equal "$(cat "$work/stdout")" '' 'local session silent'
[ ! -f "$work/installs" ] || exit 1
run_hook; one_line; healthy
equal "$(count)" 1 'fresh install'
equal "$(head -n 1 "$work/installs")" 'v24.0.0 ci --include=dev --ignore-scripts=false --no-audit --no-fund' 'runtime restored before install'
echo 'PASS: local no-op and frozen install on restored Node'
: > "$work/session-path"
run_hook; one_line; healthy
equal "$(count)" 2 'resume installs again'
restored=$( . "$work/session-path"; node -v )
equal "$restored" v24.0.0 'resume persists runtime'
echo 'PASS: resume restores runtime and installs again'
# Manifests and runtime remain unchanged during patch add/edit/remove.
for patch in first second; do
  printf '%s\n' "$patch" > "$work/project/patches/fixture.patch"
  run_hook; one_line; healthy
  equal "$(cat "$work/project/node_modules/patched-code")" "$patch" 'current patch applied'
done
rm "$work/project/patches/fixture.patch"
run_hook; healthy
equal "$(cat "$work/project/node_modules/patched-code")" original 'removed patch no longer applied'
echo 'PASS: patch addition, edit and removal rebuild installed code'
rm "$work/project/node_modules/required-package"
echo old-success > "$work/project/node_modules/.cloud-session-setup"
run_hook; healthy
echo 'PASS: missing individual dependency repaired despite old stamp'
printf '{"name":"fixture","version":"1.0.1"}\n' > "$work/project/package.json"
MOCK_INSTALL_STATUS=1 run_hook; one_line
[ ! -f "$work/project/node_modules/required-package" ] || exit 1
equal "$(cat "$work/project/node_modules/.cloud-session-setup")" old-success 'failure fixture preserves old stamp'
printf '{"name":"fixture","version":"1.0.0"}\n' > "$work/project/package.json"
run_hook; healthy
echo 'PASS: failure followed by manifest rollback repairs dependencies'
before=$(count)
echo preserve > "$work/project/node_modules/keep"
: > "$work/nvm-calls"
MOCK_NVM_USE_STATUS=1 MOCK_NVM_INSTALL_STATUS=1 run_hook; one_line
equal "$(count)" "$before" 'wrong runtime skips npm ci'
equal "$(cat "$work/project/node_modules/keep")" preserve 'offline preserves dependencies'
equal "$(cat "$work/nvm-calls")" "$(printf 'use\ninstall')" 'local runtime tried before download'
echo 'PASS: unavailable runtime preserves dependencies and warns once'
: > "$work/nvm-calls"
MOCK_NVM_INSTALL_STATUS=1 run_hook; healthy
equal "$(cat "$work/nvm-calls")" use 'installed runtime works offline'
: > "$work/nvm-calls"
MOCK_NVM_USE_STATUS=1 run_hook; healthy
equal "$(cat "$work/nvm-calls")" "$(printf 'use\ninstall')" 'download fallback'
echo 'PASS: local runtime preferred, download fallback supported'
mv "$work/project/.nvmrc" "$work/hidden-nvmrc"
: > "$work/nvm-calls"
run_hook; healthy
equal "$(cat "$work/nvm-calls")" '' 'no invented runtime pin'
equal "$(tail -n 1 "$work/installs")" 'v22.0.0 ci --include=dev --ignore-scripts=false --no-audit --no-fund' 'image runtime used without nvmrc'
before=$(count)
MOCK_NODE_UNAVAILABLE=1 run_hook; one_line
equal "$(count)" "$before" 'missing Node skips install'
echo 'PASS: unpinned runtime preserved and missing Node warns safely'
before=$(count)
mv "$work/project/package-lock.json" "$work/hidden-lock"
run_hook; one_line
equal "$(count)" "$before" 'missing lock prevents mutable install'
echo 'PASS: missing lockfile warns without installation'
