"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

import { writeClipboard } from "@/components/copy-text-button";
import { Button } from "@/components/ui/button";

export function AgentKitCopyButton({
  href,
  label = "Copy",
}: {
  href: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyArtifact() {
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error("Artifact fetch failed.");
      await writeClipboard(await response.text());
      setState("copied");
      window.setTimeout(() => setState("idle"), 2200);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 3200);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copyArtifact}>
      {state === "copied" ? (
        <Check aria-hidden="true" />
      ) : (
        <Clipboard aria-hidden="true" />
      )}
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Copy failed"
          : label}
    </Button>
  );
}
