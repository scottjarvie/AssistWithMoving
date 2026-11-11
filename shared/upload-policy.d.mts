export type UploadPolicy = { maxFileBytes: Record<string, number>; mcpBatchMaxItems: number; mcpBatchMaxBytes: number; batchLimitsEnforced?: boolean };
export function uploadPolicyLine(policy: UploadPolicy, options?: { kinds?: string[]; batch?: boolean }): string;
