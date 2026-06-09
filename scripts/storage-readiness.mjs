import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const strict = process.argv.includes("--strict");
const requiredEnv = [
  "B2_ENDPOINT",
  "B2_REGION",
  "B2_BUCKET_NAME",
  "B2_APPLICATION_KEY_ID",
  "B2_APPLICATION_KEY",
];
const requiredCorsOrigins = [
  "http://localhost:3827",
  "https://movingmanifest.com",
  "https://www.movingmanifest.com",
  "https://*.vercel.app",
];
const requiredCorsMethods = ["PUT", "GET", "HEAD"];
const recommendedCorsRule = {
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
    const allowedOrigins = new Set(
      rules.flatMap((rule) => rule.AllowedOrigins ?? [])
    );
    const allowedMethods = new Set(
      rules.flatMap((rule) => rule.AllowedMethods ?? [])
    );
    const missingOrigins = requiredCorsOrigins.filter(
      (origin) => !allowedOrigins.has(origin) && !allowedOrigins.has("*")
    );
    const missingMethods = requiredCorsMethods.filter(
      (method) => !allowedMethods.has(method)
    );

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
    "Recommended Backblaze custom CORS rule after valid scoped credentials exist:"
  );
  console.log(JSON.stringify(recommendedCorsRule, null, 2));
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
