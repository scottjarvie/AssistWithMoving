// assist-mcp-connector-contract v1.0.1 sha256:17aab26f605a5cf52bdbc7a8d8449f6ee0117cf7ac3ca12aec40d877031c3467
// Synced from assistwithlife shared/mcp-connector/contract.ts. Do not edit here; change it upstream and re-sync.
export const MCP_CONNECTOR_CONTRACT_VERSION = "1.0.1";
// On 2026-11-24 Claude Code kept 4,096 JavaScript string characters.
export const MCP_INSTRUCTIONS_MAX_CHARS = 4_000;
export const MCP_AUTHORITY_MUST_END_BY = 1_500;

type InstructionParts = {
  opening: string;
  authority: string;
  connectionNow: string;
  sections?: readonly string[];
};

export type ListedToolName =
  | string
  | { name: string; deprecated?: boolean; canonicalName?: string };

export function buildInstructions({ opening, authority, connectionNow, sections = [] }: InstructionParts) {
  const head = [opening, authority, connectionNow].map((part) => part.trim());
  if (head.some((part) => !part)) {
    throw new Error("Include the site introduction, access rules and one connection state sentence.");
  }
  let text = head.join("\n\n");
  if (text.length > MCP_INSTRUCTIONS_MAX_CHARS) {
    throw new Error("Trim the introduction, access rules or connection state to fit 4,000 characters. Move detail to the relevant tool.");
  }
  if (head.slice(0, 2).join("\n\n").length > MCP_AUTHORITY_MUST_END_BY) {
    throw new Error("Move or trim the introduction and access rules so the rules end within 1,500 characters.");
  }
  for (const section of sections) {
    const next = section.trim();
    if (!next) continue;
    if (text.length + 2 + next.length > MCP_INSTRUCTIONS_MAX_CHARS) break;
    text += "\n\n" + next;
  }
  return text;
}

function quoteExcerpt(text: string, start: number): string {
  const excerpt = text.slice(start, start + 60).trim();
  return JSON.stringify(excerpt + (start + 60 < text.length ? "…" : ""));
}

export function checkInstructions(text: string, authorityMarkers: readonly string[]): string[] {
  const problems: string[] = [];
  if (text.length > MCP_INSTRUCTIONS_MAX_CHARS) {
    problems.push(`Instructions are ${text.length} characters. Trim to 4,000 and move detail to the relevant tool.`);
  }
  for (const marker of authorityMarkers) {
    const start = text.indexOf(marker);
    if (!marker.trim() || start < 0 || start + marker.length > MCP_AUTHORITY_MUST_END_BY) {
      problems.push(`Include or move access rule "${marker}" so it ends within the first 1,500 characters.`);
    }
  }
  const json = /{\s*"|\{\s*\}|\[\s*(?:"[^"\n]*"|\{|\[|true\b|false\b|null\b)|\x60\x60\x60json\b/i.exec(text);
  if (json) {
    problems.push(`Move JSON to the relevant tool reply and describe connection state in one sentence. Found ${quoteExcerpt(text, json.index)}.`);
  }
  const toolName = "[a-z][a-z0-9]*(?:_[a-z0-9]+)+";
  const toolRun = new RegExp(`\\b${toolName}\\b(?:[\\s,;|•*\\x60-]+(?:(?:and|or)\\s+\\x60?)?\\b${toolName}\\b){5}`, "i");
  const toolListHeading = /(?:^|(?<=[.!?])\s+)[ \t]*(?:available tools|tools available[^:\n]*|(?:your |the )?tools|tool list|scopes)[ \t]*:/im;
  const toolBullets = new RegExp(`^[ \\t]*(?:[-*•]|\\d+[.)])[ \\t]+\\x60?${toolName}\\b\\x60?(?=$|[ \\t:—–-])`, "gim");
  const bullets = [...text.matchAll(toolBullets)];
  const list = toolListHeading.exec(text) ?? toolRun.exec(text) ?? (bullets.length > 1 ? bullets[0] : undefined);
  if (list) {
    problems.push(`Move tool and scope lists out of instructions. Use tools/list and the connection tool for those details. Found ${quoteExcerpt(text, list.index)}.`);
  }
  return problems;
}

export function checkListedToolNames(names: readonly ListedToolName[], prefix: string): string[] {
  const problems: string[] = [];
  const sitePrefix = prefix.endsWith("_") ? prefix : `${prefix}_`;
  const seen = new Set<string>();
  const seenTools = new Map<string, string>();
  for (const entry of names) {
    const tool = typeof entry === "string" ? { name: entry } : entry;
    const { name, deprecated, canonicalName = name } = tool;
    if (!name.startsWith(sitePrefix) || name.length === sitePrefix.length) {
      problems.push(`"${name}" must carry the site prefix "${sitePrefix}" and a tool name.`);
    }
    if (seen.has(name)) problems.push(`List "${name}" once in tools/list.`);
    const previous = seenTools.get(canonicalName);
    if (previous && previous !== name) {
      problems.push(`"${previous}" and "${name}" list the same tool. List one name for "${canonicalName}".`);
    }
    if (deprecated) problems.push(`"${name}" is marked deprecated in tools/list. Check the catalogue and the site's approved naming decisions.`);
    seen.add(name);
    seenTools.set(canonicalName, name);
  }
  return problems;
}

export function assertConnectorContract(
  text: string,
  authorityMarkers: readonly string[],
  names: readonly ListedToolName[],
  prefix: string,
): void {
  const problems = [...checkInstructions(text, authorityMarkers), ...checkListedToolNames(names, prefix)];
  if (problems.length) throw new Error(problems.join("\n"));
}
