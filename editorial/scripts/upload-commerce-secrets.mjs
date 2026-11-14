import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
function read(name) {
  const file = new URL('.dev.vars.' + name, root);
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.includes('=')).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), JSON.parse(line.slice(i + 1))];
  }));
}
const production = read('production'), sandbox = read('sandbox'), secrets = {};
secrets.SHIPPING_SERVICES_JSON=JSON.stringify(JSON.parse(fs.readFileSync(new URL('data/shipping-services.json',root),'utf8')));
if(sandbox.MP_WEBHOOK_SECRET)secrets.MP_SANDBOX_WEBHOOK_SECRET=sandbox.MP_WEBHOOK_SECRET;
for (const key of ['MP_PUBLIC_KEY', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET','SKYDROPX_WEBHOOK_SECRET']) {
  if (production[key]) secrets[key] = production[key];
}
for (const key of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'SKYDROPX_CLIENT_ID', 'SKYDROPX_CLIENT_SECRET', 'SHIPPING_ORIGIN_JSON', 'RESEND_API_KEY', 'EMAIL_FROM', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'ADMIN_EMAILS']) {
  if (production[key]) secrets[key] = production[key];
}
for (const key of ['CLIENT_ID', 'CLIENT_SECRET', 'WEBHOOK_ID']) {
  if (sandbox['PAYPAL_' + key]) secrets['PAYPAL_SANDBOX_' + key] = sandbox['PAYPAL_' + key];
}
if (process.argv.includes('--mp-sandbox-only')) {
  if (!sandbox.MP_WEBHOOK_SECRET) throw Error('Sandbox webhook secret missing');
  for (const key of Object.keys(secrets)) if (key !== 'MP_SANDBOX_WEBHOOK_SECRET') delete secrets[key];
}
if (!Object.keys(secrets).length) throw Error('No configured secrets');
const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js', root)), 'secret', 'bulk', '--config', 'wrangler.production.jsonc'], {
  cwd: fileURLToPath(root), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
});
// Only report exit status and key names; provider values never enter console output.
child.stdout.resume(); child.stderr.resume();
child.stdin.end(JSON.stringify(secrets));
child.on('error', () => { console.error('Could not start Wrangler'); process.exitCode = 1; });
child.on('exit', code => { console.log(JSON.stringify({uploaded: code === 0, names: Object.keys(secrets), exitCode: code})); process.exitCode = code || 0; });
