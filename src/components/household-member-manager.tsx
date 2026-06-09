"use client";

import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type HouseholdEntry = {
  household: {
    _id: Id<"households">;
    name: string;
  };
  role: string;
};

const manageableRoles = ["admin", "editor", "packer", "viewer", "guest"] as const;
type ManageableRole = (typeof manageableRoles)[number];

const roleLabels = {
  admin: "Admin",
  editor: "Editor",
  packer: "Packer",
  viewer: "Viewer",
  guest: "Guest",
} satisfies Record<ManageableRole, string>;

export function HouseholdMemberManager({
  households,
  enabled,
}: {
  households: HouseholdEntry[] | undefined;
  enabled: boolean;
}) {
  return (
    <section className="space-y-3" aria-labelledby="member-access-heading">
      <div>
        <h3
          id="member-access-heading"
          className="text-base font-medium leading-snug"
        >
          Member access
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add registered collaborators and assign the least access they need for
          packing, viewing, or managing a household.
        </p>
      </div>
      {!enabled || households === undefined ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : households.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {households.map((entry) => (
            <HouseholdMemberPanel
              key={entry.household._id}
              householdId={entry.household._id}
              householdName={entry.household.name}
              currentRole={entry.role}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Create a household before adding collaborators.
        </div>
      )}
    </section>
  );
}

function HouseholdMemberPanel({
  householdId,
  householdName,
  currentRole,
}: {
  householdId: Id<"households">;
  householdName: string;
  currentRole: string;
}) {
  const canManage = currentRole === "owner" || currentRole === "admin";
  const members = useQuery(
    api.households.listMembers,
    canManage ? { householdId } : "skip",
  );
  const addExistingMember = useMutation(api.households.addExistingMember);
  const updateMemberRole = useMutation(api.households.updateMemberRole);
  const disableMember = useMutation(api.households.disableMember);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManageableRole>("editor");
  const [workingMemberId, setWorkingMemberId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setAdding(true);
    setMessage(null);
    try {
      await addExistingMember({ householdId, email: trimmedEmail, role });
      setEmail("");
      setMessage("Collaborator access added.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not add that collaborator yet.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(
    membershipId: Id<"householdMemberships">,
    nextRole: ManageableRole,
  ) {
    setWorkingMemberId(membershipId);
    setMessage(null);
    try {
      await updateMemberRole({ householdId, membershipId, role: nextRole });
      setMessage("Collaborator role updated.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update that collaborator role.",
      );
    } finally {
      setWorkingMemberId(null);
    }
  }

  async function handleDisable(membershipId: Id<"householdMemberships">) {
    setWorkingMemberId(membershipId);
    setMessage(null);
    try {
      await disableMember({ householdId, membershipId });
      setMessage("Collaborator access disabled.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not disable that collaborator.",
      );
    } finally {
      setWorkingMemberId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="size-4 text-primary" aria-hidden="true" />
              {householdName}
            </CardTitle>
            <CardDescription>
              Current access role: {currentRole}
            </CardDescription>
          </div>
          <Badge variant={canManage ? "outline" : "secondary"}>
            {canManage ? "Manageable" : "Read only"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage ? (
          <>
            <form
              className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_auto]"
              onSubmit={handleAddMember}
            >
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@example.com"
                aria-label={`Add collaborator email for ${householdName}`}
                disabled={adding}
              />
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={role}
                aria-label={`New collaborator role for ${householdName}`}
                disabled={adding}
                onChange={(event) => setRole(event.target.value as ManageableRole)}
              >
                {manageableRoles.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleLabels[roleOption]}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                size="sm"
                disabled={adding || !email.trim()}
              >
                <UserPlus aria-hidden="true" />
                Add
              </Button>
            </form>
            <p className="text-xs leading-5 text-muted-foreground">
              For now, collaborators must sign in once before they can be added
              by email. Clerk email invitations should be wired after production
              Clerk is finalized.
            </p>
          </>
        ) : (
          <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            Only household owners and admins can manage collaborators.
          </div>
        )}

        {message ? (
          <p
            className="rounded-md border border-border p-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}

        {canManage && members === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-4/5" />
          </div>
        ) : canManage && members?.length ? (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const canEdit =
                    member.role !== "owner" &&
                    !member.isCurrentUser &&
                    member.status !== "disabled";
                  return (
                    <TableRow key={member.membershipId}>
                      <TableCell>
                        <div className="font-medium">
                          {member.name ?? member.email ?? "Unnamed member"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {member.email ?? "No email on file"}
                          {member.isCurrentUser ? " - you" : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={member.role}
                            aria-label={`Role for ${member.email ?? member.name}`}
                            disabled={workingMemberId === member.membershipId}
                            onChange={(event) =>
                              void handleRoleChange(
                                member.membershipId,
                                event.target.value as ManageableRole,
                              )
                            }
                          >
                            {manageableRoles.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {roleLabels[roleOption]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge variant="outline">{member.role}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{member.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit ? (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            disabled={workingMemberId === member.membershipId}
                            onClick={() => void handleDisable(member.membershipId)}
                          >
                            <X aria-hidden="true" />
                            <span className="sr-only">
                              Disable {member.email ?? member.name}
                            </span>
                          </Button>
                        ) : (
                          <ShieldCheck
                            className="ml-auto size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : canManage ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No active collaborators yet.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
