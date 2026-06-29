"use client";

// Shared sort dropdown used by the Spaces & Transport detail list, the Items
// page, and the Movable Units page. Options + labels come from inventory-sort.ts
// so the three surfaces stay identical.

import { ArrowUpDown, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INVENTORY_SORT_OPTIONS, type SortFieldId } from "@/lib/inventory-sort";
import { cn } from "@/lib/utils";

export function SortMenu({
  value,
  onChange,
  disabled,
  align = "end",
}: {
  value: SortFieldId;
  onChange: (field: SortFieldId) => void;
  disabled?: boolean;
  align?: "start" | "end";
}) {
  const active = INVENTORY_SORT_OPTIONS.find((option) => option.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <ArrowUpDown aria-hidden="true" />
          <span className="hidden sm:inline">Sort:&nbsp;</span>
          {active?.short ?? "Sort"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {INVENTORY_SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => onChange(option.id)}
            className="justify-between"
          >
            {option.label}
            <Check
              aria-hidden="true"
              className={cn(
                "size-4",
                option.id === value ? "opacity-100" : "opacity-0",
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
