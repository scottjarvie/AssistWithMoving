import {
  Archive,
  Bot,
  Camera,
  FileStack,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConvexAuthStatus } from "@/components/convex-auth-status";

const metrics = [
  { label: "Items", value: "428", icon: PackageCheck, note: "312 reviewed" },
  { label: "Boxes", value: "72", icon: Archive, note: "49 sealed" },
  { label: "Photos", value: "1,186", icon: Camera, note: "86 need review" },
  { label: "Resources", value: "6", icon: Truck, note: "2 near capacity" },
];

const workstreams = [
  ["Inventory", "Define schema, table views, item detail panel", "Phase 3"],
  ["Photos", "Private Backblaze originals and evidence queue", "Phase 4"],
  ["Load plan", "Capacity rules and resource assignment board", "Phase 5"],
  ["Packets", "PCS, mover, employer, claims, storage exports", "Phase 7"],
  ["AI review", "Draft suggestions with user approval", "Phase 6"],
];

export default function DashboardPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="secondary">Phase 0 foundation</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                MovingManifest workspace preview
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                This shell is the landing zone for the real product: auth,
                household tenancy, inventory, boxes, photo evidence, load
                planning, documentation packets, API/MCP, and admin operations.
              </p>
            </div>
            <Badge>
              <ShieldCheck aria-hidden="true" />
              privacy-first records
            </Badge>
          </div>
        </div>
        <ConvexAuthStatus />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              AI posture
            </CardTitle>
            <CardDescription>
              AI will create draft suggestions, not trusted records.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            Every AI suggestion needs source tracking, confidence, review state,
            and audit history before it changes inventory, estimates, packets, or
            assignments.
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="space-y-0 pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                {metric.label}
                <metric.icon className="size-4 text-primary" aria-hidden="true" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl font-semibold">{metric.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Build workstreams</CardTitle>
            <CardDescription>
              The first implementation pass is wired to Linear phases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Surface</TableHead>
                  <TableHead>Meaning</TableHead>
                  <TableHead className="text-right">Phase</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workstreams.map(([surface, meaning, phase]) => (
                  <TableRow key={surface}>
                    <TableCell className="font-medium">{surface}</TableCell>
                    <TableCell className="text-muted-foreground">{meaning}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{phase}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileStack className="size-4 text-accent" aria-hidden="true" />
              Packet defaults
            </CardTitle>
            <CardDescription>
              Recipient-specific outputs come from explicit profiles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {["PCS", "Moving company", "Employer relocation", "Claims", "Storage"].map(
              (packet) => (
                <div
                  key={packet}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>{packet}</span>
                  <Badge variant="secondary">scoped</Badge>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
