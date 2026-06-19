"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyTextButton({
  text,
  label = "Copy",
  ariaLabel,
  className,
}: {
  text: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyText() {
    try {
      await writeClipboard(text);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2200);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 3200);
    }
  }

  const buttonText =
    state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copyText}
      aria-label={ariaLabel ?? label}
      className={cn("min-w-0 max-w-full shrink", className)}
    >
      {state === "copied" ? (
        <Check aria-hidden="true" />
      ) : (
        <Clipboard aria-hidden="true" />
      )}
      <span className="min-w-0 truncate" aria-live="polite">
        {buttonText}
      </span>
    </Button>
  );
}

export async function writeClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back for embedded browsers or permission-limited contexts.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy command failed.");
  }
}
