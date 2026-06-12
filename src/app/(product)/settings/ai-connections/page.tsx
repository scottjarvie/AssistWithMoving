import { AiConnectionSetup } from "@/components/ai-connection-setup";

export default function AiConnectionsPage() {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-3xl font-semibold tracking-tight">
          Create an AI connection
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This page is only for connecting a trusted AI assistant. The normal
          Settings page is still there for account, household, privacy, and
          billing controls.
        </p>
      </div>
      <AiConnectionSetup />
    </div>
  );
}
