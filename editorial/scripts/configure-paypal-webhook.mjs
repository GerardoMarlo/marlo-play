import fs from 'node:fs';
const sandbox = process.argv.includes('--sandbox');
const file = new URL('../.dev.vars.' + (sandbox ? 'sandbox' : 'production'), import.meta.url);
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const env = Object.fromEntries(lines.filter(line => line.includes('=')).map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), JSON.parse(line.slice(i + 1))];
}));
const host = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
const url = 'https://marlo.games/api/webhooks/paypal' + (sandbox ? '/sandbox' : '');
const auth = await fetch(host + '/v1/oauth2/token', {method: 'POST', signal: AbortSignal.timeout(20000), headers: {
  Authorization: 'Basic ' + Buffer.from(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET).toString('base64'),
  'Content-Type': 'application/x-www-form-urlencoded',
}, body: 'grant_type=client_credentials'});
if (!auth.ok) throw Error('PayPal OAuth HTTP ' + auth.status);
const token = (await auth.json()).access_token;
async function call(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(host + path, {method, signal: AbortSignal.timeout(20000),
    headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: body && JSON.stringify(body)});
  if (!res.ok) throw Error('PayPal API HTTP ' + res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}
const names = ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'];
const existing = (await call('/v1/notifications/webhooks')).webhooks.filter(hook => hook.url === url);
if (existing.length > 1) throw Error('Multiple matching webhooks; manual review required');
const hook = existing[0] || await call('/v1/notifications/webhooks', {url, event_types: names.map(name => ({name}))});
if (existing[0] && names.some(name => !hook.event_types.some(event => event.name === name || event.name === '*'))) {
  await call('/v1/notifications/webhooks/' + encodeURIComponent(hook.id), [{op: 'replace', path: '/event_types', value: names.map(name => ({name}))}], 'PATCH');
}
const verified = await call('/v1/notifications/webhooks/' + encodeURIComponent(hook.id));
if (verified.url !== url || names.some(name => !verified.event_types.some(event => event.name === name || event.name === '*'))) {
  console.log(JSON.stringify({url: verified.url, events: verified.event_types.map(event => event.name)}));
  throw Error('Webhook configuration mismatch');
}
fs.writeFileSync(file, [...lines.filter(line => !line.startsWith('PAYPAL_WEBHOOK_ID=')), 'PAYPAL_WEBHOOK_ID=' + JSON.stringify(hook.id)].join('\n'));
console.log(JSON.stringify({environment: sandbox ? 'sandbox' : 'live', url, verified: true, saved: true, events: names.length}));
