import { AppShell } from "@/components/app-shell";

export default function ProductLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell section="Workspace">{children}</AppShell>;
}
