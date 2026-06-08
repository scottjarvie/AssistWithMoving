import Link from "next/link";
import {
  Archive,
  Bot,
  ClipboardList,
  FileStack,
  Images,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { AuthControls } from "@/components/auth-controls";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { product } from "@/lib/product";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/dashboard#inventory", label: "Inventory", icon: ClipboardList },
  { href: "/app/dashboard#boxes", label: "Boxes", icon: Archive },
  { href: "/app/dashboard#photos", label: "Photos", icon: Images },
  { href: "/app/dashboard#load-plan", label: "Load Plan", icon: Truck },
  { href: "/app/dashboard#documents", label: "Packets", icon: FileStack },
  { href: "/app/dashboard#ai", label: "AI Review", icon: Bot },
] as const;

export function AppShell({
  children,
  section,
}: {
  children: React.ReactNode;
  section: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-sidebar/75 px-4 py-5 backdrop-blur xl:block">
        <BrandMark />
        <nav aria-label="Primary" className="mt-8 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                item.label === "Dashboard" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
        <Separator className="my-6" />
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Privacy default
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Helper and mover views hide values, serials, private notes, and
            sensitive photos unless an owner explicitly changes the packet.
          </p>
        </div>
      </aside>

      <div className="xl:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/88 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <div className="min-w-0">
              <div className="xl:hidden">
                <BrandMark />
              </div>
              <div className="hidden xl:block">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {section}
                </p>
                <h1 className="truncate text-lg font-semibold">
                  MovingManifest workspace
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Local {product.localUrl.replace("http://", "")}
              </Badge>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">
                  <Settings aria-hidden="true" />
                  Settings
                </Link>
              </Button>
              <AuthControls />
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
