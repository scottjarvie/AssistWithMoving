import { ServerOff } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasPublicConvexUrl } from "@/lib/runtime-env";

export default function ProductLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppShell section="Workspace">
      {hasPublicConvexUrl() ? children : <ProductBackendUnavailable />}
    </AppShell>
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
