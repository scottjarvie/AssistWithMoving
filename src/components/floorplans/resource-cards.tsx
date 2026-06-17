"use client";

import Image from "next/image";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { floorplanResources } from "@/lib/floorplans/sample-data";

export function ResourceCards({
  onResourceSelect,
}: {
  onResourceSelect?: (resourceId: string) => void;
}) {
  const [reviewResourceId, setReviewResourceId] = useState<string | null>(null);
  const reviewResource =
    floorplanResources.find((resource) => resource.id === reviewResourceId) ??
    null;

  return (
    <>
      <div className="grid gap-2">
        {floorplanResources.map((resource, index) => (
          <Card
            className="transition hover:ring-primary/45"
            key={resource.id}
            size="sm"
          >
            <CardHeader>
              <div>
                <CardTitle>{resource.title}</CardTitle>
                <CardDescription>{resource.description}</CardDescription>
              </div>
              <CardAction>
                <Badge
                  variant={resource.status === "sample" ? "secondary" : "default"}
                >
                  {resource.status}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {resource.imageSrc ? (
                <button
                  aria-label={`Review ${resource.title}`}
                  className="group relative block w-full overflow-hidden rounded-md border border-border bg-background text-left"
                  onClick={() => {
                    setReviewResourceId(resource.id);
                    onResourceSelect?.(resource.id);
                  }}
                  type="button"
                >
                  <Image
                    alt=""
                    className="h-28 w-full object-cover transition group-hover:scale-[1.02]"
                    height={240}
                    loading={index === 0 ? "eager" : "lazy"}
                    sizes="(min-width: 1024px) 380px, 100vw"
                    src={resource.imageSrc}
                    unoptimized
                    width={420}
                  />
                  <span className="absolute bottom-2 right-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm">
                    Review image
                  </span>
                </button>
              ) : null}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {resource.fileName ? (
                  <Badge variant="outline">{resource.fileName}</Badge>
                ) : null}
                {resource.dimensionsLabel ? (
                  <Badge variant="outline">{resource.dimensionsLabel}</Badge>
                ) : null}
                {resource.capturedAtLabel ? (
                  <Badge variant="outline">{resource.capturedAtLabel}</Badge>
                ) : null}
              </div>
              <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                {resource.proves.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <ResourceImageReviewSheet
        onOpenChange={(open) => {
          if (!open) setReviewResourceId(null);
        }}
        resource={reviewResource}
      />
    </>
  );
}

function ResourceImageReviewSheet({
  onOpenChange,
  resource,
}: {
  onOpenChange: (open: boolean) => void;
  resource: (typeof floorplanResources)[number] | null;
}) {
  const open = Boolean(resource?.imageSrc);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="h-[92dvh] max-h-[92dvh] sm:max-w-none lg:w-[70vw] lg:max-w-[70vw]"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>{resource?.title ?? "Evidence image"}</SheetTitle>
          <SheetDescription>
            Review this source image before accepting or changing extracted
            measurements.
          </SheetDescription>
        </SheetHeader>
        {resource?.imageSrc ? (
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-auto rounded-md border border-border bg-background">
                <Image
                  alt={resource.title}
                  className="h-auto min-w-[720px] max-w-none lg:min-w-0 lg:w-full"
                  height={1200}
                  loading="eager"
                  sizes="(min-width: 1024px) 70vw, 720px"
                  src={resource.imageSrc}
                  unoptimized
                  width={1800}
                />
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="font-medium">What this source proves</div>
                  <ul className="mt-2 space-y-2 text-muted-foreground">
                    {resource.proves.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-border bg-card p-3 text-muted-foreground">
                  <div className="font-medium text-foreground">
                    Resource metadata
                  </div>
                  <div className="mt-2 grid gap-1">
                    {resource.fileName ? (
                      <div>File: {resource.fileName}</div>
                    ) : null}
                    {resource.dimensionsLabel ? (
                      <div>Image size: {resource.dimensionsLabel}</div>
                    ) : null}
                    {resource.capturedAtLabel ? (
                      <div>Source: {resource.capturedAtLabel}</div>
                    ) : null}
                    <div>Status: {resource.status}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
