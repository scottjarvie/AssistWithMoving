export function buildPublicSharePath(token: string) {
  const normalizedToken = token.trim();
  return `/share/${encodeURIComponent(normalizedToken)}`;
}

export function buildPublicShareUrl(token: string, origin: string) {
  return new URL(buildPublicSharePath(token), origin).toString();
}
