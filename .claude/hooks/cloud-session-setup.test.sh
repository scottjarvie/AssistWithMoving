#!/usr/bin/env bash
# Offline regression checks; fake Node/nvm/npm never install or use credentials.
# Run: bash .claude/hooks/cloud-session-setup.test.sh
set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
hook=${1:-$test_dir/cloud-session-setup.sh}
scenario=${2:-all}
work=$(mktemp -d "$test_dir/.cloud-setup-test.XXXXXX")
# Only remove the fixture directory created inside this checkout.
case "$work" in "$test_dir"/.cloud-setup-test.*) ;; *) exit 1 ;; esac
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
    use)
      echo use >> "$MOCK_WORK/nvm-calls"
      [ "$2" = --silent ] && [ "$3" = 24 ] || return 1
      [ "${MOCK_OFFLINE:-0}" = 0 ] || return 1
      echo "$3" >> "$MOCK_WORK/restores"
      export PATH="$MOCK_WORK/new/bin:$PATH"
      ;;
    install)
      echo install >> "$MOCK_WORK/nvm-calls"
      return 1
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

run_hook() { bash --noprofile --norc "$hook"; }
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

if [ "$scenario" = use-success ] || [ "$scenario" = all ]; then
  if /usr/bin/grep -q '^install$' "$work/nvm-calls"; then
    echo 'FAIL: nvm use success must skip nvm install' >&2
    exit 1
  fi
  echo 'PASS: nvm use success skips nvm install'
fi

if [ "$scenario" = offline ] || [ "$scenario" = all ]; then
  before=$(install_count)
  printf 'preserve\n' > "$work/project/node_modules/keep"
  output=$(MOCK_OFFLINE=1 run_hook)
  assert_equal "$(install_count)" "$before" 'offline wrong Node skips npm ci'
  assert_equal "$(cat "$work/project/node_modules/keep")" preserve 'offline preserves node_modules'
  case "$output" in *'warning: Node 24 is unavailable'*) ;; *) echo 'FAIL: missing runtime warning'; exit 1 ;; esac
  assert_equal "$(printf '%s\n' "$output" | wc -l | tr -d ' ')" 1 'one-line runtime warning'
  echo 'PASS: offline resume with wrong Node preserves dependencies and skips npm ci'
fi

# Isolate PATH without changing host tools to exercise missing-tool warnings.
if [ "$scenario" = missing-tools ] || [ "$scenario" = all ]; then
  mkdir -p "$work/tools"
  for tool in bash tr cat dirname mkdir shasum; do
    tool_path=$(command -v "$tool")
    ln -s "$tool_path" "$work/tools/$tool"
  done
  output=$(PATH="$work/tools" NVM_DIR="$work/no-nvm" /bin/bash "$hook")
  case "$output" in *'warning: Node is unavailable'*) ;; *) echo 'FAIL: missing Node warning'; exit 1 ;; esac
  ln -s "$work/new/bin/node" "$work/tools/node"
  output=$(PATH="$work/tools" /bin/bash "$hook")
  case "$output" in *'warning: sha256sum is unavailable; using shasum -a 256.'*) ;; *) echo 'FAIL: missing hash fallback warning'; exit 1 ;; esac
  rm "$work/tools/shasum"
  output=$(PATH="$work/tools" /bin/bash "$hook")
  case "$output" in *'warning: SHA-256 tools are unavailable'*) ;; *) echo 'FAIL: missing hash tools warning'; exit 1 ;; esac
  echo 'PASS: missing Node and hash tools warn; shasum fallback works'
fi
