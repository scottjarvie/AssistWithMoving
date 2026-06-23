import {
  Archive,
  BadgeDollarSign,
  Bot,
  Camera,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileStack,
  Home,
  Images,
  Inbox,
  Map,
  Truck,
  type LucideIcon,
} from "lucide-react";

import type { WorkspaceNavIconKey } from "@/lib/workspace-nav-items";

// Single source of truth for the icon shown next to each nav destination, so
// the sidebar and the in-page sub-nav never drift apart.
export const navIcons: Record<WorkspaceNavIconKey, LucideIcon> = {
  home: Home,
  items: ClipboardList,
  capture: Camera,
  boxes: Archive,
  queue: Inbox,
  spaces: DoorOpen,
  sell: BadgeDollarSign,
  photos: Images,
  layout: Map,
  loadPlan: Truck,
  moveDay: ClipboardCheck,
  packets: FileStack,
  aiReview: Bot,
};
