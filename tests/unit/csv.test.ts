// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { csvCell, downloadCsv } from "@/lib/csv";

it("preserves packet CSV escaping and line breaks", () => {
  expect(["", "plain", "a,b", 'a"b', "a\nb", "a\rb"].map(csvCell).join(","))
    .toBe(',plain,"a,b","a""b","a\nb",a\rb');
});

it("downloads the original bytes using the requested filename and revokes the URL", async () => {
  const bytes = 'Name\r\n"Café, chair"\r\n';
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv-test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("move packet.csv");
    expect(this.href).toBe("blob:csv-test");
  });
  try {
    downloadCsv("move packet.csv", bytes);
    const blob = create.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error("Expected a CSV Blob");
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await blob.text()).toBe(bytes);
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:csv-test");
    expect(revoke.mock.invocationCallOrder[0]).toBeGreaterThan(click.mock.invocationCallOrder[0]);
  } finally {
    vi.restoreAllMocks();
  }
});
