"use client";

import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

type MoveWorkspaceTab = {
  value: string;
  label: string;
  description?: string;
  count?: number | string;
  countLabel?: string;
};

export function MoveWorkspaceTabList({
  tabs,
  activeValue,
  ariaLabel = "Workspace task views",
}: {
  tabs: MoveWorkspaceTab[];
  activeValue?: string;
  ariaLabel?: string;
}) {
  const activeTab = tabs.find((tab) => tab.value === activeValue);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <TabsList className="min-w-max" aria-label={ariaLabel}>
          {tabs.map((tab) => {
            const hasCount = tab.count !== undefined;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={hasCount ? "gap-2" : undefined}
                aria-label={
                  hasCount
                    ? `${tab.label}: ${tab.countLabel ?? tab.count}`
                    : undefined
                }
              >
                {tab.label}
                {hasCount ? (
                  <Badge
                    variant={
                      activeValue === tab.value ? "secondary" : "outline"
                    }
                    className="h-5 min-w-5 px-1"
                  >
                    {tab.count}
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {activeTab?.description ? (
        <p className="text-sm text-muted-foreground">{activeTab.description}</p>
      ) : null}
    </div>
  );
}
