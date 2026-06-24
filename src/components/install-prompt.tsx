"use client";

import { useCallback, useEffect, useState } from "react";
import { Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// `beforeinstallprompt` is not in the TS DOM lib; declare the shape we use.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "mm-a2hs-dismissed-at";
const DISMISS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const SHOW_DELAY_MS = 2500;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS Safari sends a desktop "Macintosh" UA (no "iPad" token) since iOS 13,
  // so also treat a Macintosh UA with multi-touch as iPadOS. Real Macs report
  // maxTouchPoints === 0, so they won't false-positive here.
  const iOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Exclude Chrome (crios) and Firefox (fxios) on iOS — they can't add to home screen.
  const isSafari = !/crios|fxios/i.test(ua);
  return iOS && isSafari;
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number.parseInt(raw, 10);
    if (Number.isNaN(at)) return false;
    return Date.now() - at < DISMISS_WINDOW_MS;
  } catch {
    return false;
  }
}

function recordDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
}

export function InstallPrompt() {
  // All three default to "hidden" so the server render and the first client
  // render match (null output). They only change from inside timers / event
  // handlers, which never run during SSR — keeping hydration safe without a
  // synchronous setState in the effect body.
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [stashedEvent, setStashedEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    let showTimer: ReturnType<typeof setTimeout> | undefined;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setStashedEvent(event as BeforeInstallPromptEvent);
      showTimer = setTimeout(() => {
        setMode("android");
        setVisible(true);
      }, SHOW_DELAY_MS);
    };

    const onAppInstalled = () => {
      setVisible(false);
      setStashedEvent(null);
      recordDismissal();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // iOS Safari has no beforeinstallprompt — show instructions instead.
    if (isIOSSafari()) {
      showTimer = setTimeout(() => {
        setMode("ios");
        setVisible(true);
      }, SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (showTimer) clearTimeout(showTimer);
    };
  }, []);

  const dismiss = useCallback(() => {
    recordDismissal();
    setVisible(false);
  }, []);

  // Escape dismisses the banner for keyboard users (only while it's shown).
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, dismiss]);

  const handleInstall = useCallback(async () => {
    if (!stashedEvent) return;
    try {
      await stashedEvent.prompt();
      await stashedEvent.userChoice;
    } catch {
      // Prompt can throw if already consumed; fall through to cleanup.
    }
    setStashedEvent(null);
    recordDismissal();
    setVisible(false);
  }, [stashedEvent]);

  if (!visible || !mode) return null;

  return (
    // Always-rendered polite live region: when the banner content is inserted
    // (~2.5s after load) a screen reader announces it once without stealing focus.
    // `region` semantics on the card (not `dialog`) — this is a passive bottom
    // banner with no focus trap / modal behavior, so dialog would be a false contract.
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex justify-center px-4",
        // Offset above the fixed mobile bottom nav (3.5rem tall, hidden at xl)
        // so the install card never covers the nav tabs or the "+" button.
        // At xl the nav is gone, so drop back to just the safe-area inset.
        "pb-[calc(3.5rem+max(1rem,env(safe-area-inset-bottom)))]",
        "xl:pb-[max(1rem,env(safe-area-inset-bottom))]"
      )}
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <div
        role="region"
        aria-label="Install MovingManifest"
        className={cn(
          "pointer-events-auto flex w-full max-w-md gap-3 rounded-lg border bg-card p-4 text-foreground shadow-lg"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 self-start rounded-lg border"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">Install MovingManifest</p>
            {mode === "android" ? (
              <p className="text-sm text-muted-foreground">
                Add it to your home screen for quick, full-screen access.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tap the Share button{" "}
                <Share
                  className="inline-block size-4 align-text-bottom"
                  aria-label="Share"
                />{" "}
                then choose &ldquo;Add to Home Screen&rdquo;.
              </p>
            )}
          </div>
          {mode === "android" ? (
            <div>
              <Button
                size="lg"
                className="h-11 w-full sm:w-auto"
                onClick={handleInstall}
              >
                Add to home screen
              </Button>
            </div>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          className="size-11 shrink-0"
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
