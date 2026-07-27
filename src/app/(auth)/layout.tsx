import { ClerkClientProvider } from "@/components/clerk-client-provider";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ClerkClientProvider>{children}</ClerkClientProvider>;
}
