"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Download,
  FileArchive,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ExportSummary = Record<string, number>;

type AccountExport = {
  exportJobId: Id<"accountExportJobs">;
  status: "completed" | "expired";
  filename: string;
  sizeBytes?: number;
  summary: ExportSummary;
  createdAt: number;
  completedAt?: number;
  expiresAt: number;
};

type PrivacyStatus = {
  exports: AccountExport[];
  pendingDeletion: {
    requestId: Id<"accountDeletionRequests">;
    requestedAt: number;
    scheduledDeletionAt: number;
  } | null;
  deletionConfirmation: string;
  retentionPolicy: Record<string, string>;
};

const privacyTasks = [
  { value: "export", label: "Export" },
  { value: "retention", label: "Retention" },
  { value: "delete", label: "Delete account" },
] as const;

export function AccountPrivacyControls({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const privacyStatus = useQuery(
    api.accountPrivacy.status,
    enabled ? {} : "skip"
  ) as
    | PrivacyStatus
    | undefined;
  const createExport = useMutation(api.accountPrivacy.createAccountExport);
  const requestDeletion = useMutation(api.accountPrivacy.requestAccountDeletion);
  const cancelDeletion = useMutation(api.accountPrivacy.cancelAccountDeletion);
  const completeDeletion = useMutation(api.accountPrivacy.completeAccountDeletion);
  const [selectedExportId, setSelectedExportId] =
    useState<Id<"accountExportJobs"> | null>(null);
  const artifact = useQuery(
    api.accountPrivacy.getAccountExportArtifact,
    enabled && selectedExportId ? { exportJobId: selectedExportId } : "skip"
  );
  const downloadedArtifactId = useRef<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!artifact || downloadedArtifactId.current === artifact.exportJobId) {
      return;
    }

    downloadedArtifactId.current = artifact.exportJobId;
    downloadTextFile({
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      text: artifact.artifactText,
    });
    setMessage("Account export downloaded.");
  }, [artifact]);

  async function handleCreateExport() {
    setBusy("export");
    setMessage(null);
    try {
      const result = await createExport({});
      setSelectedExportId(result.exportJobId);
      setMessage("Account export created.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleRequestDeletion() {
    setBusy("request-delete");
    setMessage(null);
    try {
      await requestDeletion({});
      setMessage("Deletion request staged.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelDeletion() {
    if (!privacyStatus?.pendingDeletion) {
      return;
    }

    setBusy("cancel-delete");
    setMessage(null);
    try {
      await cancelDeletion({
        requestId: privacyStatus.pendingDeletion.requestId,
      });
      setMessage("Deletion request cancelled.");
      setConfirmation("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleCompleteDeletion() {
    if (!privacyStatus?.pendingDeletion) {
      return;
    }

    setBusy("complete-delete");
    setMessage(null);
    try {
      await completeDeletion({
        requestId: privacyStatus.pendingDeletion.requestId,
        confirmation,
      });
      setMessage("Account deletion completed. Your profile is now anonymized.");
      setConfirmation("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (!enabled || privacyStatus === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  const pendingDeletion = privacyStatus.pendingDeletion;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileArchive className="size-4 text-primary" aria-hidden="true" />
          Account data and deletion
        </CardTitle>
        <CardDescription>
          Export your account data, stage deletion, and review retention rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs defaultValue="export" className="gap-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="min-w-max" aria-label="Account privacy tasks">
              {privacyTasks.map((task) => (
                <TabsTrigger key={task.value} value={task.value}>
                  {task.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="export" className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
              <div className="rounded-md border border-border p-3">
                <h3 className="text-sm font-medium">Account export</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Generates a JSON package for your account, active household
                  memberships, move records, inventory records you can access,
                  metadata, and retention notes.
                </p>
              </div>
              <Button
                type="button"
                disabled={busy === "export"}
                onClick={() => void handleCreateExport()}
              >
                {busy === "export" ? (
                  <RefreshCw className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                Create export
              </Button>
            </div>

            {privacyStatus.exports.length ? (
              <>
                <AccountExportCards
                  exports={privacyStatus.exports}
                  onDownload={(exportJobId) => {
                    downloadedArtifactId.current = null;
                    setSelectedExportId(exportJobId);
                  }}
                />
                <div className="hidden md:block">
                  <Table aria-label="Account export table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Export</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="w-28">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {privacyStatus.exports.map((job) => (
                        <TableRow key={job.exportJobId}>
                          <TableCell>
                            <div className="font-medium">{job.filename}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatBytes(job.sizeBytes)} /{" "}
                              {formatDate(job.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <ExportSummaryBadges summary={job.summary} />
                          </TableCell>
                          <TableCell>{formatDate(job.expiresAt)}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={job.status !== "completed"}
                              onClick={() => {
                                downloadedArtifactId.current = null;
                                setSelectedExportId(job.exportJobId);
                              }}
                            >
                              <Download aria-hidden="true" />
                              JSON
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                No account exports yet.
              </p>
            )}
          </TabsContent>

          <TabsContent value="retention">
            <div className="rounded-md border border-border p-3">
              <h3 className="text-sm font-medium">Retention rules</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {Object.entries(privacyStatus.retentionPolicy).map(
                  ([key, value]) => (
                    <div key={key} className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        {labelize(key)}
                      </p>
                      <p className="mt-1 text-sm leading-6">{value}</p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="delete">
            <div className="rounded-md border border-destructive/30 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <ShieldAlert
                      className="size-4 text-destructive"
                      aria-hidden="true"
                    />
                    Account deletion
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Deletion is staged, then disables and anonymizes your
                    profile, revokes your API keys and share links, and disables
                    your memberships. Shared household records remain for other
                    collaborators.
                  </p>
                </div>
                {pendingDeletion ? (
                  <Badge variant="destructive">
                    Scheduled {formatDate(pendingDeletion.scheduledDeletionAt)}
                  </Badge>
                ) : (
                  <Badge variant="outline">No pending request</Badge>
                )}
              </div>

              {pendingDeletion ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_170px]">
                    <Input
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder={privacyStatus.deletionConfirmation}
                      aria-label="Deletion confirmation"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy === "cancel-delete"}
                      onClick={() => void handleCancelDeletion()}
                    >
                      <X aria-hidden="true" />
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={
                        busy === "complete-delete" ||
                        confirmation !== privacyStatus.deletionConfirmation
                      }
                      onClick={() => void handleCompleteDeletion()}
                    >
                      <Trash2 aria-hidden="true" />
                      Complete deletion
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  className="mt-4"
                  disabled={busy === "request-delete"}
                  onClick={() => void handleRequestDeletion()}
                >
                  <Trash2 aria-hidden="true" />
                  Request deletion
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {message ? (
          <p
            className="rounded-md border border-border p-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AccountExportCards({
  exports,
  onDownload,
}: {
  exports: AccountExport[];
  onDownload: (exportJobId: Id<"accountExportJobs">) => void;
}) {
  return (
    <div
      role="list"
      aria-label="Account export cards"
      className="grid gap-3 md:hidden"
    >
      {exports.map((job) => (
        <article
          key={job.exportJobId}
          role="listitem"
          className="rounded-md border border-border bg-card p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold">
                {job.filename}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatBytes(job.sizeBytes)} / {formatDate(job.createdAt)}
              </p>
            </div>
            <Badge variant={job.status === "completed" ? "secondary" : "outline"}>
              {job.status}
            </Badge>
          </div>

          <div className="mt-3">
            <ExportSummaryBadges summary={job.summary} />
          </div>

          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="text-[11px] font-medium uppercase text-muted-foreground">
                Expires
              </p>
              <p className="mt-1">{formatDate(job.expiresAt)}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={job.status !== "completed"}
              onClick={() => onDownload(job.exportJobId)}
            >
              <Download aria-hidden="true" />
              JSON
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ExportSummaryBadges({ summary }: { summary: ExportSummary }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(summary).map(([key, value]) => (
        <Badge key={key} variant="outline">
          {labelize(key)}: {value}
        </Badge>
      ))}
    </div>
  );
}

function downloadTextFile({
  filename,
  mimeType,
  text,
}: {
  filename: string;
  mimeType: string;
  text: string;
}) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatBytes(value = 0) {
  if (value < 1024) {
    return `${value.toLocaleString()} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDate(value?: number) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function labelize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Privacy request failed.";
}
