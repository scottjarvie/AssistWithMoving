import snapshot from "./family-manifest.2026-11-12.json";

export type FamilySite = { slug: string; subject: string; color: string; status: string; href?: string };
const url = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  try { const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : undefined; } catch { return undefined; }
};
export function validateFamilyManifest(value: unknown): { home: string; spaces: FamilySite[] } | null {
  if (!value || typeof value !== "object") return null;
  const manifest = value as Record<string, unknown>;
  const home = url(manifest.home);
  if (manifest.version !== 1 || !home || !Array.isArray(manifest.spaces) || !manifest.spaces.length) return null;
  const seen = new Set<string>();
  const spaces: FamilySite[] = [];
  for (const entry of manifest.spaces) {
    if (!entry || typeof entry !== "object") return null;
    const site = entry as Record<string, unknown>;
    if (typeof site.slug !== "string" || seen.has(site.slug) || typeof site.subject !== "string" || typeof site.color !== "string" || !/^#[0-9a-f]{6}$/i.test(site.color) || !["Live", "Soft launch", "In design"].includes(String(site.status))) return null;
    seen.add(site.slug);
    spaces.push({slug:site.slug, subject:site.subject, color:site.color, status:String(site.status), href:site.status === "In design" ? undefined : url(site.href)});
  }
  return {home, spaces};
}
// Validated, dated Life snapshot; no client fetch or new endpoint.
const manifest = validateFamilyManifest(snapshot);
if (!manifest) throw new Error("Invalid bundled family manifest");
const current = manifest.spaces.find(site => site.slug === "moving") ?? {slug:"moving", subject:"Moving", color:"#7A4460", status:"Live"};
export const familySites = [current, ...manifest.spaces.filter(site => site.slug !== "moving")];
export const lifeDirectory = `${manifest.home.replace(/\/$/, "")}#all-spaces`;
