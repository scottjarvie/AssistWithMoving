import type { Metadata } from "next";

import { SpacesTransportPageContent } from "@/components/spaces-transport-page";

export const metadata: Metadata = {
  title: "Spaces & transport",
};

export default function SpacesTransportPage() {
  return <SpacesTransportPageContent />;
}
