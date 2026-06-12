"use node";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { v } from "convex/values";
import sharp from "sharp";

import { internalAction } from "./_generated/server";
import {
  fileExtensionForMediaMimeType,
  mediaKindForMimeType,
  mediaObjectPrefix,
} from "./lib/mediaStorage";
import {
  serverDerivativeSpecs,
  type PhotoDerivativeVariant,
} from "./lib/imageDerivatives";

function requireB2Config() {
  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_REGION ?? "us-west-004";
  const bucketName = process.env.B2_BUCKET_NAME;
  const applicationKeyId = process.env.B2_APPLICATION_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;

  if (!endpoint || !bucketName || !applicationKeyId || !applicationKey) {
    throw new Error("Backblaze B2 is not configured.");
  }

  return {
    endpoint,
    region,
    bucketName,
    applicationKeyId,
    applicationKey,
  };
}

function b2Client() {
  const config = requireB2Config();

  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.applicationKeyId,
      secretAccessKey: config.applicationKey,
    },
  });
}

function uploadObjectKey({
  moveId,
  mimeType,
  prefix,
}: {
  moveId: string;
  mimeType: string;
  prefix?: string;
}) {
  const mediaKind = mediaKindForMimeType(mimeType);
  if (!mediaKind) {
    throw new Error("Unsupported media type.");
  }
  return `moves/${moveId}/${prefix ?? mediaObjectPrefix(mediaKind)}/${crypto.randomUUID()}.${fileExtensionForMediaMimeType(
    mimeType,
  )}`;
}

async function objectBodyToBuffer(body: unknown) {
  if (!body) {
    throw new Error("Uploaded image object was empty.");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray ===
    "function"
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (typeof (body as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    const arrayBuffer = await (
      body as { arrayBuffer: () => Promise<ArrayBuffer> }
    ).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  if (
    typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] ===
    "function"
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Could not read uploaded image bytes.");
}

export const generateFromOriginal = internalAction({
  args: {
    bucketName: v.string(),
    moveId: v.id("moves"),
    originalStorageKey: v.string(),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{
    derivativeRefs: Partial<Record<PhotoDerivativeVariant, string>>;
  }> => {
    const client = b2Client();
    const original = await client.send(
      new GetObjectCommand({
        Bucket: args.bucketName,
        Key: args.originalStorageKey,
      }),
    );
    const originalBytes = await objectBodyToBuffer(original.Body);
    const derivativeRefs: Partial<Record<PhotoDerivativeVariant, string>> = {};

    for (const spec of serverDerivativeSpecs) {
      const { data, info } = await sharp(originalBytes, { failOn: "none" })
        .rotate()
        .resize({
          width: spec.width,
          height: spec.height,
          fit: spec.fit,
          withoutEnlargement: spec.fit === "inside",
        })
        .webp({ quality: spec.quality })
        .toBuffer({ resolveWithObject: true });
      const storageKey = uploadObjectKey({
        moveId: args.moveId,
        mimeType: "image/webp",
        prefix: "photo-derivatives",
      });

      await client.send(
        new PutObjectCommand({
          Bucket: args.bucketName,
          Key: storageKey,
          Body: data,
          ContentType: "image/webp",
          ContentLength: data.byteLength,
          Metadata: {
            variant: spec.variant,
            width: String(info.width),
            height: String(info.height),
          },
        }),
      );
      derivativeRefs[spec.variant] = storageKey;
    }

    return { derivativeRefs };
  },
});
