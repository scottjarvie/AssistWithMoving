import type { Metadata } from "next";

import { MovesFamilyRow } from "@/components/moves-family-row";
import { MovesHome } from "@/components/moves-home";

export const metadata: Metadata = {
  title: "Moves",
};

export default function MovesHomePage() {
  return <><MovesHome /><MovesFamilyRow /></>;
}
