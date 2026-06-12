import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  aiJobs: {
    listForMove: "aiJobs.listForMove",
    providerStatus: "aiJobs.providerStatus",
    create: "aiJobs.create",
    execute: "aiJobs.execute",
  },
  aiUsage: {
    summaryForMove: "aiUsage.summaryForMove",
  },
}));

const monitorData = vi.hoisted(() => ({
  mutation: vi.fn(),
  action: vi.fn(),
  jobs: [
    {
      _id: "job_succeeded" as Id<"aiJobs">,
      type: "generalReview",
      status: "succeeded",
      provider: "mock",
      model: "mock-model",
      reviewStatus: "unreviewed",
      cost: { estimatedCents: 1, actualCents: 1 },
    },
    {
      _id: "job_failed" as Id<"aiJobs">,
      type: "photoIntake",
      status: "failed",
      provider: "openai",
      model: "gpt-4.1-mini",
      reviewStatus: "needsReview",
      cost: { estimatedCents: 5 },
    },
  ],
  usage: {
    dailyJobs: 2,
    dailyCostCents: 6,
    inFlightJobs: 0,
    failedJobs: 1,
    limits: {
      maxDailyJobsPerMove: 25,
      maxDailyEstimatedCentsPerMove: 500,
      maxInFlightJobsPerMove: 3,
    },
    byType: {
      generalReview: 1,
      photoIntake: 1,
    },
    byProviderModel: {
      "mock:mock-model": 1,
      "openai:gpt-4.1-mini": 1,
    },
    failedRecent: [
      {
        id: "job_failed",
        type: "photoIntake",
        provider: "openai",
        model: "gpt-4.1-mini",
        error: "Photo derivative was unavailable.",
      },
    ],
    expensiveJobs: [
      {
        id: "job_expensive",
        type: "generalReview",
        provider: "openai",
        model: "gpt-4.1-mini",
        costCents: 125,
      },
    ],
  },
  providerStatus: {
    defaultProvider: "mock",
    defaultModel: "mock-model",
    openai: {
      configured: true,
      defaultModel: "gpt-4.1-mini",
    },
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useAction: () => monitorData.action,
  useMutation: () => monitorData.mutation,
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.aiJobs.listForMove:
        return monitorData.jobs;
      case apiMock.aiUsage.summaryForMove:
        return monitorData.usage;
      case apiMock.aiJobs.providerStatus:
        return monitorData.providerStatus;
      default:
        return undefined;
    }
  },
}));

import { AiJobMonitor } from "@/components/ai-job-monitor";

describe("AiJobMonitor task tabs", () => {
  beforeEach(() => {
    monitorData.mutation.mockReset();
    monitorData.action.mockReset();
  });

  it("opens on job history and separates usage and exception review", async () => {
    const user = userEvent.setup();

    render(
      <AiJobMonitor
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Exceptions" })).toBeInTheDocument();

    const jobCards = screen.getByRole("list", { name: "AI job cards" });
    expect(within(jobCards).getByText("generalReview")).toBeInTheDocument();
    expect(within(jobCards).getByText("photoIntake")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "AI job table" })).toBeInTheDocument();
    expect(screen.queryByText("Feature area usage")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent failures")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Usage" }));

    expect(screen.getByText("Daily jobs")).toBeInTheDocument();
    expect(screen.getByText("Feature area usage")).toBeInTheDocument();
    expect(screen.getByText("Provider/model usage")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "AI job cards" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Exceptions" }));

    expect(screen.getByText("Recent failures")).toBeInTheDocument();
    expect(screen.getByText("Cost outliers")).toBeInTheDocument();
    expect(screen.getByText(/Photo derivative was unavailable/)).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "AI job table" }),
    ).not.toBeInTheDocument();
  });
});
