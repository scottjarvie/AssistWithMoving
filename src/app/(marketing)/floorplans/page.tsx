import type { Metadata } from "next";

import { FloorplansPageShell } from "@/components/floorplans/floorplans-page-shell";

export const metadata: Metadata = {
  title: "Floorplans",
  description:
    "A full-screen floorplan workspace that stores evidence, assumptions, conflicts, upload resources, and the next measurements an AI agent needs.",
};

export default function FloorplansPage() {
  return <FloorplansPageShell mode="public" />;
}
