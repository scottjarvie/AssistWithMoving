// Prepare a source-owned record-only snapshot. Never starts or pushes a backend.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(resolve(root,'scripts/local-development.json'),'utf8'));
const destination = resolve(root,'sandbox-backend');
if (existsSync(resolve(destination,'.convex'))) throw new Error('Persistent native state exists: preserve it; do not regenerate in place.');
if (existsSync(destination)) throw new Error('Snapshot exists: preserve or archive it explicitly before source preparation.');
mkdirSync(destination,{recursive:true});
const archive=resolve(destination,'.tracked-source.tar');
execFileSync('git',['archive','--output',archive,'HEAD'],{cwd:root});
execFileSync('tar',['-xf',archive,'-C',destination]);
unlinkSync(archive);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}
const rewritten = [];
for (const file of files(`${destination}/convex`)) {
  const name = relative(`${destination}/convex`, file);
  if (name.startsWith('_generated/') || name.startsWith('tests/') || !/\.[jt]s$/.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  // All runtime builders must pass through the refusal wrapper. Preserve typed queries/mutations and ownership helpers.
  if (/\b(?:actionGeneric|internalActionGeneric|httpActionGeneric)\b/.test(source)) throw new Error(`Unreviewed direct action builder: ${name}`);
  const updated = source.replace(/(['"])(\.{1,2}(?:\/\.\.)*\/)_(?:generated)\/server(?:\.js)?\1/g, (_match, quote, prefix) => `${quote}${prefix}_local/recordOnlyServer${quote}`);
  if (updated !== source) { writeFileSync(file, updated); rewritten.push(name); }
}
mkdirSync(`${destination}/convex/_local`, { recursive: true });
writeFileSync(`${destination}/convex/_local/recordOnlyServer.ts`, `// Native Sandbox snapshot only. Generated builders remain untouched by codegen.
export * from '../_generated/server';
import { action as realAction, internalAction as realInternalAction, httpAction as realHttpAction } from '../_generated/server';
async function refuse() { throw new Error('SANDBOX_RECORD_ONLY: provider, network, HTTP and background actions are disabled.'); }
function blockedDefinition(definition: unknown) {
  return { ...(definition && typeof definition === 'object' ? definition : {}), handler: refuse };
}
export const action = ((definition: unknown) => realAction(blockedDefinition(definition) as never)) as typeof realAction;
export const internalAction = ((definition: unknown) => realInternalAction(blockedDefinition(definition) as never)) as typeof realInternalAction;
export const httpAction = (() => realHttpAction(refuse)) as typeof realHttpAction;
`);
writeFileSync(`${destination}/convex/auth.config.ts`, `export default { providers: [{ domain: 'https://${config.sandbox.clerkHost}', applicationID: 'convex' }] };\n`);
writeFileSync(`${destination}/convex/crons.ts`, "import { cronJobs } from 'convex/server';\nexport default cronJobs();\n");
writeFileSync(`${destination}/prepared-source.json`, JSON.stringify({ source:root,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),deployment:config.sandbox.deployment,api:config.sandbox.backendURL,site:config.sandbox.siteURL,issuer:'https://'+config.sandbox.clerkHost,audience:'convex',buildersRewritten:rewritten,actionsDisabled:true,cronsDisabled:true,state:'Offline source only; empty native provisioning/push/environment/browser proof pending. No data or dotenv copied.'},null,2)+'\n');
console.log(JSON.stringify({destination,rewrittenBuilders:rewritten.length,state:'Offline source only; no backend started or pushed'}));
