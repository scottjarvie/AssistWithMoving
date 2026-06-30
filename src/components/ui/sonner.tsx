"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

// App-wide toast surface — the single confirmation channel the app was missing.
// Placement matters here: the product chrome has a sticky h-16 (64px) header and
// a fixed bottom nav on phones (app-shell.tsx). Bottom toasts would sit under the
// mobile nav, so toasts render top-center, pushed just below the header, where
// they're visible on phone and desktop without colliding with either bar.
// The app is hard-locked to dark mode (no next-themes), so theme is fixed.
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="top-center"
      offset={{ top: "76px" }}
      mobileOffset={{ top: "76px" }}
      richColors
      closeButton
      toastOptions={{ duration: 3000 }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
