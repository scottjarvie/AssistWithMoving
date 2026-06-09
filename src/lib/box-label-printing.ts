export type BoxLabelPrintLayout = "letterSheet" | "thermal4x6" | "thermal3x2";

export type BoxLabelPrintPreset = {
  key: BoxLabelPrintLayout;
  label: string;
  shortLabel: string;
  description: string;
  pageSize: string;
  printMargin: string;
  printColumns: number;
  minHeight: string;
  gap: string;
  qrSize: number;
  screenGridClass: string;
  thermal: boolean;
  showUrl: boolean;
};

export const boxLabelPrintPresets: BoxLabelPrintPreset[] = [
  {
    key: "letterSheet",
    label: "Letter sheet",
    shortLabel: "Letter",
    description: "Two-column labels for normal 8.5 x 11 in paper.",
    pageSize: "letter",
    printMargin: "0.35in",
    printColumns: 2,
    minHeight: "2.6in",
    gap: "0.18in",
    qrSize: 132,
    screenGridClass: "md:grid-cols-2 xl:grid-cols-3",
    thermal: false,
    showUrl: true,
  },
  {
    key: "thermal4x6",
    label: "4 x 6 thermal",
    shortLabel: "4 x 6",
    description: "One large QR box label per page for Rollo, Zebra, and shipping label printers.",
    pageSize: "4in 6in",
    printMargin: "0.15in",
    printColumns: 1,
    minHeight: "5.65in",
    gap: "0",
    qrSize: 156,
    screenGridClass: "md:grid-cols-2 xl:grid-cols-2",
    thermal: true,
    showUrl: true,
  },
  {
    key: "thermal3x2",
    label: "3 x 2 compact",
    shortLabel: "3 x 2",
    description: "Compact one-label-per-page layout for small thermal box stickers.",
    pageSize: "3in 2in",
    printMargin: "0.08in",
    printColumns: 1,
    minHeight: "1.84in",
    gap: "0",
    qrSize: 76,
    screenGridClass: "md:grid-cols-3 xl:grid-cols-4",
    thermal: true,
    showUrl: false,
  },
];

export function isBoxLabelPrintLayout(
  value: string | undefined
): value is BoxLabelPrintLayout {
  return boxLabelPrintPresets.some((preset) => preset.key === value);
}

export function boxLabelPrintPresetFor(value: string | undefined) {
  return (
    boxLabelPrintPresets.find((preset) => preset.key === value) ??
    boxLabelPrintPresets[0]
  );
}
