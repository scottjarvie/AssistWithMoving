export type PhotoDerivativeVariant = "thumb" | "card" | "detail" | "full";

export const serverDerivativeSpecs = [
  { variant: "thumb", width: 200, height: 200, fit: "cover", quality: 78 },
  { variant: "card", width: 600, height: 600, fit: "inside", quality: 82 },
  { variant: "detail", width: 1200, height: 1200, fit: "inside", quality: 86 },
  { variant: "full", width: 2400, height: 2400, fit: "inside", quality: 90 },
] as const satisfies Array<{
  variant: PhotoDerivativeVariant;
  width: number;
  height: number;
  fit: "cover" | "inside";
  quality: number;
}>;
