import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const ownerEmail =
  valueAfter("--email") ?? process.env.SEED_USER_EMAIL ?? "demo@movingmanifest.local";
const ownerName =
  valueAfter("--name") ?? process.env.SEED_USER_NAME ?? "MovingManifest Demo Owner";
const reset = !args.includes("--append");
const deployment = deploymentArgs();

if (args.includes("--prod") || deployment.includes("--prod")) {
  console.error("Refusing to seed production. Use a Convex dev deployment.");
  process.exit(1);
}

const identity = {
  subject: `seed:${ownerEmail.toLowerCase()}`,
  issuer: "movingmanifest-seed",
  email: ownerEmail,
  name: ownerName,
};

const convexArgs = [
  "convex",
  "run",
  "seed:seedDemoData",
  JSON.stringify({ reset, confirm: "movingmanifest-dev-seed" }),
  "--identity",
  JSON.stringify(identity),
  "--push",
  ...deployment,
];

console.log("Seeding MovingManifest demo data into Convex dev deployment.");
console.log(`Owner email: ${ownerEmail}`);
console.log(`Reset existing demo data: ${reset ? "yes" : "no"}`);

const result = await run("npx", convexArgs);
if (result.code !== 0) {
  console.error(result.stderr || result.stdout || `convex run exited ${result.code}`);
  process.exit(result.code);
}

console.log(result.stdout.trim());

function valueAfter(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function deploymentArgs() {
  const index = args.indexOf("--deployment");
  if (index === -1) return [];
  const value = args[index + 1];
  if (!value) {
    console.error("--deployment requires a value.");
    process.exit(1);
  }
  if (value === "prod" || value === "production") {
    console.error("Refusing to seed production. Use a Convex dev deployment.");
    process.exit(1);
  }
  return ["--deployment", value];
}

function run(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: error.message });
    });
  });
}
