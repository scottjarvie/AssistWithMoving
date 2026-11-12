"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Dialog, Popover } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const subscribe = (callback: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(max-width: 639px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};

/** One opener, nonmodal ledger on desktop, modal sheet on phones. */
export function FamilySurface({ label, title, trigger, children, roster = false }: {
  label: string; title: string; trigger: ReactNode;
  children: (close: () => void) => ReactNode; roster?: boolean;
}) {
  const phone = useSyncExternalStore(subscribe, () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 639px)").matches, () => false);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const key = `${pathname}-${phone}`;
  const [surfaceKey, setSurfaceKey] = useState(key);
  if (surfaceKey !== key) { setSurfaceKey(key); setOpen(false); }
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    // Internal surface scrolling must not dismiss it.
    if (!phone) window.addEventListener("scroll", close);
    return () => { window.removeEventListener("hashchange", close); window.removeEventListener("scroll", close); };
  }, [phone]);
  // Remounting on route/breakpoint changes closes the surface without moving focus.
  const close = () => setOpen(false);
  const button = <Button ref={opener} size="icon-touch" variant="ghost" className={roster ? "family-all" : "rounded-full"} aria-label={label} aria-expanded={open} onPointerDown={event => { opener.current = event.currentTarget; }}>{trigger}</Button>;
  const focusFirstLink = (event: Event) => {
    const content = event.target as HTMLElement;
    const link = content.querySelector<HTMLAnchorElement>("a[href]");
    if (link) { event.preventDefault(); link.focus(); }
  };
  const restore = (event: Event) => { event.preventDefault(); opener.current?.focus(); };
  if (phone) return <Dialog.Root key={`${pathname}-phone`} open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild>{button}</Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="family-scrim" onClick={close} />
      <Dialog.Content aria-modal="true" onOpenAutoFocus={focusFirstLink} className={`family-sheet ${roster ? "family-roster" : "account-surface"}`} aria-describedby={undefined} onCloseAutoFocus={restore} onPointerDownOutside={event => event.preventDefault()}>
        <div className="family-sheet-header"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><Button size="icon-touch" variant="ghost" aria-label="Close"><X aria-hidden="true" /></Button></Dialog.Close></div>
        <div className="family-sheet-scroll">{children(close)}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
  return <Popover.Root key={`${pathname}-desktop`} open={open} onOpenChange={setOpen} modal={false}>
    <Popover.Trigger asChild>{button}</Popover.Trigger>
    <Popover.Portal><Popover.Content onOpenAutoFocus={focusFirstLink} align="end" side={roster ? "top" : "bottom"} sideOffset={8} collisionPadding={8} className={`family-popover ${roster ? "family-roster" : "account-surface"}`} aria-label={title} onCloseAutoFocus={restore}>
      {roster && <h2 className="family-roster-title">{title}</h2>}{children(close)}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
