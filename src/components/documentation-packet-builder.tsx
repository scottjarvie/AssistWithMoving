"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { FileText, Link2, RefreshCw, ShieldCheck } from "lucide-react";

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
  documentationFieldOptions,
  documentationImageRuleOptions,
  shareLinkActionOptions,
  shareLinkRoleOptions,
  summarizeDocumentationProfile,
  type DocumentationFieldKey,
  type DocumentationImageRule,
  type ShareLinkAction,
  type ShareLinkRole,
} from "@/lib/documentation-packets";
import { buildClaimPacketPath } from "@/lib/claim-packet";
import { buildPcsPacketPath } from "@/lib/pcs-packet";
import { buildEmployerPacketPath } from "@/lib/employer-packet";
import {
  documentationProfileOptions,
  type DocumentationProfileType,
} from "@/lib/move-presets";
import { buildMoverPacketPath } from "@/lib/mover-packet";

type DocumentationProfile = {
  _id: Id<"documentationProfiles">;
  type: DocumentationProfileType;
  name: string;
  status: "draft" | "active" | "archived";
  includedFields: DocumentationFieldKey[];
  imageRule: DocumentationImageRule;
  filters: {
    dispositions?: ProfileDisposition[];
    statuses?: ProfileStatus[];
    planningDefaultKeys?: ProfilePlanningDefaultKey[];
    room?: string;
    destinationRoom?: string;
  };
  allowedActions: ShareLinkAction[];
  disclaimer?: string;
  exportHistory: Array<unknown>;
};

type ShareLink = {
  _id: Id<"shareLinks">;
  documentationProfileId?: Id<"documentationProfiles">;
  scope: "move" | "profile";
  tokenPreview: string;
  label?: string;
  role: string;
  status: "active" | "revoked";
  allowedActions: ShareLinkAction[];
  expiresAt: number;
  accessCount: number;
};

type ProfileDisposition =
  | "undecided"
  | "take"
  | "sell"
  | "donate"
  | "dump"
  | "free"
  | "storage"
  | "mover"
  | "personalTransport";
type ProfileStatus =
  | "draft"
  | "active"
  | "packed"
  | "staged"
  | "loaded"
  | "delivered"
  | "missing"
  | "damaged"
  | "archived";
type ProfilePlanningDefaultKey =
  | "firstNight"
  | "doNotLetMoversTouch"
  | "highValue"
  | "documents"
  | "medication"
  | "electronics"
  | "sensitive"
  | "fragile"
  | "irreplaceable"
  | "restrictedReview";

const profileLabel = new Map(documentationProfileOptions);

export function DocumentationPacketBuilder({
  householdId,
  moveId,
  selectedProfileTypes,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  selectedProfileTypes: DocumentationProfileType[];
}) {
  const profiles = useQuery(
    api.documentationProfiles.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  ) as DocumentationProfile[] | undefined;
  const links = useQuery(
    api.shareLinks.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  ) as ShareLink[] | undefined;
  const createProfile = useMutation(api.documentationProfiles.create);
  const updateProfile = useMutation(api.documentationProfiles.update);
  const archiveProfile = useMutation(api.documentationProfiles.archive);
  const createShareLink = useAction(api.shareLinks.create);
  const revokeShareLink = useMutation(api.shareLinks.revoke);

  const [profileType, setProfileType] =
    useState<DocumentationProfileType>("pcsMove");
  const [selectedProfileId, setSelectedProfileId] =
    useState<Id<"documentationProfiles"> | null>(null);
  const [draftProfileId, setDraftProfileId] =
    useState<Id<"documentationProfiles"> | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftFields, setDraftFields] = useState<DocumentationFieldKey[]>([]);
  const [draftImageRule, setDraftImageRule] =
    useState<DocumentationImageRule>("thumbsOnly");
  const [draftActions, setDraftActions] = useState<ShareLinkAction[]>(["view"]);
  const [draftRoomFilter, setDraftRoomFilter] = useState("");
  const [draftDestinationFilter, setDraftDestinationFilter] = useState("");
  const [linkRole, setLinkRole] = useState<ShareLinkRole>("viewer");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const activeProfiles = useMemo(
    () => profiles?.filter((profile) => profile.status !== "archived") ?? [],
    [profiles]
  );
  const selectedProfile =
    activeProfiles.find((profile) => profile._id === selectedProfileId) ??
    activeProfiles[0];
  const draftLoaded = Boolean(
    selectedProfile && draftProfileId === selectedProfile._id
  );
  const effectiveName = draftLoaded ? draftName : (selectedProfile?.name ?? "");
  const effectiveFields = draftLoaded
    ? draftFields
    : (selectedProfile?.includedFields ?? []);
  const effectiveImageRule = draftLoaded
    ? draftImageRule
    : (selectedProfile?.imageRule ?? "thumbsOnly");
  const effectiveActions = draftLoaded
    ? draftActions
    : (selectedProfile?.allowedActions ?? ["view"]);
  const effectiveRoomFilter = draftLoaded
    ? draftRoomFilter
    : (selectedProfile?.filters.room ?? "");
  const effectiveDestinationFilter = draftLoaded
    ? draftDestinationFilter
    : (selectedProfile?.filters.destinationRoom ?? "");
  const activeLinks = links?.filter((link) => link.status === "active") ?? [];
  const missingMoveProfiles = selectedProfileTypes.filter(
    (type) => !activeProfiles.some((profile) => profile.type === type)
  );
  const preview = selectedProfile
    ? summarizeDocumentationProfile({
        ...selectedProfile,
        includedFields: effectiveFields,
        imageRule: effectiveImageRule,
        filters: {
          ...selectedProfile.filters,
          room: effectiveRoomFilter || undefined,
          destinationRoom: effectiveDestinationFilter || undefined,
        },
        allowedActions: effectiveActions,
      })
    : null;

  function loadProfileDraft(profile: DocumentationProfile) {
    setDraftProfileId(profile._id);
    setDraftName(profile.name);
    setDraftFields(profile.includedFields);
    setDraftImageRule(profile.imageRule);
    setDraftActions(profile.allowedActions);
    setDraftRoomFilter(profile.filters.room ?? "");
    setDraftDestinationFilter(profile.filters.destinationRoom ?? "");
  }

  function ensureDraftLoaded(profile: DocumentationProfile) {
    if (draftProfileId !== profile._id) {
      loadProfileDraft(profile);
    }
  }

  async function handleCreateProfile(type = profileType) {
    if (!householdId || !moveId) return;
    setBusy(`create-${type}`);
    setMessage(null);
    try {
      const documentationProfileId = await createProfile({
        householdId,
        moveId,
        type,
      });
      setSelectedProfileId(documentationProfileId);
      setMessage("Packet profile created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create profile.");
    } finally {
      setBusy(null);
    }
  }

  async function handleEnsureMoveProfiles() {
    if (!householdId || !moveId || !missingMoveProfiles.length) return;
    setBusy("ensure");
    setMessage(null);
    try {
      for (const type of missingMoveProfiles) {
        await createProfile({ householdId, moveId, type });
      }
      setMessage("Move packet profiles created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create profiles.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveProfile() {
    if (!householdId || !moveId || !selectedProfile) return;
    setBusy("save");
    setMessage(null);
    try {
      await updateProfile({
        householdId,
        moveId,
        documentationProfileId: selectedProfile._id,
        type: selectedProfile.type,
        name: effectiveName,
        includedFields: effectiveFields,
        imageRule: effectiveImageRule,
        filters: {
          ...selectedProfile.filters,
          room: effectiveRoomFilter || undefined,
          destinationRoom: effectiveDestinationFilter || undefined,
        },
        allowedActions: effectiveActions,
        disclaimer: selectedProfile.disclaimer,
      });
      setMessage("Packet profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setBusy(null);
    }
  }

  async function handleArchiveProfile(profileId: Id<"documentationProfiles">) {
    if (!householdId || !moveId) return;
    setBusy(`archive-${profileId}`);
    setMessage(null);
    try {
      await archiveProfile({
        householdId,
        moveId,
        documentationProfileId: profileId,
      });
      setMessage("Packet profile archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not archive profile.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateShareLink() {
    if (!householdId || !moveId || !selectedProfile) return;
    const parsedDays = Number(expiresInDays);
    const safeDays = Number.isFinite(parsedDays)
      ? Math.min(Math.max(parsedDays, 1), 366)
      : 30;
    setBusy("link");
    setCreatedToken(null);
    setMessage(null);
    try {
      const result = await createShareLink({
        householdId,
        moveId,
        documentationProfileId: selectedProfile._id,
        scope: "profile",
        label: effectiveName,
        role: linkRole,
        allowedActions: effectiveActions,
        expiresAt: Date.now() + safeDays * 24 * 60 * 60 * 1000,
      });
      setCreatedToken(result.token);
      setMessage("Share link token created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create link.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevokeShareLink(shareLinkId: Id<"shareLinks">) {
    if (!householdId || !moveId) return;
    setBusy(`revoke-${shareLinkId}`);
    setMessage(null);
    try {
      await revokeShareLink({ householdId, moveId, shareLinkId });
      setMessage("Share link revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card id="documentation-packets">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-primary" aria-hidden="true" />
              Documentation packets
            </CardTitle>
            <CardDescription>
              Build scoped recipient profiles before exporting or sharing move
              records.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!moveId || !missingMoveProfiles.length || busy === "ensure"}
            onClick={() => void handleEnsureMoveProfiles()}
          >
            {busy === "ensure" ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
            Ensure move profiles
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label="Profiles" value={activeProfiles.length} />
          <Stat label="Active links" value={activeLinks.length} />
          <Stat label="Missing defaults" value={missingMoveProfiles.length} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={profileType}
            onChange={(event) =>
              setProfileType(event.target.value as DocumentationProfileType)
            }
          >
            {documentationProfileOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!moveId || busy === `create-${profileType}`}
            onClick={() => void handleCreateProfile()}
          >
            Create profile
          </Button>
        </div>

        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {profiles === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-5/6" />
          </div>
        ) : activeProfiles.length ? (
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2">
              {activeProfiles.map((profile) => (
                <button
                  key={profile._id}
                  type="button"
                  className={`w-full rounded-md border p-3 text-left text-sm transition ${
                    selectedProfile?._id === profile._id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setSelectedProfileId(profile._id);
                    loadProfileDraft(profile);
                  }}
                >
                  <span className="block font-medium">{profile.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {profileLabel.get(profile.type) ?? profile.type}
                  </span>
                </button>
              ))}
            </div>

            {selectedProfile && preview ? (
              <div className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <Input
                    value={effectiveName}
                    onChange={(event) => {
                      ensureDraftLoaded(selectedProfile);
                      setDraftName(event.target.value);
                    }}
                    aria-label="Packet profile name"
                  />
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={effectiveImageRule}
                    onChange={(event) => {
                      ensureDraftLoaded(selectedProfile);
                      setDraftImageRule(
                        event.target.value as DocumentationImageRule
                      );
                    }}
                  >
                    {documentationImageRuleOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <OptionGroup
                    title="Fields"
                    options={documentationFieldOptions}
                    selected={effectiveFields}
                    onToggle={(value) => {
                      ensureDraftLoaded(selectedProfile);
                      setDraftFields((current) =>
                        toggleValue(
                          draftProfileId === selectedProfile._id
                            ? current
                            : selectedProfile.includedFields,
                          value
                        )
                      );
                    }}
                  />
                  <OptionGroup
                    title="Link actions"
                    options={shareLinkActionOptions}
                    selected={effectiveActions}
                    onToggle={(value) => {
                      ensureDraftLoaded(selectedProfile);
                      setDraftActions((current) =>
                        toggleValue(
                          draftProfileId === selectedProfile._id
                            ? current
                            : selectedProfile.allowedActions,
                          value
                        )
                      );
                    }}
                  />
                </div>

                <div className="rounded-md border border-border p-3">
                  <h3 className="text-sm font-medium">Filters</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Input
                      value={effectiveRoomFilter}
                      onChange={(event) => {
                        ensureDraftLoaded(selectedProfile);
                        setDraftRoomFilter(event.target.value);
                      }}
                      aria-label="Room filter"
                      placeholder="Room"
                    />
                    <Input
                      value={effectiveDestinationFilter}
                      onChange={(event) => {
                        ensureDraftLoaded(selectedProfile);
                        setDraftDestinationFilter(event.target.value);
                      }}
                      aria-label="Destination room filter"
                      placeholder="Destination room"
                    />
                  </div>
                </div>

                <div className="rounded-md border border-border p-3">
                  <h3 className="text-sm font-medium">Preview</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {preview.includedFieldLabels.map((field) => (
                      <Badge key={field} variant="secondary">
                        {field}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <PreviewList
                      title="Hidden sensitive fields"
                      values={preview.hiddenSensitiveFields}
                    />
                    <PreviewList
                      title="Filters"
                      values={
                        preview.filterSummary.length
                          ? preview.filterSummary
                          : ["No extra filters"]
                      }
                    />
                    <PreviewList
                      title="Allowed actions"
                      values={preview.actionLabels}
                    />
                    <PreviewList
                      title="Warnings"
                      values={
                        preview.warnings.length
                          ? preview.warnings
                          : ["No packet warnings"]
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedProfile.type === "pcsMove" && householdId && moveId ? (
                    <>
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={buildPcsPacketPath({
                            householdId,
                            moveId,
                          })}
                        >
                          PCS packet
                        </Link>
                      </Button>
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={buildPcsPacketPath({
                            householdId,
                            moveId,
                            mode: "owner",
                          })}
                        >
                          PCS owner
                        </Link>
                      </Button>
                    </>
                  ) : null}
                  {(selectedProfile.type === "movingCompany" ||
                    selectedProfile.type === "loadCrew") &&
                  householdId &&
                  moveId ? (
                    <>
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={buildMoverPacketPath({
                            householdId,
                            moveId,
                            mode:
                              selectedProfile.type === "loadCrew"
                                ? "loadCrew"
                                : "movingCompany",
                          })}
                        >
                          Mover packet
                        </Link>
                      </Button>
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={buildMoverPacketPath({
                            householdId,
                            moveId,
                            mode: "owner",
                          })}
                        >
                          Mover owner
                        </Link>
                      </Button>
                    </>
                  ) : null}
                  {selectedProfile.type === "employerRelocation" &&
                  householdId &&
                  moveId ? (
                    <>
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={buildEmployerPacketPath({
                            householdId,
                            moveId,
                          })}
                        >
                          Employer packet
                        </Link>
                      </Button>
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={buildEmployerPacketPath({
                            householdId,
                            moveId,
                            mode: "owner",
                          })}
                        >
                          Employer owner
                        </Link>
                      </Button>
                    </>
                  ) : null}
                  {selectedProfile.type === "insuranceClaim" &&
                  householdId &&
                  moveId ? (
                    <>
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={buildClaimPacketPath({
                            householdId,
                            moveId,
                          })}
                        >
                          Claim packet
                        </Link>
                      </Button>
                      <Button asChild type="button" variant="outline">
                        <Link
                          href={buildClaimPacketPath({
                            householdId,
                            moveId,
                            mode: "owner",
                          })}
                        >
                          Claim owner
                        </Link>
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    disabled={busy === "save" || !effectiveFields.length}
                    onClick={() => void handleSaveProfile()}
                  >
                    Save profile
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy === `archive-${selectedProfile._id}`}
                    onClick={() => void handleArchiveProfile(selectedProfile._id)}
                  >
                    Archive
                  </Button>
                </div>

                <div className="rounded-md border border-border p-3">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <Link2 className="size-4 text-primary" aria-hidden="true" />
                    Scoped share link
                  </h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-[160px_160px_minmax(0,1fr)]">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={linkRole}
                      onChange={(event) =>
                        setLinkRole(event.target.value as ShareLinkRole)
                      }
                    >
                      {shareLinkRoleOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={expiresInDays}
                      onChange={(event) => setExpiresInDays(event.target.value)}
                      inputMode="numeric"
                      aria-label="Share link expiration in days"
                    />
                    <Button
                      type="button"
                      disabled={busy === "link" || !effectiveActions.length}
                      onClick={() => void handleCreateShareLink()}
                    >
                      Create link token
                    </Button>
                  </div>
                  {createdToken ? (
                    <p className="mt-3 break-all rounded-md bg-muted p-3 font-mono text-xs">
                      {createdToken}
                    </p>
                  ) : null}
                </div>

                {activeLinks.length ? (
                  <div className="rounded-md border border-border p-3">
                    <h3 className="text-sm font-medium">Active links</h3>
                    <div className="mt-3 space-y-2">
                      {activeLinks.map((link) => (
                        <div
                          key={link._id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-2 text-sm"
                        >
                          <span>
                            {link.label ?? "Share link"} - {link.role} -{" "}
                            {link.tokenPreview}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy === `revoke-${link._id}`}
                            onClick={() => void handleRevokeShareLink(link._id)}
                          >
                            Revoke
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Create the first packet profile for this move.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
    </div>
  );
}

function OptionGroup<TValue extends string>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: readonly (readonly [TValue, string])[];
  selected: TValue[];
  onToggle: (value: TValue) => void;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function PreviewList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function toggleValue<TValue extends string>(values: TValue[], value: TValue) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}
