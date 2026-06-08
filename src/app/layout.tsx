import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://movingmanifest.com"
  ),
  title: {
    default: "MovingManifest",
    template: "%s | MovingManifest",
  },
  description:
    "A move inventory, box manifest, photo evidence vault, load plan, and documentation packet system.",
  applicationName: "MovingManifest",
  openGraph: {
    title: "MovingManifest",
    description:
      "Inventory every item, box every room, plan every load, and export the right documentation packet.",
    siteName: "MovingManifest",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
