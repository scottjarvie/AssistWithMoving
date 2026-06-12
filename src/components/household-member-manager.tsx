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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const memberAccessTasks = [
  { value: "members", label: "Members" },
  { value: "invite", label: "Invite" },
] as const;

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
          Add collaborators by email and assign the least access they need for
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
  const revokeInvitation = useMutation(api.households.revokeInvitation);
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
      const result = await addExistingMember({
        householdId,
        email: trimmedEmail,
        role,
      });
      setEmail("");
      setMessage(
        result.kind === "invitation"
          ? "Invitation saved. They will get access after signing in with that email."
          : "Collaborator access added.",
      );
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

  async function handleRevoke(invitationId: Id<"householdInvitations">) {
    setWorkingMemberId(invitationId);
    setMessage(null);
    try {
      await revokeInvitation({ householdId, invitationId });
      setMessage("Pending invitation revoked.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not revoke that invitation.",
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
            {message ? (
              <p
                className="rounded-md border border-border p-3 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {message}
              </p>
            ) : null}

            <Tabs defaultValue="members" className="gap-4">
              <div className="overflow-x-auto pb-1">
                <TabsList
                  className="min-w-max"
                  aria-label={`${householdName} access tasks`}
                >
                  {memberAccessTasks.map((task) => (
                    <TabsTrigger key={task.value} value={task.value}>
                      {task.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="members">
                {members === undefined ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-4/5" />
                  </div>
                ) : members.length ? (
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
                          const membershipId = member.membershipId;
                          const invitationId = member.invitationId;
                          const rowId = membershipId ?? invitationId;
                          const isPendingInvite = member.status === "invited";
                          const canEdit =
                            membershipId !== null &&
                            member.role !== "owner" &&
                            !member.isCurrentUser &&
                            member.status !== "disabled";
                          return (
                            <TableRow key={rowId}>
                              <TableCell>
                                <div className="font-medium">
                                  {member.name ??
                                    member.email ??
                                    "Unnamed member"}
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
                                    disabled={workingMemberId === membershipId}
                                    onChange={(event) =>
                                      void handleRoleChange(
                                        membershipId,
                                        event.target.value as ManageableRole,
                                      )
                                    }
                                  >
                                    {manageableRoles.map((roleOption) => (
                                      <option
                                        key={roleOption}
                                        value={roleOption}
                                      >
                                        {roleLabels[roleOption]}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <Badge variant="outline">{member.role}</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {member.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {canEdit ? (
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="outline"
                                    disabled={workingMemberId === membershipId}
                                    onClick={() =>
                                      void handleDisable(membershipId)
                                    }
                                  >
                                    <X aria-hidden="true" />
                                    <span className="sr-only">
                                      Disable {member.email ?? member.name}
                                    </span>
                                  </Button>
                                ) : isPendingInvite && invitationId ? (
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="outline"
                                    disabled={workingMemberId === invitationId}
                                    onClick={() =>
                                      void handleRevoke(invitationId)
                                    }
                                  >
                                    <X aria-hidden="true" />
                                    <span className="sr-only">
                                      Revoke invitation for {member.email}
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
                ) : (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No active collaborators yet.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="invite" className="space-y-3">
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
                    onChange={(event) =>
                      setRole(event.target.value as ManageableRole)
                    }
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
                  If that email does not have an account yet, MovingManifest
                  keeps a pending invitation and activates it when they sign in
                  with the same email.
                </p>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            Only household owners and admins can manage collaborators.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
