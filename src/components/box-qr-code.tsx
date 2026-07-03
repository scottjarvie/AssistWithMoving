"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function BoxQrCode({
  value,
  label,
  size = 152,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: size,
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    }).then((url) => {
      if (!cancelled) {
        setDataUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [size, value]);

  if (!dataUrl) {
    return (
      <div
        className="grid place-items-center rounded-md border border-border bg-muted text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        QR
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt={`QR code for box ${label}`}
      width={size}
      height={size}
      className="rounded-md border border-border bg-white"
    />
  );
}
