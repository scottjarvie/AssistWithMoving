import { v } from "convex/values";

export const floorPlanKindValidator = v.union(
  v.literal("destination"),
  v.literal("origin"),
);

export const floorPlanStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

export const planLevelTypeValidator = v.union(
  v.literal("indoor"),
  v.literal("outdoor"),
);

export const planPointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

export const planShortIdCountersValidator = v.object({
  nextWall: v.number(),
  nextRoom: v.number(),
  nextOpening: v.number(),
  nextFeature: v.number(),
  nextZone: v.number(),
  nextAnnotation: v.number(),
  nextPlacement: v.number(),
});

export const defaultPlanShortIdCounters = {
  nextWall: 1,
  nextRoom: 1,
  nextOpening: 1,
  nextFeature: 1,
  nextZone: 1,
  nextAnnotation: 1,
  nextPlacement: 1,
} as const;

export const planUnderlayValidator = v.object({
  photoId: v.id("itemPhotos"),
  opacity: v.number(),
  originX: v.number(),
  originY: v.number(),
  scaleInPerPx: v.number(),
  rotationDeg: v.number(),
});

export const planEntityTypeValidator = v.union(
  v.literal("wall"),
  v.literal("room"),
  v.literal("opening"),
  v.literal("feature"),
  v.literal("zone"),
  v.literal("annotation"),
);

export const planOpeningKindValidator = v.union(
  v.literal("door"),
  v.literal("window"),
  v.literal("passage"),
);

export const planOpeningSwingValidator = v.union(
  v.literal("left"),
  v.literal("right"),
  v.literal("none"),
);

export const planFeatureKindValidator = v.union(
  v.literal("stairs"),
  v.literal("sink"),
  v.literal("toilet"),
  v.literal("tub"),
  v.literal("shower"),
  v.literal("waterHeater"),
  v.literal("fireplace"),
  v.literal("counter"),
  v.literal("shed"),
  v.literal("trampoline"),
  v.literal("swingSet"),
  v.literal("picnicTable"),
  v.literal("grill"),
  v.literal("raisedBed"),
  v.literal("acUnit"),
  v.literal("generator"),
  v.literal("woodpile"),
  v.literal("vehicle"),
  v.literal("rv"),
  v.literal("trailer"),
  v.literal("fence"),
  v.literal("custom"),
);

export const planZoneKindValidator = v.union(
  v.literal("driveway"),
  v.literal("shed"),
  v.literal("garden"),
  v.literal("fence"),
  v.literal("patio"),
  v.literal("custom"),
);

export const planWallValidator = v.object({
  x1: v.number(),
  y1: v.number(),
  x2: v.number(),
  y2: v.number(),
  thicknessIn: v.number(),
  heightIn: v.number(),
});

export const planRoomValidator = v.object({
  points: v.array(planPointValidator),
  fillColor: v.optional(v.string()),
});

export const planOpeningValidator = v.object({
  wallShortId: v.string(),
  offsetAlongWallIn: v.number(),
  widthIn: v.number(),
  kind: planOpeningKindValidator,
  swing: planOpeningSwingValidator,
  sillHeightIn: v.optional(v.number()),
  headHeightIn: v.optional(v.number()),
});

export const planFeatureValidator = v.object({
  x: v.number(),
  y: v.number(),
  rotationDeg: v.number(),
  featureKind: planFeatureKindValidator,
  widthIn: v.number(),
  depthIn: v.number(),
  heightIn: v.optional(v.number()),
  label: v.optional(v.string()),
});

export const planZoneValidator = v.object({
  points: v.array(planPointValidator),
  zoneKind: planZoneKindValidator,
});

export const planAnnotationValidator = v.object({
  x: v.number(),
  y: v.number(),
  text: v.string(),
  fontSizeIn: v.optional(v.number()),
});

export const planFootprintOverrideValidator = v.object({
  lengthIn: v.number(),
  widthIn: v.number(),
});

export const planContainmentModeValidator = v.union(
  v.literal("inside"),
  v.literal("onTop"),
);

export const planOpActorTypeValidator = v.union(
  v.literal("user"),
  v.literal("apiKey"),
);

export const planOpValidator = v.any();
