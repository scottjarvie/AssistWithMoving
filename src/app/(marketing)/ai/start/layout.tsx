import { ClerkClientProvider } from "@/components/clerk-client-provider";

export default function AiStartLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ClerkClientProvider>{children}</ClerkClientProvider>;
}
