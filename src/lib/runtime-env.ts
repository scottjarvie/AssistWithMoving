export function hasPublicConvexUrl(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.NEXT_PUBLIC_CONVEX_URL?.trim());
}
