import React from "react";
import { createRoot } from "react-dom/client";
import { AiConnectionManager } from "@/components/ai-connection-manager";
import { InventoryTable } from "@/components/inventory-table";
import type { Id } from "../../convex/_generated/dataModel";

const surface = new URLSearchParams(location.search).get("surface") ?? "ai";
createRoot(document.getElementById("root")!).render(<main className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
  <header><p className="text-xs font-medium text-accent">Moving · fictional offline component evidence</p><h1 className="mt-2 text-2xl font-semibold">{surface === "inventory" ? "Inventory" : "AI connections"}</h1></header>
  {surface === "inventory" ? <InventoryTable householdId={"synthetic-household" as Id<"households">} moveId={"synthetic-move" as Id<"moves">} /> : <AiConnectionManager />}
</main>);
