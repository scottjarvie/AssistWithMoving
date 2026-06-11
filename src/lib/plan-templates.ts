export type PlanTemplate = {
  key: string;
  label: string;
  category: "bedroom" | "living" | "dining" | "office" | "appliance" | "storage";
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

export const planTemplates: PlanTemplate[] = [
  { key: "bed_twin", label: "Twin bed", category: "bedroom", lengthIn: 75, widthIn: 38, heightIn: 24 },
  { key: "bed_full", label: "Full bed", category: "bedroom", lengthIn: 75, widthIn: 54, heightIn: 24 },
  { key: "bed_queen", label: "Queen bed", category: "bedroom", lengthIn: 80, widthIn: 60, heightIn: 24 },
  { key: "bed_king", label: "King bed", category: "bedroom", lengthIn: 80, widthIn: 76, heightIn: 24 },
  { key: "sofa", label: "Sofa", category: "living", lengthIn: 84, widthIn: 38, heightIn: 34 },
  { key: "loveseat", label: "Loveseat", category: "living", lengthIn: 60, widthIn: 38, heightIn: 34 },
  { key: "dining_table", label: "Dining table", category: "dining", lengthIn: 72, widthIn: 40, heightIn: 30 },
  { key: "desk", label: "Desk", category: "office", lengthIn: 60, widthIn: 30, heightIn: 30 },
  { key: "dresser", label: "Dresser", category: "bedroom", lengthIn: 60, widthIn: 20, heightIn: 34 },
  { key: "fridge", label: "Fridge", category: "appliance", lengthIn: 36, widthIn: 30, heightIn: 70 },
  { key: "washer", label: "Washer", category: "appliance", lengthIn: 27, widthIn: 30, heightIn: 39 },
  { key: "dryer", label: "Dryer", category: "appliance", lengthIn: 27, widthIn: 30, heightIn: 39 },
  { key: "piano_upright", label: "Upright piano", category: "living", lengthIn: 58, widthIn: 24, heightIn: 48 },
  { key: "bookshelf", label: "Bookshelf", category: "storage", lengthIn: 36, widthIn: 12, heightIn: 72 },
  { key: "nightstand", label: "Nightstand", category: "bedroom", lengthIn: 20, widthIn: 20, heightIn: 26 },
];

export function planTemplateByKey(key: string | undefined) {
  return planTemplates.find((template) => template.key === key);
}
