import { HomeLaunchpad } from "@/components/home-launchpad";

// The logged-in home is a focused launchpad: the four main destinations
// (Moves, Movable Units, Items, Queue) plus a standing entry point to connect
// an AI assistant. The full moves list lives under the Moves destination.
export default function AppIndexPage() {
  return <HomeLaunchpad />;
}
