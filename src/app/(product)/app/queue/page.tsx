import type { Metadata } from "next";

import { QueueHome } from "@/components/queue-home";

export const metadata: Metadata = {
  title: "Queue",
};

export default function QueuePage() {
  return <QueueHome />;
}
