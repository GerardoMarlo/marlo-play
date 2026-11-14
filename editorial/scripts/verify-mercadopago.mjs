import fs from 'node:fs';
// Read-only authentication check. Never log credentials or account details.
for (const environment of ['sandbox', 'production']) {
  const file = new URL('../.dev.vars.' + environment, import.meta.url);
  const env = fs.existsSync(file) ? Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i), JSON.parse(l.slice(i + 1))];
  })) : {};
  const presence = Object.fromEntries(['MP_PUBLIC_KEY', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET'].map(k => [k, Boolean(env[k])]));
  if (!env.MP_ACCESS_TOKEN) { console.log(JSON.stringify({environment, presence, authenticated:false})); continue; }
  try {
    const response = await fetch('https://api.mercadopago.com/users/me', {headers:{Authorization:'Bearer ' + env.MP_ACCESS_TOKEN}, signal:AbortSignal.timeout(20000)});
    const data = await response.json();
    console.log(JSON.stringify({environment, presence, httpStatus:response.status, authenticated:response.ok && Boolean(data.id), testAccount:Array.isArray(data.tags) ? data.tags.includes('test_user') : null}));
  } catch { console.log(JSON.stringify({environment,presence,error:'Authentication check could not complete'})); process.exitCode=1; }
}
