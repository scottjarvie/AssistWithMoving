import { Activity, Database, Gauge, ShieldAlert } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const adminAreas = [
  ["Usage", "Storage, AI, API, exports, share links", Gauge],
  ["Audit", "Sensitive access, packet exports, API use", Activity],
  ["Data", "Account export, deletion, retention", Database],
  ["Abuse", "Suspicious cost, share, or API patterns", ShieldAlert],
] as const;

export default function AdminPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight">Admin</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Operational visibility will be built without making private household
          inventories casually browsable by support users.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {adminAreas.map(([title, copy, Icon]) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{copy}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
