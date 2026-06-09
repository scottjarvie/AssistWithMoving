"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, KeyRound, RefreshCw, RotateCw, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  apiKeyScopeOptions,
  apiKeyRestrictionLabel,
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
  createdAt: number;
};

type MoveSummary = {
  _id: Id<"moves">;
  title: string;
  status: string;
};

const defaultScopes: ApiKeyScope[] = [
  "moves/read",
  "inventory/read",
  "exports/read",
];

export function ApiKeyManager({ enabled = true }: { enabled?: boolean }) {
  const households = useQuery(api.households.listMine, enabled ? {} : "skip") as
    | HouseholdEntry[]
    | undefined;
  const [selectedHouseholdId, setSelectedHouseholdId] =
    useState<Id<"households"> | null>(null);
  const effectiveHouseholdId =
    selectedHouseholdId ?? households?.[0]?.household._id ?? null;
  const moves = useQuery(
    api.moves.listForHousehold,
    effectiveHouseholdId
      ? { householdId: effectiveHouseholdId, includeArchived: true }
      : "skip"
  ) as MoveSummary[] | undefined;
  const keys = useQuery(
    api.apiKeys.listForHousehold,
    effectiveHouseholdId ? { householdId: effectiveHouseholdId } : "skip"
  ) as ApiKeySummary[] | undefined;
  const createKey = useMutation(api.apiKeys.create);
  const revokeKey = useMutation(api.apiKeys.revoke);
  const rotateKey = useMutation(api.apiKeys.rotate);

  const [name, setName] = useState("Local agent key");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [selectedMoveRestrictionId, setSelectedMoveRestrictionId] = useState<
    Id<"moves"> | "all"
  >("all");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(defaultScopes);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const selectedHousehold = useMemo(
    () =>
      households?.find(
        (entry) => entry.household._id === effectiveHouseholdId
      )?.household,
    [households, effectiveHouseholdId]
  );
  const activeMoves = useMemo(
    () => moves?.filter((move) => move.status !== "archived") ?? [],
    [moves]
  );
  const moveTitleById = useMemo(
    () => new Map(moves?.map((move) => [move._id, move.title]) ?? []),
    [moves]
  );
  const moveRestrictionId =
    selectedMoveRestrictionId !== "all" &&
    activeMoves.some((move) => move._id === selectedMoveRestrictionId)
      ? selectedMoveRestrictionId
      : "all";

  async function handleCreateKey() {
    if (!effectiveHouseholdId) return;
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
      setOneTimeSecret(result.rawKey);
      setMessage("API key created. Store the secret now; it will not be shown again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create API key.");
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
      setMessage("API key revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke API key.");
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
      const result = await rotateKey({ householdId: effectiveHouseholdId, apiKeyId });
      setOneTimeSecret(result.rawKey);
      setMessage("API key rotated. The previous key was revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not rotate API key.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopySecret() {
    if (!oneTimeSecret) return;
    await navigator.clipboard.writeText(oneTimeSecret);
    setMessage("API key secret copied.");
  }

  function toggleScope(scope: ApiKeyScope) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope]
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          API and MCP keys
        </CardTitle>
        <CardDescription>
          Create hashed, scoped, revocable keys for API clients and local agents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!enabled || households === undefined ? (
          <Skeleton className="h-10 w-full" />
        ) : households.length ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={effectiveHouseholdId ?? ""}
              onChange={(event) => {
                setSelectedHouseholdId(event.target.value as Id<"households">);
                setSelectedMoveRestrictionId("all");
              }}
              aria-label="Household for API keys"
            >
              {households.map((entry) => (
                <option key={entry.household._id} value={entry.household._id}>
                  {entry.household.name}
                </option>
              ))}
            </select>
            <Badge variant="outline">
              {selectedHousehold ? selectedHousehold.name : "No household"}
            </Badge>
          </div>
        ) : (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            Create a household before adding API keys.
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={moveRestrictionId}
            onChange={(event) =>
              setSelectedMoveRestrictionId(
                event.target.value as Id<"moves"> | "all"
              )
            }
            aria-label="API key move restriction"
            disabled={!effectiveHouseholdId || moves === undefined}
          >
            <option value="all">All moves in selected household</option>
            {activeMoves.map((move) => (
              <option key={move._id} value={move._id}>
                {move.title}
              </option>
            ))}
          </select>
          <Badge variant={moveRestrictionId === "all" ? "outline" : "secondary"}>
            {moveRestrictionId === "all"
              ? "All moves"
              : apiKeyRestrictionLabel(
                  moveRestrictionId,
                  moveTitleById.get(moveRestrictionId)
                )}
          </Badge>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name"
            aria-label="API key name"
          />
          <Input
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(event.target.value)}
            inputMode="numeric"
            placeholder="Expires in days"
            aria-label="API key expiration in days"
          />
        </div>

        <div className="rounded-md border border-border p-3">
          <h3 className="text-sm font-medium">Scopes</h3>
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

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!effectiveHouseholdId || busy === "create" || !scopes.length}
            onClick={() => void handleCreateKey()}
          >
            {busy === "create" ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound aria-hidden="true" />
            )}
            Create key
          </Button>
        </div>

        {oneTimeSecret ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">One-time secret</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This raw key is not stored and will not be shown again.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void handleCopySecret()}>
                <Copy aria-hidden="true" />
                Copy
              </Button>
            </div>
            <Textarea
              className="mt-3 font-mono text-xs"
              readOnly
              value={oneTimeSecret}
              aria-label="One-time API key secret"
            />
          </div>
        ) : null}

        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Existing keys</h3>
          {keys === undefined && effectiveHouseholdId ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-5/6" />
            </div>
          ) : keys?.length ? (
            keys.map((key) => (
              <div
                key={key.apiKeyId}
                role="group"
                aria-label={`API key ${key.name}`}
                className="rounded-md border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{key.name}</p>
                      <Badge variant={key.status === "active" ? "secondary" : "outline"}>
                        {apiKeyStatusLabel(key.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {key.tokenPreview}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expires {formatApiKeyDate(key.expiresAt)} · Last used{" "}
                      {formatApiKeyDate(key.lastUsedAt)}
                      {key.lastUsedAction ? ` for ${key.lastUsedAction}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant={key.moveId ? "secondary" : "outline"}>
                        {apiKeyRestrictionLabel(
                          key.moveId,
                          key.moveId ? moveTitleById.get(key.moveId) : undefined
                        )}
                      </Badge>
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="outline">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={key.status !== "active" || busy === `rotate-${key.apiKeyId}`}
                      onClick={() => void handleRotateKey(key.apiKeyId)}
                    >
                      {busy === `rotate-${key.apiKeyId}` ? (
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
                      disabled={key.status !== "active" || busy === `revoke-${key.apiKeyId}`}
                      onClick={() => void handleRevokeKey(key.apiKeyId)}
                    >
                      {busy === `revoke-${key.apiKeyId}` ? (
                        <RefreshCw className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 aria-hidden="true" />
                      )}
                      Revoke
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No API keys yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
