import type { Metadata } from "next";

import { AiConnectionSetup } from "@/components/ai-connection-setup";

export const metadata: Metadata = {
  title: "AI connections",
};

export default function AiConnectionsPage() {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-3xl font-semibold tracking-tight">
          Connect your chosen AI
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Start with hosted MCP OAuth—no key to copy. Fallback API keys remain
          available for trusted local or non-OAuth tools. Account, household,
          and privacy controls stay in Settings.
        </p>
      </div>
      <AiConnectionSetup />
    </div>
  );
}
