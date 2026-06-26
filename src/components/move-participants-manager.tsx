"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Bot,
  Mail,
  ShieldCheck,
  UserRoundPlus,
  Users,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type GrantableRole = "admin" | "editor" | "packer" | "viewer" | "guest";
type AccessKind = "householdBacked" | "moveOnly";
type ParticipantType =
  | "householdMember"
  | "helper"
  | "mover"
  | "company"
  | "contact";

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Full access",
  editor: "Can edit everything",
  packer: "Can pack",
  viewer: "View only",
  guest: "Limited",
};

const accessGrantingTypes: {
  value: ParticipantType;
  label: string;
  hint: string;
}[] = [
  {
    value: "householdMember",
    label: "Household member (family)",
    hint: "Full access to your whole household.",
  },
  {
    value: "helper",
    label: "Move helper (a friend)",
    hint: "This move only. Can add and pack.",
  },
  {
    value: "mover",
    label: "Moving company crew",
    hint: "This move only. Values & serials hidden.",
  },
  {
    value: "company",
    label: "Moving company",
    hint: "This move only. Values & serials hidden.",
  },
];

const roleOptions: { value: GrantableRole; label: string }[] = [
  { value: "admin", label: "Full access" },
  { value: "editor", label: "Can edit everything" },
  { value: "packer", label: "Can pack" },
  { value: "viewer", label: "View only" },
];

export function MoveParticipantsManager({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const data = useQuery(
    api.moveParticipants.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const invite = useMutation(api.moveParticipants.invite);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [participantType, setParticipantType] =
    useState<ParticipantType>("householdMember");
  const [role, setRole] = useState<GrantableRole>("editor");
  const [canRunMyQueue, setCanRunMyQueue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canManage = data?.canManage ?? false;

  // Picking a type pre-selects its recommended role + access.
  const accessKindForType: AccessKind = useMemo(
    () => (participantType === "householdMember" ? "householdBacked" : "moveOnly"),
    [participantType],
  );

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId || !email.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await invite({
        householdId,
        moveId,
        email: email.trim(),
        name: name.trim() || undefined,
        participantType,
        role,
        accessKind: accessKindForType,
        canRunMyQueue,
      });
      setEmail("");
      setName("");
      setCanRunMyQueue(false);
      setMessage(
        result.status === "active"
          ? "Added — they already have an account and now have access."
          : "Invite saved — they'll get access automatically when they sign up with that email.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add this person.",
      );
    } finally {
      setSaving(false);
    }
  }

  const loading = householdId && moveId && data === undefined;
  const people = data?.people ?? [];

  return (
    <Card id="move-participants">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-primary" aria-hidden="true" />
              People &amp; access
            </CardTitle>
            <CardDescription>
              Add people to this move and choose what they can do — family,
              helpers, or a moving company. Outsiders only ever see this one
              move.
            </CardDescription>
          </div>
          <Badge variant="secondary">{people.length} with access</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? (
          <p
            className="rounded-md border border-border p-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}

        {canManage ? (
          <form
            className="grid gap-2 rounded-md border border-border bg-muted/20 p-3"
            onSubmit={handleInvite}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                aria-label="Person's email"
                disabled={!moveId}
                required
              />
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name (so you remember whose email this is)"
                aria-label="Person's name"
                disabled={!moveId}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                Who is this?
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  value={participantType}
                  aria-label="Participant type"
                  onChange={(event) =>
                    setParticipantType(event.target.value as ParticipantType)
                  }
                >
                  {accessGrantingTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                What can they do?
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  value={role}
                  aria-label="Access level"
                  onChange={(event) =>
                    setRole(event.target.value as GrantableRole)
                  }
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canRunMyQueue}
                onChange={(event) => setCanRunMyQueue(event.target.checked)}
                className="size-4 rounded border-input"
              />
              <span className="flex items-center gap-1">
                <Bot className="size-3.5 text-primary" aria-hidden="true" />
                Let them run my capture queue with their own AI agent
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              {accessGrantingTypes.find((t) => t.value === participantType)?.hint}
            </p>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={!moveId || saving || !email.trim()}
              >
                <UserRoundPlus aria-hidden="true" />
                Add person
              </Button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-4/5" />
          </div>
        ) : people.length ? (
          <ul
            className="grid gap-2"
            aria-label="People with access to this move"
          >
            {people.map((person) => (
              <ParticipantRow
                key={person.key}
                householdId={householdId!}
                moveId={moveId!}
                person={person}
                canManage={canManage}
                onMessage={setMessage}
              />
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No one else has access to this move yet. Add a person above.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type PersonRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.moveParticipants.listForMove>>
>["people"][number];

function ParticipantRow({
  householdId,
  moveId,
  person,
  canManage,
  onMessage,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  person: PersonRow;
  canManage: boolean;
  onMessage: (message: string) => void;
}) {
  const update = useMutation(api.moveParticipants.update);
  const setStatus = useMutation(api.moveParticipants.setStatus);
  const [busy, setBusy] = useState(false);

  const pending = person.status === "invited";
  const agentOff = person.agentAccessStatus === "disabled";
  const displayName = person.name ?? person.email ?? "Pending invite";

  async function changeRole(role: GrantableRole) {
    if (!person.participantId) return;
    setBusy(true);
    try {
      await update({
        householdId,
        moveId,
        participantId: person.participantId,
        role,
      });
      onMessage(`${displayName}'s access updated.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAgent() {
    if (!person.participantId) return;
    setBusy(true);
    try {
      await update({
        householdId,
        moveId,
        participantId: person.participantId,
        agentAccessStatus: agentOff ? "enabled" : "disabled",
      });
      onMessage(
        agentOff
          ? `Agent access turned on for ${displayName}.`
          : `Agent access turned off for ${displayName}.`,
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!person.participantId) return;
    setBusy(true);
    try {
      await setStatus({
        householdId,
        moveId,
        participantId: person.participantId,
        status: "disabled",
      });
      onMessage(`${displayName} removed from this move.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 break-words font-medium">
            {displayName}
            {person.isSelf ? (
              <span className="text-xs text-muted-foreground">(you)</span>
            ) : null}
          </p>
          {person.email ? (
            <p className="flex items-center gap-1 break-all text-xs text-muted-foreground">
              <Mail className="size-3 shrink-0" aria-hidden="true" />
              {person.email}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            {roleLabels[person.role] ?? person.role}
          </Badge>
          {person.accessKind === "moveOnly" ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="size-3" aria-hidden="true" />
              This move only
            </Badge>
          ) : null}
          {pending ? <Badge variant="secondary">Invited</Badge> : null}
          {agentOff ? <Badge variant="destructive">Agent off</Badge> : null}
          {(person.canRunQueueForUserIds?.length ?? 0) > 0 ? (
            <Badge variant="secondary" className="gap-1">
              <Bot className="size-3" aria-hidden="true" />
              Runs a shared queue
            </Badge>
          ) : null}
        </div>
      </div>

      {pending ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Gets access automatically when they sign up with that email.
        </p>
      ) : null}

      {canManage && person.participantId && !person.isSelf ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={
              roleOptions.some((r) => r.value === person.role)
                ? person.role
                : "viewer"
            }
            aria-label={`Access level for ${displayName}`}
            disabled={busy}
            onChange={(event) => void changeRole(event.target.value as GrantableRole)}
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void toggleAgent()}
          >
            <Bot aria-hidden="true" />
            {agentOff ? "Allow agent" : "Block agent"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void disable()}
          >
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  );
}
