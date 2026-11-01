#!/usr/bin/env bash
# Offline regression checks; fake Node/nvm/npm never install or use credentials.
# Run: bash .claude/hooks/cloud-session-setup.test.sh
set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
hook=${1:-$test_dir/cloud-session-setup.sh}
scenario=${2:-all}
work=$(mktemp -d "${TMPDIR:-/tmp}/cloud-setup-test.XXXXXX")
# Only remove the fixture directory created with the expected temp prefix.
case "$work" in "${TMPDIR:-/tmp}"/cloud-setup-test.*) ;; *) exit 1 ;; esac
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/old/bin" "$work/new/bin" "$work/nvm" "$work/project" "$work/tmp"

cat > "$work/old/bin/node" <<'MOCK'
#!/usr/bin/env bash
case "$1" in -v) echo v22.0.0 ;; -p) echo 22 ;; *) exit 1 ;; esac
MOCK
cat > "$work/new/bin/node" <<'MOCK'
#!/usr/bin/env bash
case "$1" in -v) echo "${MOCK_NODE_VERSION:-v24.0.0}" ;; -p) echo 24 ;; *) exit 1 ;; esac
MOCK
cat > "$work/old/bin/npm" <<'MOCK'
#!/usr/bin/env bash
printf '%s %s\n' "$(node -v)" "$*" >> "$MOCK_WORK/installs"
mkdir -p node_modules
exit "${MOCK_INSTALL_STATUS:-0}"
MOCK
cat > "$work/nvm/nvm.sh" <<'MOCK'
nvm() {
  case "$1" in
    install)
      [ "$2" = 24 ] || return 1
      echo install >> "$MOCK_WORK/nvm-calls"
      [ "${MOCK_NVM_INSTALL_STATUS:-0}" = 0 ] || return 1
      echo "$2" >> "$MOCK_WORK/restores"
      export PATH="$MOCK_WORK/new/bin:$PATH"
      ;;
    use)
      [ "$2" = --silent ] && [ "$3" = 24 ] || return 1
      echo use >> "$MOCK_WORK/nvm-calls"
      [ "${MOCK_NVM_USE_STATUS:-0}" = 0 ] || return 1
      echo "$3" >> "$MOCK_WORK/restores"
      export PATH="$MOCK_WORK/new/bin:$PATH"
      ;;
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

run_hook() { "$BASH" --noprofile --norc "$hook"; }
install_count() { wc -l < "$work/installs" | tr -d ' '; }
assert_equal() {
  [ "$1" = "$2" ] || { printf 'FAIL: %s (got %s, expected %s)\n' "$3" "$1" "$2" >&2; exit 1; }
}

# Every scenario starts with a successful fresh install and populated cache.
run_hook
assert_equal "$(install_count)" 1 'fresh install'
assert_equal "$(head -n 1 "$work/installs")" 'v24.0.0 ci --no-audit --no-fund' 'npm ci uses restored Node'

if [ "$scenario" = resume ] || [ "$scenario" = all ]; then
    : > "$work/session-path"
    run_hook
    assert_equal "$(install_count)" 1 'resume reuses dependencies'
    assert_equal "$(wc -l < "$work/restores" | tr -d ' ')" 2 'resume restores Node'
    # shellcheck source=/dev/null
    restored=$( . "$work/session-path"; node -v )
    assert_equal "$restored" v24.0.0 'resume persists Node for subsequent commands'
    echo 'PASS: resumed session restores Node and skips reinstall'
fi
if [ "$scenario" = offline-resume ] || [ "$scenario" = all ]; then
    before=$(install_count)
    stamp_before=$(cat "$work/project/node_modules/.cloud-session-setup")
    printf 'keep me\n' > "$work/project/node_modules/keep"
    : > "$work/nvm-calls"
    MOCK_NVM_USE_STATUS=1 MOCK_NVM_INSTALL_STATUS=1 run_hook > "$work/warning" 2> "$work/stderr"
    assert_equal "$(wc -c < "$work/stderr" | tr -d ' ')" 0 'offline warning leaves stderr empty'
    assert_equal "$(install_count)" "$before" 'offline wrong Node never runs npm ci'
    assert_equal "$(cat "$work/project/node_modules/keep")" 'keep me' 'offline resume preserves node_modules'
    assert_equal "$(cat "$work/project/node_modules/.cloud-session-setup")" "$stamp_before" 'offline resume preserves cache stamp'
    assert_equal "$(cat "$work/nvm-calls")" "$(printf 'use\ninstall')" 'offline resume tries local Node before download'
    assert_equal "$(wc -l < "$work/warning" | tr -d ' ')" 1 'offline resume emits one warning'
    echo 'PASS: offline resume leaves dependencies and stamp untouched when Node cannot be restored'
fi
if [ "$scenario" = local-node ] || [ "$scenario" = all ]; then
    before=$(install_count)
    : > "$work/nvm-calls"
    MOCK_NVM_INSTALL_STATUS=1 run_hook
    assert_equal "$(cat "$work/nvm-calls")" use 'local Node skips nvm install'
    assert_equal "$(install_count)" "$before" 'local Node reuses cache offline'
    echo 'PASS: locally installed Node restores without nvm install'
fi
if [ "$scenario" = download-node ] || [ "$scenario" = all ]; then
    before=$(install_count)
    : > "$work/nvm-calls"
    MOCK_NVM_USE_STATUS=1 run_hook
    assert_equal "$(cat "$work/nvm-calls")" "$(printf 'use\ninstall')" 'missing local Node falls back to nvm install'
    assert_equal "$(install_count)" "$before" 'downloaded Node reuses matching cache'
    echo 'PASS: unavailable local Node falls back to nvm install'
fi
if [ "$scenario" = missing-tools ] || [ "$scenario" = all ]; then
    # A restricted PATH models macOS (shasum only), then missing hash/Node tools.
    mkdir "$work/tools"
    for tool in bash cat dirname tr; do
      printf '#!/bin/bash\nexec %q "$@"\n' "$(command -v "$tool")" > "$work/tools/$tool"
      chmod +x "$work/tools/$tool"
    done
    export MOCK_SHA256SUM
    MOCK_SHA256SUM=$(command -v sha256sum || true)
    if [ -z "$MOCK_SHA256SUM" ]; then
      MOCK_SHA256SUM="$work/sha256sum"
      printf '#!/bin/bash\nexec %q -a 256 "$@"\n' "$(command -v shasum)" > "$MOCK_SHA256SUM"
      chmod +x "$MOCK_SHA256SUM"
    fi
    cat > "$work/tools/shasum" <<'MOCK'
#!/usr/bin/env bash
[ "$1" = -a ] && [ "$2" = 256 ] || exit 1
shift 2
echo shasum >> "$MOCK_WORK/hash-calls"
"$MOCK_SHA256SUM" "$@"
MOCK
    chmod +x "$work/tools/shasum"
    before=$(install_count)
    stamp_before=$(cat "$work/project/node_modules/.cloud-session-setup")
    PATH="$work/old/bin:$work/tools" run_hook
    assert_equal "$(cat "$work/hash-calls")" shasum 'shasum -a 256 fallback is used'
    assert_equal "$(install_count)" "$before" 'shasum fallback reuses matching cache'
    mv "$work/tools/shasum" "$work/hidden-shasum"
    PATH="$work/old/bin:$work/tools" run_hook > "$work/warning"
    assert_equal "$(wc -l < "$work/warning" | tr -d ' ')" 1 'missing hash tool emits one warning'
    assert_equal "$(cat "$work/warning")" "$(cat "$work/tmp/cloud-session-setup.log")" 'hash warning is also logged'
    assert_equal "$(install_count)" "$before" 'missing hash tool skips npm ci'
    mv "$work/project/.nvmrc" "$work/hidden-nvmrc"
    PATH="$work/tools" run_hook > "$work/warning"
    assert_equal "$(wc -l < "$work/warning" | tr -d ' ')" 1 'missing Node emits one warning'
    assert_equal "$(install_count)" "$before" 'missing Node skips npm ci'
    assert_equal "$(cat "$work/project/node_modules/.cloud-session-setup")" "$stamp_before" 'missing tools preserve cache stamp'
    mv "$work/hidden-nvmrc" "$work/project/.nvmrc"
    echo 'PASS: shasum fallback and one-line warnings for missing Node/hash tools'
fi
if [ "$scenario" = missing-modules ] || [ "$scenario" = all ]; then
    mv "$work/project/node_modules" "$work/removed-node-modules"
    before=$(install_count)
    run_hook
    assert_equal "$(install_count)" "$((before + 1))" 'missing node_modules reinstalls'
    echo 'PASS: deleted node_modules triggers install'
fi
if [ "$scenario" = package-change ] || [ "$scenario" = all ]; then
    before=$(install_count)
    printf '{"name":"fixture","version":"1.0.1"}\n' > "$work/project/package.json"
    run_hook
    assert_equal "$(install_count)" "$((before + 1))" 'package.json change reinstalls'
    echo 'PASS: changed package.json triggers install'
fi
if [ "$scenario" = lock-change ] || [ "$scenario" = all ]; then
    before=$(install_count)
    printf '{"lockfileVersion":3,"packages":{}}\n' > "$work/project/package-lock.json"
    run_hook
    assert_equal "$(install_count)" "$((before + 1))" 'lockfile change reinstalls'
    echo 'PASS: changed lockfile triggers install'
fi
if [ "$scenario" = node-change ] || [ "$scenario" = all ]; then
    before=$(install_count)
    export MOCK_NODE_VERSION=v24.1.0
    run_hook
    assert_equal "$(install_count)" "$((before + 1))" 'Node version change reinstalls'
    echo 'PASS: changed Node version triggers install'
fi
if [ "$scenario" = failed-install ] || [ "$scenario" = all ]; then
    before=$(install_count)
    printf '{"name":"fixture","version":"1.0.2"}\n' > "$work/project/package.json"
    MOCK_INSTALL_STATUS=1 run_hook
    run_hook
    assert_equal "$(install_count)" "$((before + 2))" 'failed install is retried'
    echo 'PASS: failed install does not validate cache'
fi
