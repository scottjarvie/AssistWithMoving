import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConnectionManager } from "@/components/ai-connection-manager";
const mocks = vi.hoisted(() => ({ result: undefined as unknown, change: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: () => mocks.result, useMutation: () => mocks.change }));
vi.mock("@/components/api-key-manager", () => ({ ApiKeyManager: () => <div>API key creation</div> }));
const base = { id: "grant-one", kind: "oauth", label: "My AI", version: 4, scopes: ["moving.context.read"], catalog: ["moving.context.read", "moving.work.write"], expiresAt: null, pausedAt: null, status: "active", lastUsedAt: null, narrowedBy: "ai", narrowedAt: 1794000000000 };
beforeEach(() => { mocks.change.mockReset().mockResolvedValue({}); mocks.result = { connections: [{ ...base }], history: [{ _id: "history-one", connectionId: "grant-one", createdAt: 1794000000000, actor: "ai", message: "Your AI removed saving." }] }; });
describe("AI settings after AWL-0015", () => {
  it("shows the exact opening and an honest fresh-account state without enable controls", () => {
    mocks.result = { connections: [], history: [] }; render(<AiConnectionManager />);
    expect(screen.getByText("Your AI has full access. You can limit it here or by asking it.")).toBeVisible();
    expect(screen.getByText(/No AI has connected yet/)).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|enable/i })).not.toBeInTheDocument();
  });
  it("shows powers, no end date, last use, AI narrowing and attributed history", () => {
    render(<AiConnectionManager />);
    expect(screen.getByText("No end date")).toBeVisible(); expect(screen.getByText("Last used: Never")).toBeVisible();
    expect(screen.getByText(/Narrowed by your AI/)).toBeVisible(); expect(screen.getByText(/by your AI: Your AI removed saving/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Read move context" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Save move work" })).not.toBeChecked();
  });
  it.each(["Pause", "Revoke", "Restore full powers"])("sends a versioned owner change for %s", async label => {
    render(<AiConnectionManager />); await userEvent.click(screen.getByRole("button", { name: label }));
    expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ grantId: "grant-one", expectedVersion: 4, opId: expect.any(String), action: label === "Pause" ? "pause" : label === "Revoke" ? "revoke" : "full" }));
  });
  it("offers Resume on a paused connection", async () => {
    mocks.result = { connections: [{ ...base, pausedAt: 1794000000000 }], history: [] }; render(<AiConnectionManager />);
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ action: "resume" }));
  });
  it("restores a revoked connection without requesting new powers", async () => {
    mocks.result = { connections: [{ ...base, status: "revoked" }], history: [] }; render(<AiConnectionManager />);
    await userEvent.click(screen.getByRole("button", { name: "Restore previous access" }));
    expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ action: "restore", scopes: undefined, expiresAt: undefined }));
  });
  it("manages the calling API key through the same controls", async () => {
    mocks.result = { connections: [{ ...base, id: "key-one", kind: "key" }], history: [] }; render(<AiConnectionManager />);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ apiKeyId: "key-one" }));
  });
  it("removes a power directly and reports stale-edit errors", async () => {
    mocks.change.mockRejectedValue(new Error("This connection changed. Reload Settings.")); render(<AiConnectionManager />);
    await userEvent.click(within(screen.getByRole("group", { name: "What it can do" })).getByRole("checkbox", { name: "Read move context" }));
    expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ action: "limits", scopes: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This connection changed");
  });
});
