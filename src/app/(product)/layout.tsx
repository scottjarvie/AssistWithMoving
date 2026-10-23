import { AppShell } from "@/components/app-shell";
import { MediaUploadProvider } from "@/components/media-upload-provider";
import { MoveWorkspaceProvider } from "@/components/move-workspace-context";
import { ProductBackendUnavailable } from "@/components/product-backend-unavailable";
import { hasPublicConvexUrl } from "@/lib/runtime-env";

// One MoveWorkspaceProvider for every product page. It mounts here, above the
// app shell's nav and top bar, and STAYS mounted across all in-app navigation —
// the active move is derived from the URL inside the provider, never by
// remounting or re-keying it. (Re-keying the provider on navigation was the
// original freeze bug; do not reintroduce it.)
export default function ProductLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!hasPublicConvexUrl()) {
    return (
      <AppShell workspaceEnabled={false}>
        <ProductBackendUnavailable />
      </AppShell>
    );
  }

  return (
    <MoveWorkspaceProvider>
      {/* Background photo uploads live here, above the AppShell and both capture
          Sheets, so jobs survive a Sheet closing and any in-app navigation. */}
      <MediaUploadProvider>
        <AppShell>{children}</AppShell>
      </MediaUploadProvider>
    </MoveWorkspaceProvider>
  );
}
