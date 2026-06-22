"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Shared status / disposition / assignment badges for the data-dense surfaces.
 *
 * These centralize the token tone maps so the inventory table, movable-units
 * table, and any future surface render the exact same colored chip for a given
 * stored value. The stored enums never change here — only the label and tone
 * are mapped (notably `dump` is stored as-is but shown as "Trash").
 */

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"]

type Tone = {
  variant: BadgeVariant
  className?: string
}

const accentTone: Tone = {
  variant: "outline",
  className:
    "border-transparent bg-accent text-accent-foreground [a]:hover:bg-accent/80",
}

const trashTone: Tone = {
  variant: "outline",
  className:
    "border-transparent bg-muted text-muted-foreground line-through decoration-muted-foreground/40",
}

const destructiveSoftTone: Tone = {
  variant: "destructive",
}

function ToneBadge({
  tone,
  className,
  ...props
}: { tone: Tone } & React.ComponentProps<typeof Badge>) {
  return (
    <Badge
      variant={tone.variant}
      className={cn(tone.className, className)}
      {...props}
    />
  )
}

// --- Item status -----------------------------------------------------------

const statusTones: Record<string, Tone> = {
  draft: { variant: "outline" },
  active: { variant: "secondary" },
  packed: { variant: "default" },
  staged: { variant: "secondary" },
  loaded: { variant: "default" },
  delivered: accentTone,
  missing: destructiveSoftTone,
  damaged: destructiveSoftTone,
  archived: { variant: "ghost" },
}

export function StatusBadge({
  status,
  className,
  ...props
}: { status: string } & Omit<
  React.ComponentProps<typeof Badge>,
  "variant" | "children"
>) {
  const tone = statusTones[status] ?? { variant: "outline" }
  return (
    <ToneBadge tone={tone} className={className} {...props}>
      {status}
    </ToneBadge>
  )
}

// --- Item disposition ------------------------------------------------------

type DispositionDisplay = { label: string; tone: Tone }

const dispositionDisplay: Record<string, DispositionDisplay> = {
  undecided: { label: "Undecided", tone: { variant: "outline" } },
  take: { label: "Take", tone: { variant: "outline" } },
  storage: { label: "Storage", tone: { variant: "outline" } },
  sell: { label: "Sell", tone: accentTone },
  donate: { label: "Donate", tone: { variant: "secondary" } },
  free: { label: "Free", tone: { variant: "secondary" } },
  // Stored enum stays `dump`; only the badge maps it to "Trash".
  dump: { label: "Trash", tone: trashTone },
  mover: { label: "Mover", tone: { variant: "outline" } },
  personalTransport: {
    label: "Personal",
    tone: { variant: "secondary" },
  },
}

export function DispositionBadge({
  disposition,
  className,
  ...props
}: { disposition: string } & Omit<
  React.ComponentProps<typeof Badge>,
  "variant" | "children"
>) {
  const display =
    dispositionDisplay[disposition] ?? {
      label: disposition,
      tone: { variant: "outline" } as Tone,
    }
  return (
    <ToneBadge tone={display.tone} className={className} {...props}>
      {display.label}
    </ToneBadge>
  )
}

// --- Load assignment -------------------------------------------------------

export type AssignmentState = "assigned" | "unassigned" | "owner"

const assignmentTones: Record<AssignmentState, Tone> = {
  assigned: { variant: "default" },
  unassigned: destructiveSoftTone,
  owner: { variant: "secondary" },
}

export function AssignmentBadge({
  state,
  label,
  className,
  ...props
}: {
  state: AssignmentState
  label?: string
} & Omit<React.ComponentProps<typeof Badge>, "variant" | "children">) {
  const tone = assignmentTones[state] ?? { variant: "outline" }
  const fallback =
    state === "assigned"
      ? "Assigned"
      : state === "owner"
        ? "Personal"
        : "Needs load"
  return (
    <ToneBadge tone={tone} className={className} {...props}>
      {label ?? fallback}
    </ToneBadge>
  )
}
