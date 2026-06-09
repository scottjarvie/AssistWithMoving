export function aiProviderLabel(provider: string) {
  switch (provider) {
    case "mock":
      return "Local demo";
    case "openai":
      return "OpenAI";
    default:
      return labelize(provider);
  }
}

export function aiModelLabel(provider: string, model: string) {
  if (provider === "mock" && model === "mock-model") {
    return "Deterministic review";
  }
  if (provider === "openai" && /^gpt-/i.test(model)) {
    return model
      .replace(/^gpt-/i, "GPT-")
      .replace(/-(mini|nano|turbo)$/i, " $1")
      .replace(/\b(mini|nano|turbo)\b/i, (match) => labelize(match));
  }
  return labelize(model);
}

export function aiProviderModelLabel(provider: string, model: string) {
  return `${aiProviderLabel(provider)} / ${aiModelLabel(provider, model)}`;
}

export function aiProviderModelLabelFromKey(providerModel: string) {
  const [provider, ...modelParts] = providerModel.split("/");
  const model = modelParts.join("/");
  if (!provider || !model) {
    return labelize(providerModel);
  }
  return aiProviderModelLabel(provider, model);
}

function labelize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
