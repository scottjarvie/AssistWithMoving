import { formatBytes } from "./usage-limits.mjs";
export function uploadPolicyLine(policy, { kinds, batch = true } = {}) {
  const files = Object.entries(policy.maxFileBytes).filter(([kind]) => !kinds || kinds.includes(kind)).map(([kind, bytes]) => `${kind} ${formatBytes(bytes)}`).join(", ");
  const batchLine = !batch ? "" : policy.batchLimitsEnforced === false ? " Batch sizes follow this tool's existing transport limits." : ` AI batch settings: ${policy.mcpBatchMaxItems} items and ${formatBytes(policy.mcpBatchMaxBytes)} per call; independent transport ceilings still apply.`;
  return `Current file caps: ${files}.` + batchLine;
}
