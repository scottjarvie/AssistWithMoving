import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  floorplanEvidence: {
    recordMeasurement: "floorplanEvidence.recordMeasurement",
  },
  floorPlans: {
    createFloorPlan: "floorPlans.createFloorPlan",
    getActiveDocumentForMove: "floorPlans.getActiveDocumentForMove",
  },
  ingestionQueue: {
    createEntry: "ingestionQueue.createEntry",
  },
  photos: {
    cancelUploadSession: "photos.cancelUploadSession",
    finalizeUpload: "photos.finalizeUpload",
    initUpload: "photos.initUpload",
  },
}));

const uploadData = vi.hoisted(() => {
  function mediaKindForMimeType(mimeType: string) {
    return mimeType.startsWith("image/") ? "image" : null;
  }

  return {
    cancelUploadSession: vi.fn(),
    createEntry: vi.fn(),
    createFloorPlan: vi.fn(async () => ({ planId: "created_plan_123" })),
    fileSha256Hex: vi.fn(async (file: File) => `hash-${file.name}`),
    finalizeUpload: vi.fn(async ({ fileName }: { fileName: string }) => ({
      photoId: `photo_${fileName.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
    })),
    imageDimensions: vi.fn(async () => ({ width: 1600, height: 1200 })),
    initUpload: vi.fn(async () => ({
      uploadSessionId: "session_123",
      uploadUrl: "https://uploads.example.com/floorplan",
      headers: { "Content-Type": "application/octet-stream" },
      derivativeUploads: [],
    })),
    mediaKindForMimeType: vi.fn(mediaKindForMimeType),
    recordMeasurement: vi.fn(async () => ({
      evidenceId: "evidence_123",
      measurementId: "measurement_123",
    })),
    uploadFileWithProgress: vi.fn(),
    validateMediaUploadFile: vi.fn((file: File) => ({
      ok: mediaKindForMimeType(file.type) === "image",
      message:
        mediaKindForMimeType(file.type) === "image"
          ? undefined
          : "Unsupported file.",
    })),
  };
});

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useAction: (action: string) => {
    if (action === apiMock.photos.initUpload) return uploadData.initUpload;
    if (action === apiMock.photos.finalizeUpload) return uploadData.finalizeUpload;
    throw new Error(`Unexpected action ${action}`);
  },
  useMutation: (mutation: string) => {
    if (mutation === apiMock.photos.cancelUploadSession) {
      return uploadData.cancelUploadSession;
    }
    if (mutation === apiMock.ingestionQueue.createEntry) {
      return uploadData.createEntry;
    }
    if (mutation === apiMock.floorPlans.createFloorPlan) {
      return uploadData.createFloorPlan;
    }
    if (mutation === apiMock.floorplanEvidence.recordMeasurement) {
      return uploadData.recordMeasurement;
    }
    throw new Error(`Unexpected mutation ${mutation}`);
  },
  useQuery: (query: string) =>
    query === apiMock.floorPlans.getActiveDocumentForMove
      ? { plan: { _id: "plan_789" } }
      : undefined,
}));

vi.mock("@/lib/photo-upload", () => ({
  fileSha256Hex: uploadData.fileSha256Hex,
  imageDimensions: uploadData.imageDimensions,
  mediaKindForMimeType: uploadData.mediaKindForMimeType,
  uploadFileWithProgress: uploadData.uploadFileWithProgress,
  validateMediaUploadFile: uploadData.validateMediaUploadFile,
}));

import { AssumptionsPanel } from "@/components/floorplans/assumptions-panel";
import { AreaTargetsPanel } from "@/components/floorplans/area-targets-panel";
import { CalculationsPanel } from "@/components/floorplans/calculations-panel";
import { ConflictsPanel } from "@/components/floorplans/conflicts-panel";
import { EvidencePanel } from "@/components/floorplans/evidence-panel";
import { FloorplanKeyPanel } from "@/components/floorplans/floorplan-key-panel";
import { FloorplanViewer } from "@/components/floorplans/floorplan-viewer";
import { FloorplansPageShell } from "@/components/floorplans/floorplans-page-shell";
import { MeasurementsPanel } from "@/components/floorplans/measurements-panel";
import { ObservationsPanel } from "@/components/floorplans/observations-panel";
import { RelationshipsPanel } from "@/components/floorplans/relationships-panel";
import { ResourcesUploadPanel } from "@/components/floorplans/resources-upload-panel";
import { SubjectsPanel } from "@/components/floorplans/subjects-panel";
import {
  floorplanMeasurements,
  floorplanObservations,
  floorplanRelationships,
  getSampleFloorplanSolve,
  sortedGapPriorities,
} from "@/lib/floorplans/sample-data";
import { solveFloorplanPuzzle } from "@/lib/floorplans/solver";

function generatedSampleSolve() {
  return solveFloorplanPuzzle({
    measurements: floorplanMeasurements,
    observations: floorplanObservations,
    relationships: floorplanRelationships,
  });
}

describe("Floorplans feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the public full-screen interface shell", () => {
    render(<FloorplansPageShell mode="public" />);

    expect(screen.getByRole("heading", { name: "Floorplans" })).toBeInTheDocument();
    expect(screen.getByText("Evidence Workbench")).toBeInTheDocument();
    expect(screen.getByTestId("floorplan-viewer")).toBeInTheDocument();
    expect(screen.getByText("No generated geometry yet. Add evidence, then regenerate the layout.")).toBeInTheDocument();
    expect(screen.getAllByText("Sources").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Observations").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Measurements").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Relationships").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draft Preview").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Key").length).toBeGreaterThan(0);
  }, 20000);

  it("updates zoom and toggles the dimension layer", async () => {
    const user = userEvent.setup();
    render(<FloorplanViewer solve={generatedSampleSolve()} />);

    const zoomBefore = screen.getByTestId("zoom-value").textContent;
    await user.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(screen.getByTestId("zoom-value").textContent).not.toBe(zoomBefore);
    expect(screen.getByTestId("dimension-layer")).toBeInTheDocument();

    await user.click(screen.getByTestId("dimension-toggle"));
    expect(screen.queryByTestId("dimension-layer")).not.toBeInTheDocument();
  });

  it("selects an observation and carries its subject into measurements", async () => {
    render(<FloorplansPageShell mode="public" />);

    fireEvent.click(screen.getByRole("button", { name: "Inspect Bonus room label" }));

    const selectedPanel = screen.getByTestId("selected-graph-panel");
    expect(within(selectedPanel).getByText("Bonus room label")).toBeInTheDocument();
    expect(within(selectedPanel).getByText(/Image #2/)).toBeInTheDocument();

    const measurementsTab = screen.getByRole("tab", { name: "Measurements" });
    fireEvent.click(measurementsTab);
    fireEvent.keyDown(measurementsTab, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByLabelText("Subject")).toHaveValue("bonus-room");
    });
  }, 12000);

  it("trashes draft output without removing evidence workbench records", async () => {
    const user = userEvent.setup();
    render(<FloorplansPageShell mode="public" />);

    await user.click(screen.getByRole("button", { name: "Trash draft / start over" }));
    expect(screen.getByText("Draft output removed; evidence graph is still intact.")).toBeInTheDocument();
    expect(screen.getByText("19 facts")).toBeInTheDocument();
    expect(screen.getByText("13 links")).toBeInTheDocument();
  });

  it("does not render unsupported floating room-3 marks", () => {
    render(<FloorplanViewer solve={generatedSampleSolve()} />);

    expect(
      screen.queryByRole("button", { name: "Select Room 3 feature" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select Room 3 window" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select Kitchen window" }),
    ).toBeInTheDocument();
  });

  it("opens evidence images from resource cards for review", async () => {
    const user = userEvent.setup();
    render(<ResourcesUploadPanel mode="public" />);

    await user.click(
      screen.getByRole("button", { name: "Review Whole-house overview sketch" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("What this source proves")).toBeInTheDocument();
    expect(screen.getByText("whole-house-overview.jpg")).toBeInTheDocument();
  });

  it("stages public floorplan images with context before durable upload", async () => {
    const user = userEvent.setup();
    render(<ResourcesUploadPanel mode="public" />);

    await user.upload(screen.getByLabelText("Choose floorplan images"), [
      new File(["kitchen"], "kitchen-detail.png", { type: "image/png" }),
      new File(["satellite"], "satellite.png", { type: "image/png" }),
    ]);

    const pendingList = screen.getByLabelText("Pending floorplan images");
    expect(within(pendingList).getByText("kitchen-detail.png")).toBeInTheDocument();
    expect(within(pendingList).getByText("satellite.png")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Context for kitchen-detail.png"),
      "This is the kitchen.",
    );
    await user.click(within(pendingList).getAllByRole("button", { name: "Use for AI" })[1]);

    expect(screen.getByText("1 of 2 marked for AI review")).toBeInTheDocument();
    expect(screen.getByText("1 image marked for AI review.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Save and run AI" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    expect(uploadData.finalizeUpload).not.toHaveBeenCalled();
    expect(uploadData.createEntry).not.toHaveBeenCalled();
  }, 12000);

  it("sorts gap priorities by expected impact", () => {
    const sorted = sortedGapPriorities([
      {
        id: "nice",
        question: "Door swing detail",
        category: "nice-to-have",
        impactScore: 10,
        whyItHelps: "Polish",
        answerFormat: "A note",
      },
      {
        id: "scale",
        question: "Largest room dimensions",
        category: "scale-largest-unknown",
        impactScore: 80,
        whyItHelps: "Scales the unknown wing",
        answerFormat: "Width and depth",
      },
      {
        id: "path",
        question: "Hall width",
        category: "mover-path",
        impactScore: 60,
        whyItHelps: "Improves path accuracy",
        answerFormat: "One number",
      },
    ]);

    expect(sorted.map((gap) => gap.id)).toEqual(["scale", "path", "nice"]);
  });

  it("renders evidence, graph, measurements, assumptions, conflicts, and key as separate panels", () => {
    const { rerender } = render(<EvidencePanel />);
    expect(screen.getByTestId("evidence-panel")).toBeInTheDocument();
    expect(screen.getByText("Whole-house overview sketch")).toBeInTheDocument();

    rerender(<EvidencePanel view="knownTruths" />);
    expect(screen.getByTestId("known-truths-panel")).toBeInTheDocument();
    expect(screen.getByText("One-floor plan")).toBeInTheDocument();

    rerender(<AssumptionsPanel />);
    expect(screen.getByTestId("assumptions-panel")).toBeInTheDocument();

    rerender(<ConflictsPanel />);
    expect(screen.getByTestId("conflicts-panel")).toBeInTheDocument();
    expect(screen.getByText("Right bedroom wing scale")).toBeInTheDocument();

    rerender(<ObservationsPanel />);
    expect(screen.getByTestId("observations-panel")).toBeInTheDocument();
    expect(screen.getByText("One horizontal hall")).toBeInTheDocument();

    rerender(<RelationshipsPanel />);
    expect(screen.getByTestId("relationships-panel")).toBeInTheDocument();
    expect(screen.getByText(/Kitchen → Hall/)).toBeInTheDocument();

    rerender(<SubjectsPanel />);
    expect(screen.getByTestId("subjects-panel")).toBeInTheDocument();
    expect(screen.getAllByText("Right-wing bathroom").length).toBeGreaterThan(0);

    rerender(<FloorplanKeyPanel />);
    expect(screen.getByTestId("floorplan-key-panel")).toBeInTheDocument();
    expect(screen.getByText("Door and swing arc")).toBeInTheDocument();
    expect(screen.getByText("Doorless or unconfirmed passage")).toBeInTheDocument();

    rerender(<MeasurementsPanel mode="public" />);
    expect(screen.getByTestId("measurements-panel")).toBeInTheDocument();
    expect(screen.getAllByText("Known").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Assumption").length).toBeGreaterThan(0);

    const sampleSolve = getSampleFloorplanSolve();

    rerender(
      <CalculationsPanel
        calculations={sampleSolve.calculations}
        diagnostics={sampleSolve.diagnostics}
        summary={sampleSolve.areaSummary}
      />,
    );
    expect(screen.getByTestId("calculations-panel")).toBeInTheDocument();
    expect(screen.getByTestId("area-reconciliation-card")).toBeInTheDocument();

    rerender(
      <AreaTargetsPanel
        areaTargets={sampleSolve.areaTargets}
        mode="public"
        onMeasurementsRecorded={vi.fn()}
      />,
    );
    expect(screen.getByTestId("area-targets-panel")).toBeInTheDocument();
    expect(screen.getByText("Scott house")).toBeInTheDocument();
  }, 15000);

  it("records user room-size edits as high-confidence measurement evidence", async () => {
    const user = userEvent.setup();
    const onMeasurementsRecorded = vi.fn();

    render(
      <MeasurementsPanel
        householdId={"household_123" as Id<"households">}
        mode="move"
        moveId={"move_123" as Id<"moves">}
        onMeasurementsRecorded={onMeasurementsRecorded}
        targetPlanId={"plan_123" as Id<"floorPlans">}
      />,
    );

    fireEvent.change(screen.getByLabelText("Width, ft"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("Provenance note"), {
      target: { value: "Tape measure." },
    });
    await user.click(screen.getByRole("button", { name: "Save evidence" }));

    await waitFor(() => {
      expect(uploadData.recordMeasurement).toHaveBeenCalledWith(
        expect.objectContaining({
          confidence: "high",
          displayValue: "15 ft",
          kind: "known",
          measurementType: "width",
          planId: "plan_123",
          subjectType: "room",
          valueIn: 180,
        }),
      );
    });
    expect(onMeasurementsRecorded).toHaveBeenCalledWith([
      expect.objectContaining({
        confidence: "high",
        kind: "known",
        measurementType: "width",
        provenance: [
          expect.objectContaining({
            sourceType: "userEdit",
          }),
        ],
      }),
    ]);
  });

  it("records official square footage as weighted area evidence", async () => {
    const user = userEvent.setup();
    const onMeasurementsRecorded = vi.fn();
    const sampleSolve = getSampleFloorplanSolve();

    render(
      <AreaTargetsPanel
        areaTargets={sampleSolve.areaTargets}
        householdId={"household_123" as Id<"households">}
        mode="move"
        moveId={"move_123" as Id<"moves">}
        onMeasurementsRecorded={onMeasurementsRecorded}
        targetPlanId={"plan_123" as Id<"floorPlans">}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Official/suspected conditioned area, sq ft"),
      {
        target: { value: "1842" },
      },
    );
    await user.click(screen.getByRole("button", { name: "Save area evidence" }));

    await waitFor(() => {
      expect(uploadData.recordMeasurement).toHaveBeenCalledWith(
        expect.objectContaining({
          areaRole: "conditioned",
          constraintStrength: "strong",
          measurementType: "conditionedArea",
          unit: "sqft",
          value: 1842,
        }),
      );
    });
    expect(onMeasurementsRecorded).toHaveBeenCalledWith([
      expect.objectContaining({
        areaRole: "conditioned",
        constraintStrength: "strong",
        measurementType: "conditionedArea",
        unit: "sqft",
        value: 1842,
      }),
    ]);
  });

  it("uploads move-backed floorplan images with per-image AI review context", async () => {
    const user = userEvent.setup();

    render(
      <ResourcesUploadPanel
        householdId={"household_123" as Id<"households">}
        mode="move"
        moveId={"move_123" as Id<"moves">}
      />,
    );

    const blueprint = new File(["blueprint"], "main-floor.png", {
      type: "image/png",
      lastModified: 1710000010000,
    });
    const satellite = new File(["satellite"], "satellite-view.png", {
      type: "image/png",
      lastModified: 1710000020000,
    });

    await user.upload(screen.getByLabelText("Choose floorplan images"), [
      blueprint,
      satellite,
    ]);
    const pendingList = screen.getByLabelText("Pending floorplan images");
    expect(within(pendingList).getByText("main-floor.png")).toBeInTheDocument();
    expect(within(pendingList).getByText("satellite-view.png")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(pendingList).getAllByText(/1600x1200/).length).toBe(2);
    });

    fireEvent.change(screen.getByLabelText("Context for main-floor.png"), {
      target: { value: "This image is the kitchen and living room reference." },
    });
    fireEvent.change(screen.getByLabelText("Context for satellite-view.png"), {
      target: {
        value: "This is mostly for later lot context; skip it for the first pass.",
      },
    });
    const useForAiButtons = within(pendingList).getAllByRole("button", {
      name: "Use for AI",
    });
    await user.click(useForAiButtons[1]);

    fireEvent.change(screen.getByLabelText("Floorplan agent instructions"), {
      target: { value: "Use the laundry sketch as the best scale reference." },
    });
    await user.click(screen.getByRole("button", { name: "Queue floorplan evidence" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Stored 2 blueprint images and queued 1 for the floorplan agent.",
        ),
      ).toBeInTheDocument();
    });

    expect(uploadData.createFloorPlan).not.toHaveBeenCalled();
    expect(uploadData.finalizeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "main-floor.png",
        photoType: "blueprint",
        source: "manualUpload",
      }),
    );
    expect(uploadData.finalizeUpload).toHaveBeenCalledTimes(2);
    expect(uploadData.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "This image is the kitchen and living room reference.",
        ),
        mediaPhotoIds: ["photo_main_floor_png"],
        scopeHint: "floorPlan",
        targetPlanId: "plan_789",
      }),
    );
    expect(uploadData.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "Uploaded but not selected for this AI pass:",
        ),
      }),
    );
  });
});
