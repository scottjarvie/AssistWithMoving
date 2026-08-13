import type { Metadata } from "next";

import { SettingsFeatureSections } from "@/components/settings-feature-sections";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Manage security and integration settings for Assist With Moving.
        </p>
      </div>
      <SettingsFeatureSections />
    </div>
  );
}
