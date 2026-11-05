import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Command hooks run from the project root. Check this flag before requiring a
// Unix shell, so native Windows startup/resume stays a silent local no-op.
if (process.env.CLAUDE_CODE_REMOTE === "true") {
  const script = fileURLToPath(new URL("./cloud-session-setup.sh", import.meta.url));
  const result = spawnSync("bash", [script], { stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0) {
    console.log("Cloud setup: shell setup could not complete; session can continue.");
  }
}
process.exit(0);
