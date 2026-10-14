/** @fileoverview Explicit, fail-closed local data-mode startup; no production release commands. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = JSON.parse(readFileSync(new URL('../config/local-development.json', import.meta.url), 'utf8'));
const mode = process.argv[2] || 'status';
function readEnv(file) { return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}; }
function safeEnv(selected) {
  // First blank every key a framework dotenv reload could resurrect, including
  // inherited provider credentials. Then install ONLY this mode's allowlist.
  const env = { ...process.env };
  for (const file of readdirSync('.').filter(name => /^\.env(?:\.|$)/.test(name))) {
    for (const key of Object.keys(readEnv(file))) env[key] = '';
  }
  for (const key of Object.keys(env)) {
    if (/CONVEX|CLERK|B2_|BACKBLAZE|OPENAI|ANTHROPIC|RESEND|REPLICATE|API_KEY|DEPLOY_KEY|VERCEL/.test(key)) env[key] = '';
  }
  const allowed = /^(NEXT_PUBLIC_CLERK_|CLERK_SECRET_KEY$|CLERK_JWT_ISSUER_DOMAIN$|CLERK_INSTANCE_MODE$|NEXT_PUBLIC_CONVEX_|CONVEX_DEPLOYMENT$|CONVEX_HTTP_ACTIONS_URL$|AFT_API_BASE_URL$|NEXT_PUBLIC_APP_URL$|NEXT_PUBLIC_SITE_URL$|APP_ORIGIN$)/;
  for (const [key, value] of Object.entries(selected)) if (allowed.test(key)) env[key] = value;
  env.CONVEX_DEPLOY_KEY = '';
  env.NODE_ENV = 'development';
  return env;
}
function validateSandbox(env) {
  if (config.sandboxBlocker) throw new Error(config.sandboxBlocker);
  if (!config.production || config.sandbox === config.production) throw new Error('Production/development isolation is unconfirmed.');
  const deployment = (env.CONVEX_DEPLOYMENT || '').split(/\s|#/)[0];
  if (deployment !== `dev:${config.sandbox}`) throw new Error('Configured deployment differs from the explicitly inspected development target.');
  if (env.NEXT_PUBLIC_CONVEX_URL !== `https://${config.sandbox}.convex.cloud`) throw new Error('Frontend backend URL differs from named Sandbox.');
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')) throw new Error('Sandbox requires existing development identity.');
  if (!env.CLERK_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Sandbox server requires matching existing development Clerk credentials.');
}
function freePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is occupied; inspect its owner. No alternate port is selected.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
try {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Local-only launcher refuses hosted/production runtime.');
  const env = safeEnv(readEnv('.env.local'));
  if (mode === 'status') {
    let sandboxStatus = 'frontend configuration ready; login/write/media not observed';
    try { validateSandbox(env); } catch (error) { sandboxStatus = `blocked: ${error.message}`; }
    console.log(JSON.stringify({ project: config.project, productionDomain: config.domain, live: { port: config.livePort, backend: config.production, status: `blocked: ${config.liveBlocker}` }, sandbox: { port: config.sandboxPort, backend: config.sandbox, status: sandboxStatus }, media: 'Local provider secrets blanked; no media/paid operation acceptance proof', source: 'uncommitted local setup; no deployment or backend push' }, null, 2));
  } else if (mode === 'live') {
    throw new Error(config.liveBlocker);
  } else if (mode === 'sandbox' || mode === 'backend') {
    validateSandbox(env);
    if (mode === 'backend') {
      throw new Error(`Development watcher is withheld pending review of existing dirty backend work and deployment-side provider operations. Named target: dev:${config.sandbox}. No backend was pushed.`);
    }
    await freePort(config.sandboxPort);
    env.NEXT_PUBLIC_LOCAL_DATA_MODE = 'sandbox';
    env.ASSIST_LOCAL_DIST = '.next/local-sandbox';
    env.NEXT_PUBLIC_APP_URL = `http://localhost:${config.sandboxPort}`;
    env.NEXT_PUBLIC_SITE_URL = `http://localhost:${config.sandboxPort}`;
    env.APP_ORIGIN = `http://localhost:${config.sandboxPort}`;
    console.log(`Local Sandbox · ${config.sandbox} · http://localhost:${config.sandboxPort}. Synthetic records only; local server provider operations disabled.`);
    const webpackFlags = Number(require('next/package.json').version.split('.')[0]) >= 16 ? ['--webpack'] : [];
    const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', ...webpackFlags, '--hostname', '127.0.0.1', '--port', String(config.sandboxPort)], { env, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('exit', code => process.exit(code || 0));
  } else throw new Error('Use live, sandbox, backend or status.');
} catch (error) { console.error(`Local development refused: ${error.message}`); process.exitCode = 1; }
