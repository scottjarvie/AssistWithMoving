import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { InstallPrompt } from "@/components/install-prompt";
import { Toaster } from "@/components/ui/sonner";
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
    process.env.NEXT_PUBLIC_APP_URL ?? "https://movingmanifest.com",
  ),
  title: {
    default: "Assist With Moving",
    template: "%s | Assist With Moving",
  },
  description:
    "A durable move-planning workspace shared by you and your chosen AI.",
  applicationName: "Assist With Moving",
  openGraph: {
    title: "Assist With Moving",
    description:
      "Organize the changing plan, places, belongings, evidence, decisions, and handoffs for your move.",
    siteName: "Assist With Moving",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Assist With Moving",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#151411",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

const extensionHydrationGuard = `
(function () {
  if (!/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(window.location.hostname)) return;
  var noisyClass = "keychainify-checked";
  function clean(root) {
    if (!root) return;
    if (root.classList && root.classList.contains(noisyClass)) {
      root.classList.remove(noisyClass);
    }
    if (root.getAttribute && root.getAttribute("class") === "") {
      root.removeAttribute("class");
    }
    if (!root.querySelectorAll) return;
    var nodes = root.querySelectorAll("." + noisyClass + ', [class=""]');
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].classList.remove(noisyClass);
      if (nodes[i].getAttribute("class") === "") {
        nodes[i].removeAttribute("class");
      }
    }
  }
  clean(document.documentElement);
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i += 1) {
      var mutation = mutations[i];
      if (mutation.type === "attributes") {
        clean(mutation.target);
      }
      for (var j = 0; j < mutation.addedNodes.length; j += 1) {
        clean(mutation.addedNodes[j]);
      }
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true
  });
  window.addEventListener("load", function () {
    clean(document.documentElement);
    window.setTimeout(function () {
      observer.disconnect();
    }, 1000);
  }, { once: true });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <ConvexClientProvider>
      {children}
    </ConvexClientProvider>
  );

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {process.env.NODE_ENV === "development" ? (
          <Script
            id="extension-hydration-guard"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: extensionHydrationGuard }}
          />
        ) : null}
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <ClerkProvider
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            afterSignOutUrl="/"
          >
            {content}
          </ClerkProvider>
        ) : (
          content
        )}
        <InstallPrompt />
        <Toaster />
      </body>
    </html>
  );
}
