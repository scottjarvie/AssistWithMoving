"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  AlertCircle,
  Bot,
  Camera,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Home,
  KeyRound,
  Package,
  RefreshCw,
  RotateCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  apiKeyRestrictionLabel,
  apiKeyScopeOptions,
  apiKeyStatusLabel,
  formatApiKeyDate,
  type ApiKeyScope,
} from "@/lib/api-keys";

type HouseholdEntry = {
  household: {
    _id: Id<"households">;
    name: string;
  };
  role: string;
  apiAccessStatus: "enabled" | "disabled";
  canCreateApiKeys: boolean;
};

type HouseholdStats = {
  moves: MoveSummary[];
  moveCount: number;
  archivedMoveCount: number;
  itemCount: number;
  boxCount: number;
  activeApiKeyCount: number;
  apiCapableMemberCount: number;
  activeMemberCount: number;
  pendingInvitationCount: number;
};

type ApiKeySummary = {
  apiKeyId: Id<"apiKeys">;
  name: string;
  moveId?: Id<"moves">;
  tokenPreview: string;
  scopes: ApiKeyScope[];
  status: "active" | "revoked";
  expiresAt?: number;
  revokedAt?: number;
  lastUsedAt?: number;
  lastUsedAction?: string;
  createdByName?: string | null;
  createdByEmail?: string | null;
  creatorApiAccessStatus?: "enabled" | "disabled";
  createdAt: number;
};

type MoveSummary = {
  moveId: Id<"moves">;
  title: string;
  status: string;
};

type HelperPreset = {
  id: string;
  title: string;
  description: string;
  plainLanguage: string;
  name: string;
  scopes: ApiKeyScope[];
  recommended?: boolean;
};

type VerifyKeyResult =
  | {
      ok: true;
      message: string;
      scopes: string[];
      moveRestricted: boolean;
      householdName?: string;
    }
  | {
      ok: false;
      message: string;
    };

const fullTrustedAccessScopes: ApiKeyScope[] = [
  "moves/read",
  "moves/write",
  "inventory/read",
  "inventory/write",
  "plans/read",
  "plans/write",
  "photos/write",
  "exports/read",
  "exports/create",
  "members/manage",
];

const readOnlyScopes: ApiKeyScope[] = [
  "moves/read",
  "inventory/read",
  "exports/read",
];

const addItemsOnlyScopes: ApiKeyScope[] = [
  "moves/read",
  "inventory/read",
  "inventory/write",
  "photos/write",
];

const setupMoveAndMembersScopes: ApiKeyScope[] = [
  "moves/read",
  "moves/write",
  "members/manage",
];

const memberManagerScopes: ApiKeyScope[] = ["moves/read", "members/manage"];

const helperPresets: HelperPreset[] = [
  {
    id: "full",
    title: "Full trusted helper",
    description:
      "Best when your assistant is actively helping set up the household, move, inventory, photos, exports, and collaborators.",
    plainLanguage:
      "Can read and change most move records, upload photos, create exports, and invite collaborators.",
    name: "Full trusted AI helper key",
    scopes: fullTrustedAccessScopes,
    recommended: true,
  },
  {
    id: "items",
    title: "Add items and photos",
    description:
      "Good for a phone-based inventory session where the assistant adds furniture, rooms, photos, and notes.",
    plainLanguage:
      "Can add and update inventory and photo evidence, but cannot create moves or invite household members.",
    name: "Add items and photos key",
    scopes: addItemsOnlyScopes,
  },
  {
    id: "setup",
    title: "Set up move and members",
    description:
      "Lets an assistant create move structure and invite household collaborators without changing inventory.",
    plainLanguage:
      "Can set up move-level structure and household access, but cannot edit inventory.",
    name: "Set up move and members key",
    scopes: setupMoveAndMembersScopes,
  },
  {
    id: "readonly",
    title: "Look but do not change",
    description:
      "Use this when an assistant only needs to summarize, plan, or explain what is already in the move.",
    plainLanguage:
      "Can read move context and exports, but cannot write records or upload photos.",
    name: "Read-only assistant key",
    scopes: readOnlyScopes,
  },
  {
    id: "members",
    title: "Invite collaborators",
    description:
      "A narrow key for adding people to the household when that is the only job.",
    plainLanguage:
      "Can invite household account members; this is different from adding mover/contact records.",
    name: "Member manager key",
    scopes: memberManagerScopes,
  },
];

const aiConnectionTasks = [
  {
    value: "create",
    label: "Create key",
    description:
      "Choose the household, where the assistant can work, and what it can do.",
  },
  {
    value: "connections",
    label: "Connections",
    description:
      "Review active assistant keys, rotate secrets, and revoke old access without creating another key.",
  },
  {
    value: "overview",
    label: "Overview",
    description:
      "Check household, move, item, member, and AI connection counts before changing access.",
  },
  {
    value: "advanced",
    label: "Advanced",
    description:
      "Tune key name, expiration, move restriction, and exact API scopes when presets are not enough.",
  },
] as const;

function sameScopes(left: ApiKeyScope[], right: ApiKeyScope[]) {
  return (
    left.length === right.length &&
    left.every((scope) => right.includes(scope))
  );
}

function formatStat(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function summarizeScopes(scopes: ApiKeyScope[]) {
  if (sameScopes(scopes, fullTrustedAccessScopes)) return "Full trusted access";
  if (sameScopes(scopes, addItemsOnlyScopes)) return "Add items and photos";
  if (sameScopes(scopes, setupMoveAndMembersScopes)) return "Set up move";
  if (sameScopes(scopes, readOnlyScopes)) return "Read only";
  if (sameScopes(scopes, memberManagerScopes)) return "Member invites";
  return `${scopes.length} custom permissions`;
}

export function ApiKeyManager({
  enabled = true,
  mode = "settings",
}: {
  enabled?: boolean;
  mode?: "settings" | "setup";
}) {
  const setupMode = mode === "setup";
  const households = useQuery(api.households.listMine, enabled ? {} : "skip") as
    | HouseholdEntry[]
    | undefined;
  const [selectedHouseholdId, setSelectedHouseholdId] =
    useState<Id<"households"> | null>(null);
  const effectiveHouseholdId =
    selectedHouseholdId ?? households?.[0]?.household._id ?? null;
  const queryHouseholdId = enabled ? effectiveHouseholdId : null;
  const stats = useQuery(
    api.households.summaryStats,
    queryHouseholdId ? { householdId: queryHouseholdId } : "skip",
  ) as HouseholdStats | undefined;
  const createKey = useMutation(api.apiKeys.create);
  const revokeKey = useMutation(api.apiKeys.revoke);
  const rotateKey = useMutation(api.apiKeys.rotate);

  const [name, setName] = useState("Full trusted AI helper key");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [selectedMoveRestrictionId, setSelectedMoveRestrictionId] = useState<
    Id<"moves"> | "all"
  >("all");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(fullTrustedAccessScopes);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifyKeyValue, setVerifyKeyValue] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyKeyResult | null>(null);
  const [activeConnectionTask, setActiveConnectionTask] = useState<
    (typeof aiConnectionTasks)[number]["value"]
  >("create");
  const verifyInputRef = useRef<HTMLInputElement | null>(null);
  const secretRef = useRef<HTMLDivElement | null>(null);

  const selectedHouseholdEntry = useMemo(
    () =>
      households?.find(
        (entry) => entry.household._id === effectiveHouseholdId,
      ),
    [households, effectiveHouseholdId],
  );
  const selectedHousehold = selectedHouseholdEntry?.household;
  const canCreateKeysForHousehold =
    selectedHouseholdEntry?.canCreateApiKeys ?? false;
  const keys = useQuery(
    api.apiKeys.listForHousehold,
    queryHouseholdId && canCreateKeysForHousehold
      ? { householdId: queryHouseholdId }
      : "skip",
  ) as ApiKeySummary[] | undefined;
  const activeMoves = useMemo(
    () => stats?.moves ?? [],
    [stats],
  );
  const moveTitleById = useMemo(
    () => new Map(activeMoves.map((move) => [move.moveId, move.title])),
    [activeMoves],
  );
  const moveRestrictionId =
    selectedMoveRestrictionId !== "all" &&
    activeMoves.some((move) => move.moveId === selectedMoveRestrictionId)
      ? selectedMoveRestrictionId
      : "all";
  const selectedPresetId =
    helperPresets.find((preset) => sameScopes(scopes, preset.scopes))?.id ??
    "custom";
  const selectedPreset =
    helperPresets.find((preset) => preset.id === selectedPresetId) ?? null;
  const activeKeys = keys?.filter((key) => key.status === "active") ?? [];
  const revokedKeys = keys?.filter((key) => key.status !== "active") ?? [];
  const lastUsedKey = activeKeys
    .filter((key) => typeof key.lastUsedAt === "number")
    .sort((left, right) => (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0))[0];
  const canUploadPhotos = scopes.includes("photos/write");
  const canCreateInventory = scopes.includes("inventory/write");
  const agentPhotoReady = canUploadPhotos && canCreateInventory;
  const agentHandoffText = [
    `Use this MovingManifest key for ${selectedHousehold?.name ?? "the selected household"} with ${summarizeScopes(scopes).toLowerCase()}.`,
    agentPhotoReady
      ? "For one household item from one photo plus a few words, prefer MCP add_item_from_photo."
      : canUploadPhotos
        ? "For ordinary image uploads, use MCP upload_photo or upload_photos, or POST /api/v1/images/upload."
        : "This key cannot upload photos; ask the user for an Add items and photos or Full trusted helper key before uploading images.",
    canUploadPhotos
      ? "Send original JPEG, PNG, or WebP files only; MovingManifest stores the original and creates web-ready versions server-side."
      : "",
    agentPhotoReady
      ? "If quantity is omitted, default to 1; leave unknown weight, size, disposition, and condition blank; return the agentReview assumptions for the user to correct."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!oneTimeSecret) return;
    window.setTimeout(() => {
      if (typeof secretRef.current?.scrollIntoView !== "function") return;
      secretRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }, 0);
  }, [oneTimeSecret]);

  async function handleCreateKey() {
    if (!effectiveHouseholdId || !canCreateKeysForHousehold) {
      setMessage("API access is disabled for your membership in this household.");
      return;
    }
    setBusy("create");
    setMessage(null);
    setOneTimeSecret(null);
    try {
      const days = Number(expiresInDays);
      const expiresAt =
        Number.isFinite(days) && days > 0
          ? Date.now() + Math.min(days, 3660) * 24 * 60 * 60 * 1000
          : undefined;
      const result = await createKey({
        householdId: effectiveHouseholdId,
        moveId: moveRestrictionId === "all" ? undefined : moveRestrictionId,
        name,
        scopes,
        expiresAt,
      });
      setShowSecret(false);
      setOneTimeSecret(result.rawKey);
      try {
        await navigator.clipboard.writeText(result.rawKey);
        setMessage(
          "AI connection created and copied. Paste the key into your trusted assistant now.",
        );
      } catch {
        setMessage(
          "AI connection created. Use the green Copy key button below to copy the one-time secret.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create API key.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRevokeKey(apiKeyId: Id<"apiKeys">) {
    if (!effectiveHouseholdId) return;
    setBusy(`revoke-${apiKeyId}`);
    setMessage(null);
    try {
      await revokeKey({ householdId: effectiveHouseholdId, apiKeyId });
      setMessage("AI connection revoked.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not revoke API key.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRotateKey(apiKeyId: Id<"apiKeys">) {
    if (!effectiveHouseholdId) return;
    setBusy(`rotate-${apiKeyId}`);
    setMessage(null);
    setOneTimeSecret(null);
    try {
      const result = await rotateKey({
        householdId: effectiveHouseholdId,
        apiKeyId,
      });
      setShowSecret(false);
      setOneTimeSecret(result.rawKey);
      setMessage("AI connection rotated. The previous key was revoked.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not rotate API key.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleCopySecret() {
    if (!oneTimeSecret) return;
    try {
      await navigator.clipboard.writeText(oneTimeSecret);
      setMessage("AI connection key copied.");
    } catch {
      setMessage("Browser copy was blocked. Select and copy the key manually.");
    }
  }

  async function handleCopyAgentHandoff() {
    try {
      await navigator.clipboard.writeText(agentHandoffText);
      setMessage("Assistant instructions copied.");
    } catch {
      setMessage("Browser copy was blocked. Select and copy the instructions.");
    }
  }

  async function handleVerifyKey() {
    const rawKey = verifyKeyValue.trim();
    setVerifyResult(null);
    if (!rawKey) {
      setVerifyResult({
        ok: false,
        message: "Paste the key you copied before testing it.",
      });
      return;
    }
    setBusy("verify-key");
    try {
      const response = await fetch("/api/v1/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${rawKey}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setVerifyResult({
          ok: false,
          message:
            payload?.error?.message ??
            "This key did not verify. It may be expired, revoked, mistyped, or missing required access.",
        });
        return;
      }
      const data = payload?.data ?? {};
      setVerifyResult({
        ok: true,
        message: "Key verified. Your assistant can connect with this secret.",
        scopes: Array.isArray(data.apiKey?.scopes) ? data.apiKey.scopes : [],
        moveRestricted: Boolean(data.apiKey?.moveRestricted),
        householdName: data.household?.name,
      });
      setVerifyKeyValue("");
    } catch {
      setVerifyResult({
        ok: false,
        message:
          "Could not reach the verification endpoint from this browser. Try again before pasting the key into an assistant.",
      });
    } finally {
      setBusy(null);
    }
  }

  function startVerifyPrompt(keyName?: string) {
    setActiveConnectionTask("connections");
    setVerifyResult({
      ok: false,
      message: keyName
        ? `Paste the current secret for "${keyName}" below. Existing rows only store previews, so MovingManifest cannot test that secret without you pasting it.`
        : "Paste the key you copied below to test it.",
    });
    window.setTimeout(() => verifyInputRef.current?.focus(), 0);
  }

  function toggleScope(scope: ApiKeyScope) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope],
    );
  }

  function applyPreset(preset: HelperPreset) {
    setName(preset.name);
    setScopes(preset.scopes);
    setMessage(null);
  }

  function renderConnections() {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Current AI connections</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Active keys are tools or assistants that can still access this
              household.
            </p>
          </div>
          <Badge variant="outline">{activeKeys.length} active</Badge>
        </div>

        {!canCreateKeysForHousehold && effectiveHouseholdId ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">
              API access is disabled for your membership.
            </span>{" "}
            You can still use the MovingManifest app normally, but an owner or
            admin must enable API access before you can create, rotate, or
            inspect assistant keys for this household.
          </div>
        ) : keys === undefined && effectiveHouseholdId ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-5/6" />
          </div>
        ) : activeKeys.length ? (
          <div className="grid gap-3">
            {activeKeys.map((key) => (
              <ConnectionRow
                key={key.apiKeyId}
                apiKey={key}
                moveTitleById={moveTitleById}
                busy={busy}
                onRotate={handleRotateKey}
                onRevoke={handleRevokeKey}
                onTest={startVerifyPrompt}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No active AI connections yet.
          </p>
        )}

        {revokedKeys.length ? (
          <details className="rounded-md border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Show revoked and old keys ({revokedKeys.length})
            </summary>
            <div className="mt-3 grid gap-3">
              {revokedKeys.map((key) => (
                <ConnectionRow
                  key={key.apiKeyId}
                  apiKey={key}
                  moveTitleById={moveTitleById}
                  busy={busy}
                  onRotate={handleRotateKey}
                  onRevoke={handleRevokeKey}
                  onTest={startVerifyPrompt}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    );
  }

  function renderVerifyKey() {
    return (
      <section
        aria-label="Test copied API key"
        className="rounded-md border border-border bg-muted/20 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              Test a key before leaving
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Paste the one-time secret you just copied. The browser calls GET
              /me directly and this form does not save the key.
            </p>
          </div>
          <Badge variant="outline">no storage</Badge>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            ref={verifyInputRef}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={verifyKeyValue}
            onChange={(event) => {
              setVerifyKeyValue(event.target.value);
              setVerifyResult(null);
            }}
            placeholder="Paste mmk_... key to verify"
            aria-label="API key to verify"
          />
          <Button
            type="button"
            onClick={() => void handleVerifyKey()}
            disabled={busy === "verify-key"}
          >
            {busy === "verify-key" ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
            Test key
          </Button>
        </div>
        {verifyResult ? (
          <div
            className={`mt-3 rounded-md border p-3 text-sm leading-6 ${
              verifyResult.ok
                ? "border-emerald-700/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                : "border-destructive/30 bg-destructive/10 text-foreground"
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              {verifyResult.ok ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
              )}
              <div>
                <p className="font-medium">{verifyResult.message}</p>
                {verifyResult.ok ? (
                  <p className="mt-1 text-xs">
                    {verifyResult.householdName
                      ? `${verifyResult.householdName} · `
                      : ""}
                    {verifyResult.moveRestricted
                      ? "Restricted to one move"
                      : "Household-wide key"}{" "}
                    · {verifyResult.scopes.join(", ") || "No scopes returned"}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  function renderOneTimeSecret() {
    if (!oneTimeSecret) return null;
    const displayedSecret = showSecret
      ? oneTimeSecret
      : "Hidden for screenshots. Use Copy key, or Show key if manual copy is needed.";

    return (
      <div
        ref={secretRef}
        className="rounded-md border border-emerald-700/30 bg-emerald-500/10 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">One-time key</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Copy it now. Paste it only into the assistant or connector you
              trust, then revoke it when that assistant no longer needs access.
              MovingManifest will not show this exact key again.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowSecret((current) => !current)}
            >
              {showSecret ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
              {showSecret ? "Hide key" : "Show key"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:border-emerald-700 focus-visible:ring-emerald-600/30"
              onClick={() => void handleCopySecret()}
            >
              <Copy aria-hidden="true" />
              Copy key
            </Button>
          </div>
        </div>
        <Textarea
          className="mt-3 min-h-20 font-mono text-xs"
          readOnly
          value={displayedSecret}
          aria-label="One-time API key secret"
        />
        <details className="mt-3 rounded-md border border-border bg-background/60 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Optional: copy assistant instructions
          </summary>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              These are not another key. They are short instructions for image
              uploads so the assistant sends originals and lets MovingManifest
              create display versions.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleCopyAgentHandoff()}
            >
              <Copy aria-hidden="true" />
              Copy instructions
            </Button>
          </div>
          <p className="mt-3 rounded-md border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
            {agentHandoffText}
          </p>
        </details>
      </div>
    );
  }

  function renderAssistantInstructions() {
    return (
      <details className="rounded-md border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Optional assistant instructions for images
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <p className="text-sm leading-6 text-muted-foreground">
              This is not a separate key. It is optional text to paste after the
              key if the assistant will upload photos.
            </p>
            <p className="mt-3 rounded-md border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
              {agentHandoffText}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => void handleCopyAgentHandoff()}
            >
              <Copy aria-hidden="true" />
              Copy instructions
            </Button>
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Camera className="size-4 text-primary" aria-hidden="true" />
              Best image path
            </p>
            <p className="mt-2 leading-5">
              {agentPhotoReady
                ? "add_item_from_photo, upload_photo, upload_photos"
                : canUploadPhotos
                  ? "upload_photo, upload_photos, /images/upload"
                  : "Choose a photo-capable access preset first"}
            </p>
            <p className="mt-3 font-medium text-foreground">Selected access</p>
            <p className="mt-1 leading-5">{summarizeScopes(scopes)}</p>
          </div>
        </div>
      </details>
    );
  }

  function renderOverview() {
    return (
      <section aria-label="AI connection overview" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            icon={Home}
            label="Households"
            value={formatStat(households?.length)}
            note={
              selectedHousehold
                ? `Viewing ${selectedHousehold.name}`
                : "Choose one below"
            }
          />
          <StatusTile
            icon={Truck}
            label="Moves"
            value={formatStat(stats?.moveCount ?? activeMoves.length)}
            note={
              stats?.archivedMoveCount
                ? `${stats.archivedMoveCount} archived`
                : "Active move workspaces"
            }
          />
          <StatusTile
            icon={Package}
            label="Items"
            value={formatStat(stats?.itemCount)}
            note={
              stats
                ? `${formatStat(stats.boxCount)} boxes tracked`
                : "Inventory count"
            }
          />
          <StatusTile
            icon={Activity}
            label="AI connections"
            value={formatStat(stats?.activeApiKeyCount ?? activeKeys.length)}
            note={
              lastUsedKey
                ? `Last used ${formatApiKeyDate(lastUsedKey.lastUsedAt)}`
                : "No recent usage yet"
            }
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
          <div className="rounded-md border border-border p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 size-5 text-primary"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-medium">
                  Simple setup for an AI assistant
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Pick a job, choose the household or move, create the key,
                  then copy the one-time secret into Claude, ChatGPT, Codex, or
                  another assistant you trust.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  People
                </p>
                <p className="mt-1 text-sm">
                  {formatStat(stats?.activeMemberCount)} active
                  {stats?.pendingInvitationCount
                    ? `, ${stats.pendingInvitationCount} invited`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatStat(stats?.apiCapableMemberCount)} API-capable
                </p>
              </div>
              <Users className="size-5 text-primary" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderCreateConnection() {
    return (
      <section aria-label="Create an AI connection" className="space-y-4">
        {!setupMode ? (
          <div>
            <h3 className="text-base font-semibold">
              Create a new AI connection
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Most people only need the recommended option. Use Advanced if you
              already know exactly which API scopes you want.
            </p>
          </div>
        ) : null}

        {setupMode ? (
          <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-medium">
                  Hosted assistant? Try OAuth first.
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  On mobile, claude.ai, or another hosted MCP client, paste the
                  MCP endpoint and sign in instead of handling a raw key. Create
                  a key below when the assistant cannot use OAuth yet.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/mcp">Open MCP setup</Link>
                  </Button>
                  <code className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs">
                    https://movingmanifest.com/api/mcp
                  </code>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!canCreateKeysForHousehold && selectedHousehold ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">
              API access is disabled for this household membership.
            </span>{" "}
            You can keep using the app, but this account cannot create or
            manage assistant keys until an owner or admin enables API access.
          </div>
        ) : null}

        {!setupMode ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {helperPresets.map((preset) => {
              const selected = preset.id === selectedPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => applyPreset(preset)}
                  className={`min-h-[156px] rounded-md border p-4 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{preset.title}</span>
                    {selected ? (
                      <CheckCircle2
                        className="size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    ) : preset.recommended ? (
                      <Badge variant="secondary">default</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-5 text-muted-foreground">
                    {preset.description}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {preset.plainLanguage}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}

        <div
          className={
            setupMode ? "grid gap-3 lg:grid-cols-3" : "grid gap-3 lg:grid-cols-2"
          }
        >
          <div className="space-y-2">
            <label htmlFor="api-key-household" className="text-sm font-medium">
              Household
            </label>
            <select
              id="api-key-household"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={effectiveHouseholdId ?? ""}
              onChange={(event) => {
                setSelectedHouseholdId(event.target.value as Id<"households">);
                setSelectedMoveRestrictionId("all");
              }}
            >
              {households?.map((entry) => (
                <option key={entry.household._id} value={entry.household._id}>
                  {entry.household.name} ({entry.role})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="api-key-move" className="text-sm font-medium">
              Where can it work?
            </label>
            <select
              id="api-key-move"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={moveRestrictionId}
              onChange={(event) =>
                setSelectedMoveRestrictionId(
                  event.target.value as Id<"moves"> | "all",
                )
              }
              disabled={!effectiveHouseholdId || stats === undefined}
            >
              <option value="all">All moves in this household</option>
              {activeMoves.map((move) => (
                <option key={move.moveId} value={move.moveId}>
                  {move.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {moveRestrictionId === "all"
                ? "Good for trusted setup work across the household."
                : apiKeyRestrictionLabel(
                    moveRestrictionId,
                    moveTitleById.get(moveRestrictionId),
                  )}
            </p>
            {activeMoves.length ? (
              <p className="text-xs text-muted-foreground">
                Safest setup: restrict this key to the move the assistant is
                working on, unless it needs to create or find moves.
              </p>
            ) : null}
          </div>

          {setupMode ? (
            <div className="space-y-2">
              <label htmlFor="api-key-preset" className="text-sm font-medium">
                What can it do?
              </label>
              <select
                id="api-key-preset"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedPresetId}
                onChange={(event) => {
                  const preset = helperPresets.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (preset) applyPreset(preset);
                }}
              >
                {selectedPresetId === "custom" ? (
                  <option value="custom">Custom permissions</option>
                ) : null}
                {helperPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.title}
                    {preset.recommended ? " (recommended)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-muted-foreground">
                {selectedPreset?.plainLanguage ??
                  `${scopes.length} custom permissions selected.`}
              </p>
              <details>
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  See exact permissions
                </summary>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {scopes.join(", ")}
                </p>
              </details>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/25 bg-primary/5 p-4">
          <Button
            type="button"
            disabled={
              !effectiveHouseholdId ||
              !canCreateKeysForHousehold ||
              busy === "create" ||
              !scopes.length
            }
            onClick={() => void handleCreateKey()}
          >
            {busy === "create" ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound aria-hidden="true" />
            )}
            Create key
          </Button>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            This creates one secret. Only paste it into an assistant or tool you
            trust, because it can do the job you selected above.
          </p>
        </div>

        {renderOneTimeSecret()}

        {scopes.includes("members/manage") ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">Member access:</span>{" "}
            members/manage lets an agent invite people to your household
            account. That is different from move contacts, and most helpers do
            not need it.
          </div>
        ) : null}
      </section>
    );
  }

  function renderAdvancedApiSettings() {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Settings2 className="size-4 text-primary" aria-hidden="true" />
              Advanced API settings
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Technical controls for naming, expiration, and exact MCP/API
              scopes.
            </p>
          </div>
          <Badge variant="outline">{summarizeScopes(scopes)}</Badge>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
          <div className="space-y-2">
            <label htmlFor="api-key-name" className="text-sm font-medium">
              Key name
            </label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Key name"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="api-key-expiration" className="text-sm font-medium">
              Expires in days
            </label>
            <Input
              id="api-key-expiration"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              inputMode="numeric"
              placeholder="90"
            />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Exact permissions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            These are the technical scopes used by API and MCP clients.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {apiKeyScopeOptions.map(([scope, label]) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/ai/kit">Agent kit</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/ai">AI guide</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/api">API docs</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/mcp">MCP docs</Link>
          </Button>
        </div>

        {renderAssistantInstructions()}
      </div>
    );
  }

  return (
    <Card id="api-keys">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              {setupMode ? "Create an AI connection" : "AI connections"}
            </CardTitle>
            <CardDescription className="mt-2 max-w-3xl leading-6">
              {setupMode
                ? "You are signed in. Create one key, copy it, and paste it into the AI assistant you trust."
                : "Give a trusted assistant a key so it can help with your household, moves, inventory, photos, and collaborators. You can revoke access any time."}
            </CardDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/ai/kit">Agent kit</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/api">API docs</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/mcp">MCP setup</Link>
              </Button>
            </div>
          </div>
          <Badge variant="outline">
            {setupMode ? "signed-in setup" : "API keys for assistants"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!enabled || households === undefined ? (
          <div
            className={
              setupMode ? "space-y-3" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            }
          >
            <Skeleton className={setupMode ? "h-16 w-full" : "h-24 w-full"} />
            <Skeleton className={setupMode ? "h-28 w-full" : "h-24 w-full"} />
            {!setupMode ? (
              <>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : null}
          </div>
        ) : households.length ? (
          <>
            {setupMode ? (
              <>
                {renderCreateConnection()}
                <details className="rounded-md border border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Advanced access and API settings
                  </summary>
                  <div className="mt-4">{renderAdvancedApiSettings()}</div>
                </details>
                <details className="rounded-md border border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Manage existing AI connections
                  </summary>
                  <div className="mt-4">{renderConnections()}</div>
                </details>
                <details className="rounded-md border border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Test a copied key
                  </summary>
                  <div className="mt-4">{renderVerifyKey()}</div>
                </details>
              </>
            ) : (
              <Tabs
                value={activeConnectionTask}
                onValueChange={(value) =>
                  setActiveConnectionTask(
                    value as (typeof aiConnectionTasks)[number]["value"],
                  )
                }
                className="gap-4"
              >
                <MoveWorkspaceTabList
                  tabs={[...aiConnectionTasks]}
                  activeValue={activeConnectionTask}
                  ariaLabel="AI connection tasks"
                />

                <TabsContent value="create">
                  {renderCreateConnection()}
                </TabsContent>
                <TabsContent value="connections">
                  <section aria-label="Manage existing AI connections">
                    {renderConnections()}
                  </section>
                </TabsContent>
                <TabsContent value="overview">{renderOverview()}</TabsContent>
                <TabsContent value="advanced">
                  {renderAdvancedApiSettings()}
                </TabsContent>
              </Tabs>
            )}

            {!setupMode && activeConnectionTask !== "create"
              ? renderOneTimeSecret()
              : null}

            {!setupMode ? renderVerifyKey() : null}

            {message ? (
              <p
                className="rounded-md border border-border p-3 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {message}
              </p>
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-border p-4">
            <h3 className="text-sm font-medium">
              Create a household before adding AI connections.
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              AI keys belong to a household so MovingManifest knows which move,
              rooms, photos, and collaborators the assistant can work with.
            </p>
            <Button asChild className="mt-3" variant="outline">
              <Link href="/app/dashboard#household-setup">
                Create household
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Home;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-normal">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={note}>
        {note}
      </p>
    </div>
  );
}

function ConnectionRow({
  apiKey,
  moveTitleById,
  busy,
  onRotate,
  onRevoke,
  onTest,
}: {
  apiKey: ApiKeySummary;
  moveTitleById: Map<Id<"moves">, string>;
  busy: string | null;
  onRotate: (apiKeyId: Id<"apiKeys">) => Promise<void>;
  onRevoke: (apiKeyId: Id<"apiKeys">) => Promise<void>;
  onTest: (keyName?: string) => void;
}) {
  const active = apiKey.status === "active";
  const creatorApiDisabled = apiKey.creatorApiAccessStatus === "disabled";
  const creatorLabel =
    apiKey.createdByName ?? apiKey.createdByEmail ?? "Unknown member";
  return (
    <div
      role="group"
      aria-label={`AI connection ${apiKey.name}`}
      className="rounded-md border border-border p-4 text-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{apiKey.name}</p>
            <Badge variant={active ? "secondary" : "outline"}>
              {apiKeyStatusLabel(apiKey.status)}
            </Badge>
            <Badge variant={apiKey.moveId ? "secondary" : "outline"}>
              {apiKeyRestrictionLabel(
                apiKey.moveId,
                apiKey.moveId ? moveTitleById.get(apiKey.moveId) : undefined,
              )}
            </Badge>
            {creatorApiDisabled ? (
              <Badge variant="secondary">Creator API off</Badge>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {apiKey.tokenPreview}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {summarizeScopes(apiKey.scopes)} · Expires{" "}
            {formatApiKeyDate(apiKey.expiresAt)} · Last used{" "}
            {formatApiKeyDate(apiKey.lastUsedAt)}
            {apiKey.lastUsedAction ? ` for ${apiKey.lastUsedAction}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Created by {creatorLabel}
            {creatorApiDisabled
              ? "; this key is blocked until that member's API access is enabled or the key is rotated by another admin."
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!active || creatorApiDisabled}
            onClick={() => onTest(apiKey.name)}
          >
            <ShieldCheck aria-hidden="true" />
            Test copied key
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!active || busy === `rotate-${apiKey.apiKeyId}`}
            onClick={() => void onRotate(apiKey.apiKeyId)}
          >
            {busy === `rotate-${apiKey.apiKeyId}` ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw aria-hidden="true" />
            )}
            Rotate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!active || busy === `revoke-${apiKey.apiKeyId}`}
            onClick={() => void onRevoke(apiKey.apiKeyId)}
          >
            {busy === `revoke-${apiKey.apiKeyId}` ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
            Revoke
          </Button>
        </div>
      </div>
    </div>
  );
}
