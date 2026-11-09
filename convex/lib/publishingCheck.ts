const secretField = /(?:^|[_ -])(?:password|passwd|api[_ -]?key|access[_ -]?token|auth[_ -]?token|token|client[_ -]?secret|secret[_ -]?access[_ -]?key)$/i;

function readableSecretText(value: string) {
  // Inspect escaped JSON too, including nested serialization and Unicode escapes.
  for (let depth = 0; depth < 5; depth++) {
    const decoded = value.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\([\\"/])/g, "$1").replace(/\\[nr]/g, "\n").replace(/\\t/g, "\t");
    if (decoded === value) break;
    value = decoded;
  }
  return value;
}
function containsCard(value: string) {
  return [...value.matchAll(/(?<!\d)(?:\d[ -]?){12,18}\d(?![ -]?\d)/g)].some(([candidate]) => {
    const digits = candidate.replace(/\D/g, "");
    if (/^(.)\1+$/.test(digits)) return false;
    let sum = 0;
    for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
      let digit = Number(digits[i]);
      if (double) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
    }
    return sum % 10 === 0;
  });
}

export type ContactCounts = { emails: number; phones: number; addresses: number };
/** One light check and one acknowledgement for the entire outgoing batch. */
export function checkPublishedSecrets(content: unknown): ContactCounts {
  const counts: ContactCounts = { emails: 0, phones: 0, addresses: 0 };
  const secrets = [
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i, "private key"],
    [/\b(?:mmk_|sk_|pk_|rk_live_|xox[abpr]-|access-(?:production|sandbox|development)-)[A-Za-z0-9_-]{6,}/i, "API key"],
    [/\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i, "token"],
    [/\b(?:[A-Za-z][A-Za-z0-9]*[_ -])*(?:password|passwd|api[_ -]?key|access[_ -]?token|auth[_ -]?token|token|client[_ -]?secret|secret[_ -]?access[_ -]?key)\s*(?:\\?["'])?\s*[:=]\s*(?:\\?["'])?[^\s"',}]{3,}/i, "password or secret"],
    [/[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i, "URL password"],
  ] as const;
  function visit(value: unknown, path: string) {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) throw new Error(`Publishing refused: cannot scan file-backed body at ${path}. Provide readable text before publishing.`);
    if (Array.isArray(value)) { value.forEach((entry, i) => visit(entry, `${path}[${i}]`)); return; }
    if (value && typeof value === "object") { for (const [key, entry] of Object.entries(value)) { if (entry && /^(?:(?:body|content|text)(?:Storage(?:Id|Key)|File(?:Id|Key)?|Url|Ref)|(?:storageId|storageKey|fileId|fileUrl|url))$/i.test(key) && (/body|content|text/i.test(key) || /\.(body|content|text)$/i.test(path))) throw new Error(`Publishing refused: cannot scan file-backed body at ${path}.${key}. Provide the readable stored body before publishing.`); if (secretField.test(key) && entry) throw new Error(`Publishing refused: found ${key} at ${path}.${key}. Remove the secret and retry.`); visit(entry, `${path}.${key}`); } return; }
    if (typeof value !== "string") return;
    const readable = readableSecretText(value);
    if (containsCard(readable)) throw new Error(`Publishing refused: found a payment card number at ${path}. Remove it and retry.`);
    for (const [pattern, name] of secrets) if (pattern.test(readable)) throw new Error(`Publishing refused: found an obvious ${name} at ${path}. Remove it and retry.`);
    counts.emails += [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].length;
    counts.phones += [...value.matchAll(/(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b/g)].length;
    counts.addresses += [...value.matchAll(/\b\d{1,6}[ \t]+(?:[A-Za-z]+[ \t]+){1,5}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct)\b/gi)].length;
  }
  visit(content, "$public");
  return counts;
}

export function checkPublishing(content: unknown, acknowledgement?: unknown): ContactCounts {
  const counts = checkPublishedSecrets(content);
  const ack = acknowledgement && typeof acknowledgement === "object" ? acknowledgement as Record<string, unknown> : {};
  const covered = (Object.keys(counts) as Array<keyof ContactCounts>).every(key => typeof ack[key] === "number" && Number.isSafeInteger(ack[key]) && ack[key] === counts[key]);
  if ((Object.values(counts).some(Boolean) || acknowledgement !== undefined) && !covered) throw new Error(`This contains ${counts.emails} email addresses, ${counts.phones} phone numbers and ${counts.addresses} street addresses. Publish anyway? Send acknowledgeContactDetails: ${JSON.stringify(counts)} with the exact counts for the whole batch (also accepted on the first call). Business contact details are expected; remove only the person's own private details.`);
  return counts;
}
