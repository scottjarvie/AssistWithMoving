import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => /^\s*[A-Z][A-Z0-9_]*\s*=/.test(line)).map(line => {
    const index = line.indexOf('=');
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    return [line.slice(0, index).trim(), value];
  }));
}
const permitted = new Set(['CONVEX_DEPLOYMENT','NEXT_PUBLIC_CONVEX_URL','NEXT_PUBLIC_CONVEX_SITE_URL','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','CLERK_SECRET_KEY','CLERK_FRONTEND_API_URL','CLERK_JWT_ISSUER_DOMAIN','NEXT_PUBLIC_CLERK_SIGN_IN_URL','NEXT_PUBLIC_CLERK_SIGN_UP_URL','LIBRARY_FILES_ORIGIN']);
export function validate(mode, values, config) {
  if (!['live','sandbox'].includes(mode)) throw new Error('Mode must be live or sandbox');
  const binding = config[mode];
  if (!binding?.deployment) throw new Error(`${mode} binding is not verified: ${binding?.blocker || 'explicit backend and identity configuration required'}`);
  if (mode === 'sandbox' && (!binding.deployment.startsWith('anonymous:') || binding.deployment.split(':')[1] === config.live?.deployment?.split(':')[1])) throw new Error('Sandbox must be a separate, verified development backend');
  if (values.CONVEX_DEPLOYMENT !== binding.deployment) throw new Error('Deployment does not match the verified mode binding');
  const slug = binding.deployment.split(':')[1];
  if (values.NEXT_PUBLIC_CONVEX_URL !== binding.backendURL) throw new Error('Frontend backend URL does not match deployment');
  if (values.NEXT_PUBLIC_CONVEX_SITE_URL && values.NEXT_PUBLIC_CONVEX_SITE_URL !== (mode === 'sandbox' ? binding.siteURL : `https://${slug}.convex.site`)) throw new Error('HTTP backend URL does not match deployment');
  const key = values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  if (!key.startsWith(mode === 'live' ? 'pk_live_' : 'pk_test_')) throw new Error('Clerk identity role does not match mode');
  if (binding.clerkHost && Buffer.from(key.slice(key.indexOf('_',3)+1),'base64').toString().replace(/\$$/,'') !== binding.clerkHost) throw new Error('Clerk identity does not match verified host');
  if (values.CLERK_SECRET_KEY) throw new Error('Sandbox must not load a production Clerk secret');
  if (values.CLERK_SECRET_KEY) throw new Error('Live server identity must use its matching production role');
  if (Object.keys(values).some(key => !permitted.has(key))) throw new Error('Mode file contains unsupported credentials or provider settings; keep it sanitized');
  return values;
}
export function environment(root, values, mode, inherited = process.env) {
  const result = { ...inherited };
  const names = new Set(Object.keys(result));
  for (const file of fs.readdirSync(root).filter(name => /^\.env(?:\.|$)/.test(name))) {
    if (fs.statSync(path.join(root,file)).isFile()) Object.keys(parseEnv(fs.readFileSync(path.join(root,file),'utf8'))).forEach(key => { names.add(key); result[key] = ''; });
  }
  // Empty strings take precedence over Next's dotenv files, including framework reloads.
  for (const name of names) if (/^(NEXT_PUBLIC_|CONVEX_|CLERK_|B2_|AWS_|OPENROUTER_|MCP_|CDN_|LIBRARY_|VERCEL|LOCAL_)/.test(name) || /(?:SECRET|TOKEN|API_KEY|PASSWORD)/.test(name)) result[name] = '';
  const config = JSON.parse(fs.readFileSync(path.join(root,'scripts/local-development.json'),'utf8'));
  const appOrigin = mode === 'live' ? `https://${config.hostname}` : `http://${config.sandbox.hostname}:${config.sandbox.port}`;
  return { ...result, ...values, NEXT_PUBLIC_APP_URL:appOrigin, CONVEX_DEPLOY_KEY:'', CONVEX_ADMIN_KEY:'', NODE_ENV:'development', LOCAL_DEVELOPMENT_MODE:mode, NEXT_PUBLIC_LOCAL_DEVELOPMENT_MODE:mode, WATCHPACK_POLLING:'true' };
}
export async function available(port) {
  for (const host of ['127.0.0.1', '::1']) {
    await new Promise((resolve,reject) => {
      const server = net.createServer();
      server.once('error', error => error.code === 'EADDRNOTAVAIL' && host === '::1' ? resolve() : reject(new Error(`Port ${port} is occupied; identify its owner rather than switching ports or killing it`)));
      server.listen(port,host,() => server.close(resolve));
    });
  }
}
async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const config = JSON.parse(fs.readFileSync(path.join(root,'scripts/local-development.json'),'utf8'));
  const command = process.argv[2];
  if (command === 'status') {
    for (const mode of ['live','sandbox']) {
      let readiness;
      try { validate(mode,parseEnv(fs.readFileSync(path.join(root,`.env.local-${mode}`),'utf8')),config); readiness = 'public bindings valid; account login and browser persistence unverified; backend watcher disabled'; }
      catch (error) { readiness = error.code === 'ENOENT' ? `missing .env.local-${mode}; ${config[mode]?.blocker || 'setup required'}` : error.message; }
      console.log(JSON.stringify({project:config.project,mode,port:config[mode].port,hostname:config.hostname,deployment:config[mode].deployment || null,readiness}));
    }
    return;
  }
  if (!['live','sandbox','backend'].includes(command)) throw new Error('Use live, sandbox, backend or status');
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.CI) throw new Error('Local modes cannot run in hosted production or CI');
  const mode = command === 'backend' ? 'sandbox' : command;
  const file = path.join(root,`.env.local-${mode}`);
  const values = validate(mode,parseEnv(fs.readFileSync(file,'utf8')),config);
  const env = environment(root,values,mode);
  let args;
  if (command === 'backend') {
    throw new Error('Native backend startup/source push is coordinator-owned; no cloud watcher allowed.');
  } else {
    await available(config[mode].port);
    const hostname = '127.0.0.1';
    args = [path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname',hostname,'--port',String(config[mode].port)];
    console.log(`${mode}: http://${hostname}:${config[mode].port} -> ${values.NEXT_PUBLIC_CONVEX_URL}`);
  }
  const child = spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => child.kill(signal));
  child.once('error',error => {console.error(error.message);process.exitCode=1;});
  child.once('exit',(code,signal) => {process.exitCode=code ?? (signal ? 1 : 0);});
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`Local development refused: ${error.message}`); process.exitCode=1; });
