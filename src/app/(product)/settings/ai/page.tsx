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

      </div>
      <AiConnectionManager />
    </div>
  );
}
