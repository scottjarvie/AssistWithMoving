import type { Metadata } from "next";

import { AiConnectionManager } from "@/components/ai-connection-manager";

export const metadata: Metadata = {
  title: "AI connections",
};

export default function SettingsAiPage() {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-5">
        <h2 className="text-3xl font-semibold tracking-tight">
          Your AI, and what it may do
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Connect the AI you already use to this move workspace, decide exactly
          what it may read and change, watch what it actually did, and take the
          access back whenever you want. People, share links, and API keys are
          managed separately.
        </p>
      </div>
      <AiConnectionManager />
    </div>
  );
}
