:; [ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
:; if command -v bash >/dev/null 2>&1; then bash "${0%/*}/cloud-session-setup.sh"; else printf '%s\n' 'Cloud setup: Bash is unavailable; session can continue.'; fi
:; exit 0
@echo off
rem The :; lines are batch labels and the POSIX shell entry point.
rem Local sessions need neither Node nor Bash on either platform.
if not "%CLAUDE_CODE_REMOTE%"=="true" exit /b 0
"%SystemRoot%\System32\where.exe" bash >nul 2>nul
if errorlevel 1 (
  echo Cloud setup: Bash is unavailable; session can continue.
  exit /b 0
)
bash "%~dp0cloud-session-setup.sh"
exit /b 0
