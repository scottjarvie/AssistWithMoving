"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";

type MoveWorkspaceTab = {
  value: string;
  label: string;
};

export function MoveWorkspaceTabList({ tabs }: { tabs: MoveWorkspaceTab[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <TabsList className="min-w-max">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
