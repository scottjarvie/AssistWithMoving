"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { MovingSymbol, type MovingSymbolName } from "@/components/moving-symbol";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { DEFAULT_DISPLAY_PREFERENCES, DISPLAY_PREFERENCES_KEY, parseDisplayPreferences, type DisplayPreferences as Preferences } from "@/lib/display-preferences";

let memory = DEFAULT_DISPLAY_PREFERENCES;
let initialized = false;
const changeEvent = "assistwithmoving:display-change";

function snapshot() {
  if (!initialized) {
    try { memory = parseDisplayPreferences(window.localStorage.getItem(DISPLAY_PREFERENCES_KEY)); } catch { /* Keep the in-memory preference. */ }
    initialized = true;
  }
  return memory;
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DISPLAY_PREFERENCES_KEY && event.key !== null) return;
    memory = parseDisplayPreferences(event.newValue);
    initialized = true;
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, listener);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(changeEvent, listener); };
}

function setPreference(patch: Partial<Preferences>) {
  memory = { ...snapshot(), ...patch };
  try { window.localStorage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify(memory)); } catch { /* Private browsing can deny storage; UI still works. */ }
  window.dispatchEvent(new Event(changeEvent));
}

function usePreferences() { return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_DISPLAY_PREFERENCES); }

export function DisplayPreferenceManager() {
  const preferences = usePreferences();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let printing = false;
    const apply = () => {
      // The hydration snapshot is System/Side; consult the initialized store so
      // the first effect never overwrites a saved bootstrap choice.
      const current = snapshot();
      const dark = !printing && (current.appearance === "dark" || (current.appearance === "system" && media.matches));
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.dataset.navigation = current.navigation;
      document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", dark ? "#191814" : "#f6f2e9"));
    };
    const beforePrint = () => { printing = true; apply(); };
    const afterPrint = () => { printing = false; apply(); };
    apply();
    media.addEventListener("change", apply);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [preferences]);
  return null;
}

const appearances = [{ value: "system", label: "System", icon: "system" }, { value: "light", label: "Light", icon: "sun" }, { value: "dark", label: "Dark", icon: "moon" }] as const;

// Menu controls participate in Radix's roving focus collection. Native radios
// belong in the standalone popover; Radix menus intentionally prevent Tab.
export function DisplayPreferenceMenu() {
  const preferences = usePreferences();
  return <>
    <DropdownMenuLabel>Appearance</DropdownMenuLabel>
    <DropdownMenuRadioGroup aria-label="Appearance" value={preferences.appearance} onValueChange={value => {
      if (value === "system" || value === "light" || value === "dark") setPreference({ appearance: value });
    }}>
      {appearances.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={event => event.preventDefault()} className="min-h-11">
        <MovingSymbol name={option.icon} className="size-4" />{option.label}
      </DropdownMenuRadioItem>)}
    </DropdownMenuRadioGroup>
    <div className="hidden lg:block">
      <DropdownMenuLabel>Navigation</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-label="Navigation" value={preferences.navigation} onValueChange={value => {
        if (value === "side" || value === "top") setPreference({ navigation: value });
      }}>
        <DropdownMenuRadioItem value="side" className="min-h-11" onSelect={event => event.preventDefault()}>Side</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="top" className="min-h-11" onSelect={event => event.preventDefault()}>Top</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </div>
  </>;
}

export function DisplayPreferencePanel({ includeNavigation = false }: { includeNavigation?: boolean }) {
  const preferences = usePreferences();
  const groupId = useId();
  return <div className="space-y-4">
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Appearance</legend>
      <div className="grid grid-cols-3 gap-1">
        {appearances.map(option => <label key={option.value} className="relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-border px-2 py-2 text-xs has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary has-focus-visible:ring-2 has-focus-visible:ring-ring">
          <input className="sr-only" type="radio" name={`${groupId}-appearance`} value={option.value} checked={preferences.appearance === option.value} onChange={() => setPreference({ appearance: option.value })} />
          <MovingSymbol name={option.icon} className="size-4" />{option.label}
        </label>)}
      </div>
    </fieldset>
    {includeNavigation ? <fieldset>
      <legend className="mb-2 text-sm font-medium">Navigation</legend>
      <div className="hidden grid-cols-2 gap-1 lg:grid">
        {(["side", "top"] as const).map(value => <label key={value} className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border px-2 text-sm capitalize has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary has-focus-visible:ring-2 has-focus-visible:ring-ring">
          <input className="sr-only" type="radio" name={`${groupId}-navigation`} value={value} checked={preferences.navigation === value} onChange={() => setPreference({ navigation: value })} />{value === "top" ? "Top" : "Side"}
        </label>)}
      </div>
      <p className="text-xs leading-5 text-muted-foreground lg:mt-2">Phone navigation is automatic. Your desktop choice stays saved.</p>
    </fieldset> : null}
    <p className="text-xs text-muted-foreground">Saved in this browser.</p>
  </div>;
}

export function DisplayPreferences({ includeNavigation = false }: { includeNavigation?: boolean }) {
  const { appearance } = usePreferences();
  const icon: MovingSymbolName = appearance === "light" ? "sun" : appearance === "dark" ? "moon" : "system";
  return <Popover>
    <PopoverTrigger asChild><Button variant="ghost" size="icon-touch" aria-label="Display preferences" title="Appearance and display preferences"><MovingSymbol name={icon} className="size-4" /></Button></PopoverTrigger>
    <PopoverContent align="end" className="w-64"><DisplayPreferencePanel includeNavigation={includeNavigation} /></PopoverContent>
  </Popover>;
}
