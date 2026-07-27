import { ConvexOnlyProvider } from "@/components/convex-only-provider";

export default function PublicShareLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ConvexOnlyProvider>{children}</ConvexOnlyProvider>;
}
