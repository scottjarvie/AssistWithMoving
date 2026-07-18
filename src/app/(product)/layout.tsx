import { ServerOff } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { MediaUploadProvider } from "@/components/media-upload-provider";
import { MoveWorkspaceProvider } from "@/components/move-workspace-context";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export function ProductBackendUnavailable() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center px-4 py-12 sm:px-6">
      <Card className="w-full">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
              <ServerOff className="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <Badge variant="outline">Backend env missing</Badge>
          </div>
          <CardTitle>Workspace backend is not configured</CardTitle>
          <CardDescription>
            Set `NEXT_PUBLIC_CONVEX_URL` for this deployment to mount live
            inventory, admin, packet, upload, and collaboration tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            Public marketing and legal pages can still render, but product routes
            are held in this fallback so Convex hooks are not mounted without a
            provider.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
