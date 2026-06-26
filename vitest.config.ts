import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// The MCP server entry (mcp-server/movingmanifest-mcp.mjs) is a CLI bin, so it
// starts with a `#!/usr/bin/env node` shebang. Vite's SSR transform mangles that
// leading shebang (it ends up concatenated mid-line), which makes Rolldown fail
// to parse the module — taking down every test that imports the MCP route/tools
// (mcp-endpoint-separation, mcp-capabilities, mcp-route-auth, agent-journey-
// smoke, mcp-oauth-discovery-proof). Strip a leading shebang before transform so
// those tests load. The actual file on disk (and the published CLI) is untouched.
function stripShebang(): Plugin {
  return {
    name: "strip-leading-shebang",
    enforce: "pre",
    transform(code) {
      if (code.startsWith("#!")) {
        // Drop the shebang text but keep the newline so line numbers are stable.
        return { code: code.replace(/^#![^\n]*/, ""), map: null };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [stripShebang(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
