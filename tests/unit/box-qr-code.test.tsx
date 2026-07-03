import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const qrCodeMock = vi.hoisted(() => ({
  toDataURL: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: qrCodeMock.toDataURL,
  },
}));

import { BoxQrCode } from "@/components/box-qr-code";

describe("BoxQrCode", () => {
  beforeEach(() => {
    qrCodeMock.toDataURL.mockReset();
    qrCodeMock.toDataURL.mockResolvedValue("data:image/png;base64,qr");
  });

  it("labels QR images by box code for assistive technology", async () => {
    render(<BoxQrCode value="https://example.com/app/boxes/box_12" label="B-012" />);

    const image = await screen.findByRole("img", {
      name: "QR code for box B-012",
    });

    expect(image).toHaveAttribute("src", "data:image/png;base64,qr");
    expect(
      screen.queryByRole("img", { name: "B-012 QR code" }),
    ).not.toBeInTheDocument();
  });
});

