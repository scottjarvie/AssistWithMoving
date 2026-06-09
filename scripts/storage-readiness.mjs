import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";

const strict = process.argv.includes("--strict");
const requiredEnv = [
  "B2_ENDPOINT",
  "B2_REGION",
  "B2_BUCKET_NAME",
  "B2_APPLICATION_KEY_ID",
  "B2_APPLICATION_KEY",
];
export const requiredCorsOrigins = [
  "http://localhost:3827",
  "https://movingmanifest.com",
  "https://www.movingmanifest.com",
  "https://*.vercel.app",
];
export const requiredCorsMethods = ["PUT", "GET", "HEAD"];
export const recommendedS3CorsConfiguration = {
  CORSRules: [
    {
      AllowedOrigins: requiredCorsOrigins,
      AllowedMethods: requiredCorsMethods,
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
};
export const recommendedBackblazeNativeCorsRules = [
  {
    corsRuleName: "movingmanifest-upload",
    allowedOrigins: requiredCorsOrigins,
    allowedHeaders: ["*"],
    allowedOperations: ["s3_put", "s3_get", "s3_head"],
    exposeHeaders: ["ETag"],
    maxAgeSeconds: 3600,
  },
];
const results = [];

function record(status, label, detail) {
  results.push({ status, label, detail });
}

function displayHost(value) {
  if (!value) return "missing";
  try {
    return new URL(value).host;
  } catch {
    return "invalid URL";
  }
}

function displayBucket() {
  return process.env.B2_BUCKET_NAME ? "{configured-bucket}" : "missing";
}

function displayNativeError(body) {
  if (!body || typeof body !== "object") return "unknown error";
  return [body.code, body.message].filter(Boolean).join(": ") || "unknown error";
}

function normalizeOrigin(origin) {
  return origin.trim().replace(/\/+$/, "");
}

export function corsOriginAllows(requiredOrigin, allowedOrigin) {
  const required = normalizeOrigin(requiredOrigin);
  const allowed = normalizeOrigin(allowedOrigin);
  if (!required || !allowed) return false;
  if (allowed === "*") return true;
  if (allowed === "https") return required.startsWith("https://");
  if (allowed === "http") return required.startsWith("http://");
  if (allowed === required) return true;
  if (!allowed.includes("*")) return false;

  const pattern = allowed
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${pattern}$`).test(required);
}

export function missingCorsRequirements(
  rules,
  origins = requiredCorsOrigins,
  methods = requiredCorsMethods
) {
  const allowedOrigins = rules.flatMap((rule) => rule.AllowedOrigins ?? []);
  const allowedMethods = new Set(
    rules.flatMap((rule) => rule.AllowedMethods ?? [])
  );
  return {
    origins: origins.filter(
      (origin) =>
        !allowedOrigins.some((allowedOrigin) =>
          corsOriginAllows(origin, allowedOrigin)
        )
    ),
    methods: methods.filter((method) => !allowedMethods.has(method)),
  };
}

export function corsAdministrationGuidance(allowed) {
  const capabilities = new Set(allowed?.capabilities ?? []);
  const bucketScoped = Boolean(allowed?.bucketName);
  if (capabilities.has("writeBuckets")) {
    return {
      status: "warn",
      detail:
        "this key can administer bucket-level CORS; use it only for setup and do not deploy it as app runtime credentials",
    };
  }

  return {
    status: "warn",
    detail: bucketScoped
      ? "runtime key is bucket-scoped; keep it that way and use the Backblaze dashboard or a separate admin key for CORS changes"
      : "key lacks writeBuckets; use the Backblaze dashboard or a separate admin key for CORS changes",
  };
}

async function checkEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    record("fail", "environment", `missing ${missing.join(", ")}`);
    return false;
  }

  record(
    "pass",
    "environment",
    `all required B2 env vars present; endpoint ${displayHost(process.env.B2_ENDPOINT)}, bucket ${displayBucket()}`
  );
  return true;
}

async function checkNativeAuthorize() {
  const keyId = process.env.B2_APPLICATION_KEY_ID ?? "";
  const key = process.env.B2_APPLICATION_KEY ?? "";
  const auth = Buffer.from(`${keyId}:${key}`).toString("base64");
  const response = await fetch(
    "https://api.backblazeb2.com/b2api/v3/b2_authorize_account",
    { headers: { Authorization: `Basic ${auth}` } }
  );
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    record(
      "blocked",
      "Backblaze native auth",
      `HTTP ${response.status} ${displayNativeError(body)}`
    );
    return null;
  }

  const storageApi = body?.apiInfo?.storageApi;
  const allowed = storageApi?.allowed;
  record(
    "pass",
    "Backblaze native auth",
    `authorized; S3 host ${displayHost(storageApi?.s3ApiUrl)}; bucket scope ${
      allowed?.bucketName ? "{scoped-bucket}" : "account-wide or unspecified"
    }; capabilities ${(allowed?.capabilities ?? []).join(", ") || "none"}`
  );
  const corsAdmin = corsAdministrationGuidance(allowed);
  record(corsAdmin.status, "CORS administration key", corsAdmin.detail);
  return body;
}

function createS3Client() {
  return new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: process.env.B2_REGION,
    credentials: {
      accessKeyId: process.env.B2_APPLICATION_KEY_ID ?? "",
      secretAccessKey: process.env.B2_APPLICATION_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

function storageErrorDetail(error) {
  const status = error?.$metadata?.httpStatusCode;
  const code = error?.Code ?? error?.code ?? error?.name;
  const message = error?.message;
  return [status ? `HTTP ${status}` : null, code, message]
    .filter(Boolean)
    .join(" ");
}

async function checkS3(client) {
  const bucket = process.env.B2_BUCKET_NAME;
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  record("pass", "S3 bucket", "head bucket succeeded");

  const key = `diagnostics/codex-${Date.now()}.txt`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: "MovingManifest Backblaze readiness diagnostic.",
      ContentType: "text/plain",
    })
  );
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key })
  );
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  record(
    "pass",
    "S3 object lifecycle",
    `temporary put/head/delete succeeded; bytes ${head.ContentLength ?? "unknown"}`
  );
}

async function checkCors(client) {
  try {
    const cors = await client.send(
      new GetBucketCorsCommand({ Bucket: process.env.B2_BUCKET_NAME })
    );
    const rules = cors.CORSRules ?? [];
    const { origins: missingOrigins, methods: missingMethods } =
      missingCorsRequirements(rules);

    if (missingOrigins.length || missingMethods.length) {
      record(
        "blocked",
        "bucket CORS",
        `missing origins ${
          missingOrigins.join(", ") || "none"
        }; missing methods ${missingMethods.join(", ") || "none"}`
      );
      return;
    }

    record(
      "pass",
      "bucket CORS",
      `required origins and PUT/GET/HEAD methods are configured`
    );
  } catch (error) {
    record("blocked", "bucket CORS", storageErrorDetail(error));
  }
}

function shouldPrintCorsPlan() {
  return results.some(
    (result) =>
      result.status !== "pass" &&
      ["Backblaze native auth", "S3 bucket", "bucket CORS"].includes(
        result.label
      )
  );
}

async function main() {
  if (!(await checkEnv())) return;
  await checkNativeAuthorize();

  const client = createS3Client();
  try {
    await checkS3(client);
  } catch (error) {
    record("blocked", "S3 bucket", storageErrorDetail(error));
    return;
  }

  await checkCors(client);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();

  const counts = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, blocked: 0, fail: 0 }
  );

  for (const result of results) {
    const label =
      result.status === "pass"
        ? "PASS"
        : result.status === "warn"
          ? "WARN"
          : result.status === "blocked"
            ? "BLOCKED"
            : "FAIL";
    console.log(`${label} ${result.label}: ${result.detail}`);
  }

  if (shouldPrintCorsPlan()) {
    console.log("");
    console.log(
      "Recommended Backblaze S3-compatible CORS configuration for presigned browser uploads:"
    );
    console.log(JSON.stringify(recommendedS3CorsConfiguration, null, 2));
    console.log("");
    console.log(
      "Equivalent Backblaze native custom CORS rule if configuring through the B2 CLI/custom rules UI:"
    );
    console.log(JSON.stringify(recommendedBackblazeNativeCorsRules, null, 2));
    console.log(
      "Dashboard note: if Backblaze asks which API the rule applies to, choose S3-compatible API or Both for MovingManifest uploads."
    );
    console.log(
      "Key note: keep the app runtime B2 key bucket-scoped for file read/write; use the dashboard or a separate admin key for bucket-level CORS changes."
    );
    console.log(
      "Security note: avoid broad all-origin CORS for launch unless it is a temporary debugging step."
    );
  }

  console.log(
    `Storage readiness summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
  );
  console.log(
    strict
      ? "Strict mode: failures and blockers exit nonzero."
      : "Default mode: only missing env or script failures exit nonzero. Use --strict for launch gating."
  );

  if (counts.fail > 0 || (strict && counts.blocked > 0)) {
    process.exitCode = 1;
  }
}
