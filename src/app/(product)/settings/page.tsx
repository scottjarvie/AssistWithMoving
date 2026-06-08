import { KeyRound, Shield, SlidersHorizontal } from "lucide-react";

import { ApiKeyManager } from "@/components/api-key-manager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const settings = [
  {
    icon: Shield,
    title: "Household and roles",
    copy: "Owners, collaborators, helpers, movers, guests, and API actors will all be scoped here.",
  },
  {
    icon: KeyRound,
    title: "API and MCP keys",
    copy: "Agent and API access uses hashed, scoped, revocable keys instead of full user credentials.",
  },
  {
    icon: SlidersHorizontal,
    title: "Packet defaults",
    copy: "Values, serials, private notes, and sensitive photos stay hidden from helper/mover packets by default.",
  },
];

export default function SettingsPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Manage security and integration settings for MovingManifest.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {settings.map((setting) => (
          <Card key={setting.title}>
            <CardHeader>
              <setting.icon className="size-5 text-primary" aria-hidden="true" />
              <CardTitle>{setting.title}</CardTitle>
              <CardDescription>{setting.copy}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Managed through Clerk, Convex permissions, and scoped packet settings.
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6">
        <ApiKeyManager />
      </div>
    </div>
  );
}
