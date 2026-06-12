"use client";

import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  Pencil,
  Mail,
  Phone,
  Save,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const peopleTasks = [
  { value: "contacts", label: "Contacts" },
  { value: "add", label: "Add contact" },
] as const;

export function MovePeopleManager({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const people = useQuery(
    api.movePeople.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createPerson = useMutation(api.movePeople.create);

  const [name, setName] = useState("");
  const [role, setRole] = useState<MovePersonRole>("contact");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] =
    useState<Id<"movePeople"> | null>(null);

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
      setMessage(
        error instanceof Error ? error.message : "Could not add contact.",
      );
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
              Track household helpers, movers, offices, employer contacts,
              adjusters, storage, and pickup coordination.
            </CardDescription>
          </div>
          <Badge variant="secondary">{people?.length ?? 0} active</Badge>
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

        <Tabs defaultValue="contacts" className="gap-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="min-w-max" aria-label="Move contact tasks">
              {peopleTasks.map((task) => (
                <TabsTrigger key={task.value} value={task.value}>
                  {task.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="contacts">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-4/5" />
              </div>
            ) : people?.length ? (
              <>
                <div
                  role="list"
                  aria-label="Move contact cards"
                  className="grid gap-3 md:hidden"
                >
                  {people.map((person) =>
                    householdId && moveId ? (
                      <MovePersonCard
                        key={person._id}
                        householdId={householdId}
                        moveId={moveId}
                        person={person}
                        editing={editingPersonId === person._id}
                        onEdit={() => setEditingPersonId(person._id)}
                        onClose={() => setEditingPersonId(null)}
                        onMessage={setMessage}
                      />
                    ) : null,
                  )}
                </div>

                <div className="hidden rounded-md border border-border md:block">
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
                            editing={editingPersonId === person._id}
                            onEdit={() => setEditingPersonId(person._id)}
                            onClose={() => setEditingPersonId(null)}
                            onMessage={setMessage}
                          />
                        ) : null,
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                Add the first move contact once a move is selected.
              </div>
            )}
          </TabsContent>

          <TabsContent value="add">
            <form
              className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 lg:grid-cols-[minmax(160px,1fr)_150px_minmax(160px,1fr)_minmax(140px,0.8fr)_auto]"
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
                onChange={(event) =>
                  setRole(event.target.value as MovePersonRole)
                }
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
              <Button
                type="submit"
                size="sm"
                disabled={!moveId || saving || !name.trim()}
              >
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
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function useMovePersonEditor({
  householdId,
  moveId,
  person,
  onMessage,
  onDone,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  person: MovePerson;
  onMessage: (message: string) => void;
  onDone?: () => void;
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
      onDone?.();
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : `Could not save ${name}.`,
      );
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
      onDone?.();
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : `Could not archive ${person.name}.`,
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    name,
    setName,
    role,
    setRole,
    email,
    setEmail,
    phone,
    setPhone,
    notes,
    setNotes,
    saving,
    handleSave,
    handleArchive,
  };
}

function MovePersonCard({
  householdId,
  moveId,
  person,
  editing,
  onEdit,
  onClose,
  onMessage,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  person: MovePerson;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onMessage: (message: string) => void;
}) {
  return (
    <div
      role="listitem"
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{person.name}</p>
          <ContactReach person={person} className="mt-2" />
        </div>
        <Badge variant="outline">{movePersonRoleLabel(person.role)}</Badge>
      </div>

      <p className="mt-3 line-clamp-3 break-words text-sm text-muted-foreground">
        {person.notes || "No notes yet."}
      </p>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={editing}
          aria-label={`Edit ${person.name}`}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      </div>

      {editing ? (
        <MovePersonEditorPanel
          className="mt-3"
          householdId={householdId}
          moveId={moveId}
          person={person}
          onMessage={onMessage}
          onClose={onClose}
        />
      ) : null}
    </div>
  );
}

function MovePersonRow({
  householdId,
  moveId,
  person,
  editing,
  onEdit,
  onClose,
  onMessage,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  person: MovePerson;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onMessage: (message: string) => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell className="min-w-[180px]">
          <div className="font-medium">{person.name}</div>
        </TableCell>
        <TableCell className="min-w-[120px]">
          <Badge variant="outline">{movePersonRoleLabel(person.role)}</Badge>
        </TableCell>
        <TableCell className="min-w-[220px]">
          <ContactReach person={person} />
        </TableCell>
        <TableCell className="max-w-[360px]">
          <p className="line-clamp-2 break-words text-sm text-muted-foreground">
            {person.notes || "No notes yet."}
          </p>
        </TableCell>
        <TableCell className="min-w-[120px] text-right">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={editing}
            aria-label={`Edit ${person.name}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        </TableCell>
      </TableRow>
      {editing ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/20 p-3">
            <MovePersonEditorPanel
              householdId={householdId}
              moveId={moveId}
              person={person}
              onMessage={onMessage}
              onClose={onClose}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function MovePersonEditorPanel({
  className,
  householdId,
  moveId,
  person,
  onMessage,
  onClose,
}: {
  className?: string;
  householdId: Id<"households">;
  moveId: Id<"moves">;
  person: MovePerson;
  onMessage: (message: string) => void;
  onClose: () => void;
}) {
  const editor = useMovePersonEditor({
    householdId,
    moveId,
    person,
    onMessage,
    onDone: onClose,
  });

  return (
    <div
      className={[
        "rounded-md border border-border bg-background p-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="grid gap-2 lg:grid-cols-[minmax(180px,1fr)_150px_minmax(180px,1fr)_minmax(160px,0.8fr)]">
        <Input
          value={editor.name}
          onChange={(event) => editor.setName(event.target.value)}
          aria-label={`Contact name for ${person.name}`}
        />
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={editor.role}
          aria-label={`Contact role for ${person.name}`}
          onChange={(event) =>
            editor.setRole(event.target.value as MovePersonRole)
          }
        >
          {movePersonRoleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Input
          value={editor.email}
          onChange={(event) => editor.setEmail(event.target.value)}
          aria-label={`Contact email for ${person.name}`}
          placeholder="Email"
        />
        <Input
          value={editor.phone}
          onChange={(event) => editor.setPhone(event.target.value)}
          aria-label={`Contact phone for ${person.name}`}
          placeholder="Phone"
        />
        <Textarea
          className="lg:col-span-4"
          value={editor.notes}
          onChange={(event) => editor.setNotes(event.target.value)}
          aria-label={`Contact notes for ${person.name}`}
          placeholder="Notes"
        />
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          <X aria-hidden="true" />
          Close
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={editor.saving}
          onClick={() => void editor.handleArchive()}
        >
          <Archive aria-hidden="true" />
          Archive
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={editor.saving || !editor.name.trim()}
          onClick={() => void editor.handleSave()}
        >
          <Save aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  );
}

function ContactReach({
  person,
  className,
}: {
  person: MovePerson;
  className?: string;
}) {
  if (!person.email && !person.phone) {
    return (
      <p
        className={["text-xs text-muted-foreground", className]
          .filter(Boolean)
          .join(" ")}
      >
        No contact method yet
      </p>
    );
  }

  return (
    <div
      className={["space-y-1 text-xs text-muted-foreground", className]
        .filter(Boolean)
        .join(" ")}
    >
      {person.email ? (
        <div className="flex min-w-0 items-center gap-2">
          <Mail className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="break-all">{person.email}</span>
        </div>
      ) : null}
      {person.phone ? (
        <div className="flex min-w-0 items-center gap-2">
          <Phone className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="break-all">{person.phone}</span>
        </div>
      ) : null}
    </div>
  );
}

function movePersonRoleLabel(role: MovePersonRole) {
  return (
    movePersonRoleOptions.find((option) => option.value === role)?.label ?? role
  );
}
