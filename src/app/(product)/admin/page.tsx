import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin-dashboard";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
