"use client";

import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Archive, Mail, Phone, Save, UserRoundPlus, UsersRound } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type MovePerson = Doc<"movePeople">;
type MovePersonRole = MovePerson["role"];

const movePersonRoleOptions: { value: MovePersonRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "householdMember", label: "Household" },
  { value: "helper", label: "Helper" },
  { value: "mover", label: "Mover" },
  { value: "contact", label: "Contact" },
];

export function MovePeopleManager({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const people = useQuery(
    api.movePeople.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const createPerson = useMutation(api.movePeople.create);

  const [name, setName] = useState("");
  const [role, setRole] = useState<MovePersonRole>("contact");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId || !name.trim()) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await createPerson({
        householdId,
        moveId,
        name,
        role,
        email: email || undefined,
        phone: phone || undefined,
        notes: notes || undefined,
      });
      setName("");
      setRole("contact");
      setEmail("");
      setPhone("");
      setNotes("");
      setMessage("Contact added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add contact.");
    } finally {
      setSaving(false);
    }
  }

  const loading = householdId && moveId && people === undefined;

  return (
    <Card id="move-contacts">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="size-4 text-primary" aria-hidden="true" />
              Move contacts
            </CardTitle>
            <CardDescription>
              Track household helpers, movers, PCS offices, employer contacts,
              adjusters, storage, and pickup coordination.
            </CardDescription>
          </div>
          <Badge variant="secondary">{people?.length ?? 0} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-2 lg:grid-cols-[minmax(160px,1fr)_150px_minmax(160px,1fr)_minmax(140px,0.8fr)_auto]"
          onSubmit={handleCreate}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name or office"
            aria-label="Contact name"
            disabled={!moveId}
          />
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={role}
            aria-label="Contact role"
            disabled={!moveId}
            onChange={(event) => setRole(event.target.value as MovePersonRole)}
          >
            {movePersonRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            aria-label="Contact email"
            disabled={!moveId}
          />
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone"
            aria-label="Contact phone"
            disabled={!moveId}
          />
          <Button type="submit" size="sm" disabled={!moveId || saving || !name.trim()}>
            <UserRoundPlus aria-hidden="true" />
            Add contact
          </Button>
          <Textarea
            className="lg:col-span-4"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Notes, office hours, claim number, pickup constraints"
            aria-label="Contact notes"
            disabled={!moveId}
          />
        </form>

        {message ? (
          <p
            className="rounded-md border border-border p-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-4/5" />
          </div>
        ) : people?.length ? (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Reach</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) =>
                  householdId && moveId ? (
                    <MovePersonRow
                      key={person._id}
                      householdId={householdId}
                      moveId={moveId}
                      person={person}
                      onMessage={setMessage}
                    />
                  ) : null
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Add the first move contact once a move is selected.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MovePersonRow({
  householdId,
  moveId,
  person,
  onMessage,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  person: MovePerson;
  onMessage: (message: string) => void;
}) {
  const updatePerson = useMutation(api.movePeople.update);
  const archivePerson = useMutation(api.movePeople.archive);

  const [name, setName] = useState(person.name);
  const [role, setRole] = useState<MovePersonRole>(person.role);
  const [email, setEmail] = useState(person.email ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updatePerson({
        householdId,
        moveId,
        personId: person._id,
        name,
        role,
        email,
        phone,
        notes,
      });
      onMessage(`${name} saved.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : `Could not save ${name}.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setSaving(true);
    try {
      await archivePerson({
        householdId,
        moveId,
        personId: person._id,
      });
      onMessage(`${person.name} archived.`);
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : `Could not archive ${person.name}.`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="min-w-[180px]">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={`Contact name for ${person.name}`}
        />
      </TableCell>
      <TableCell className="min-w-[140px]">
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={role}
          aria-label={`Contact role for ${person.name}`}
          onChange={(event) => setRole(event.target.value as MovePersonRole)}
        >
          {movePersonRoleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="min-w-[220px]">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-label={`Contact email for ${person.name}`}
              placeholder="Email"
            />
          </div>
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-label={`Contact phone for ${person.name}`}
              placeholder="Phone"
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="min-w-[240px]">
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          aria-label={`Contact notes for ${person.name}`}
          placeholder="Notes"
        />
      </TableCell>
      <TableCell className="min-w-[140px] text-right">
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={`Save ${person.name}`}
            disabled={saving || !name.trim()}
            onClick={() => void handleSave()}
          >
            <Save aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={`Archive ${person.name}`}
            disabled={saving}
            onClick={() => void handleArchive()}
          >
            <Archive aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
