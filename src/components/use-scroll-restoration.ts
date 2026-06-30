"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Window scroll restoration for list pages. When a user opens a detail page from
// a long list (Movable Units / Spaces & Transport -> a box page) and comes back,
// the list would otherwise remount at the very top — losing the row they were
// on. This saves the window scroll position (while scrolling) keyed by the
// current route, and restores it ONCE per mount after `ready` becomes true —
// i.e. after the list rows have data so the page is tall enough to scroll to the
// saved offset. The app scrolls the window (the shell's <main> has no inner
// scroll container), so window.scrollY/scrollTo is the right target.
// sessionStorage survives the in-app round-trip but resets on a fresh tab.
export function useScrollRestoration(ready: boolean) {
  const pathname = usePathname();
  const storageKey = `scroll-restore:${pathname}`;
  const restoredRef = useRef(false);
  // Saving is gated OFF until restoration has run. Without this, the browser's
  // scroll-to-top when the list remounts fires a scroll event that overwrites
  // the stored offset with 0 before we get to read it back — so you'd always
  // "restore" to the top. Keeping saves disabled until after restore protects
  // the stored value (and stops the restore jump from re-saving over itself).
  const canSaveRef = useRef(false);

  useEffect(() => {
    if (!ready || restoredRef.current) {
      return;
    }
    restoredRef.current = true;
    const raw = sessionStorage.getItem(storageKey);
    const y = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(y) || y <= 0) {
      canSaveRef.current = true;
      return;
    }
    // The rows are committed to the DOM by now (effects run post-commit), so a
    // 0ms timer is enough to let layout settle before jumping. setTimeout is
    // used over requestAnimationFrame on purpose — rAF is paused entirely while
    // a tab is backgrounded, which would silently skip restoration.
    const timer = setTimeout(() => {
      window.scrollTo(0, y);
      canSaveRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [ready, storageKey]);

  useEffect(() => {
    function onScroll() {
      if (!canSaveRef.current) {
        return;
      }
      sessionStorage.setItem(storageKey, String(window.scrollY));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [storageKey]);
}
