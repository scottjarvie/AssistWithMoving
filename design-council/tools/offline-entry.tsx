import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AiConnectionManager } from "@/components/ai-connection-manager";
import { InventoryTable } from "@/components/inventory-table";
import type { Id } from "../../convex/_generated/dataModel";

const surface = new URLSearchParams(location.search).get("surface") ?? "ai";
const fixtureWindow = window as Window & { __fixtureNavigationAttempts?: string[] };
function blockNavigation(event: MouseEvent) {
  const anchor = event.target instanceof Element ? event.target.closest("a") : null;
  if (!anchor) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent("fixture:navigation", { detail: anchor.dataset.fixtureDestination ?? anchor.getAttribute("href") ?? "Unknown destination" }));
}
document.addEventListener("click", blockNavigation, true);
document.addEventListener("auxclick", blockNavigation, true);
function Fixture() {
  const [destination, setDestination] = useState("");
  useEffect(() => {
    function notice(event: Event) {
      const target = String((event as CustomEvent).detail);
      (fixtureWindow.__fixtureNavigationAttempts ??= []).push(target);
      setDestination(target);
    }
    window.addEventListener("fixture:navigation", notice);
    return () => window.removeEventListener("fixture:navigation", notice);
  }, []);
  return <main className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
  <header><p className="text-xs font-medium text-accent">Moving · fictional offline component evidence</p><h1 className="mt-2 text-2xl font-semibold">{surface === "inventory" ? "Inventory" : "AI connections"}</h1></header>
  <p role="status" aria-live="polite" className={destination ? "border-l-2 border-evidence pl-3 text-sm" : "sr-only"}>{destination ? `Destination outside this fixture: ${destination}. Navigation was blocked; this offline sample stays open.` : ""}</p>
  {surface === "inventory" ? <InventoryTable householdId={"synthetic-household" as Id<"households">} moveId={"synthetic-move" as Id<"moves">} /> : <AiConnectionManager />}
</main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
