import type { ShareLinkAction } from "./documentation";

export const maxPublicShareCommentLength = 1_200;
export const maxPublicShareCommentAuthorLength = 80;

export function assertPublicShareCanComment(allowedActions: ShareLinkAction[]) {
  if (!allowedActions.includes("comment")) {
    throw new Error("Share link does not allow comments.");
  }
}

export function normalizePublicShareComment(body: string) {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new Error("Comment cannot be empty.");
  }
  if (normalized.length > maxPublicShareCommentLength) {
    throw new Error(
      `Comment must be ${maxPublicShareCommentLength} characters or fewer.`
    );
  }
  return normalized;
}

export function normalizePublicShareCommentAuthor(authorLabel?: string) {
  const normalized = authorLabel?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maxPublicShareCommentAuthorLength);
}
