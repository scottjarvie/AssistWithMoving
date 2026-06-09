import { describe, expect, it } from "vitest";

import {
  aiModelLabel,
  aiProviderLabel,
  aiProviderModelLabel,
  aiProviderModelLabelFromKey,
} from "@/lib/ai-display";

describe("AI display labels", () => {
  it("maps internal no-cost provider ids to launch-ready UI labels", () => {
    expect(aiProviderLabel("mock")).toBe("Local demo");
    expect(aiModelLabel("mock", "mock-model")).toBe("Deterministic review");
    expect(aiProviderModelLabel("mock", "mock-model")).toBe(
      "Local demo / Deterministic review"
    );
  });

  it("preserves known model identity without exposing raw machine formatting", () => {
    expect(aiProviderLabel("openai")).toBe("OpenAI");
    expect(aiModelLabel("openai", "gpt-5-mini")).toBe("GPT-5 Mini");
    expect(aiProviderModelLabelFromKey("mock/photo-intake-parser-v1")).toBe(
      "Local demo / Photo Intake Parser V1"
    );
  });
});
