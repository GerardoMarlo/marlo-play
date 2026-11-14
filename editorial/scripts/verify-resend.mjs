// Uses the private production file. Never prints credentials or message bodies.
import fs from 'node:fs';
const file = new URL('../.dev.vars.production', import.meta.url);
const env = Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .filter(line => line.includes('='))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i), JSON.parse(line.slice(i + 1))]; }));
if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
  console.log(JSON.stringify({status: 'BLOCKED', missing: ['RESEND_API_KEY', 'EMAIL_FROM'].filter(key => !env[key])}));
  process.exit(1);
}
if (!process.argv.includes('--send-test')) {
  console.log(JSON.stringify({configured: true, sent: false}));
  process.exit(0);
}
const body = {
  from: env.EMAIL_FROM,
  to: ['delivered+marlo-onboarding@resend.dev'],
  subject: 'Marlo Games — prueba de configuración',
  html: '<h1>Marlo Games</h1><p>Prueba técnica de envío. No corresponde a una compra ni confirma un pago.</p>',
  text: 'Marlo Games: prueba técnica de envío. No corresponde a una compra ni confirma un pago.',
};
const key = 'marlo-onboarding-' + new Date().toISOString().slice(0, 10);
const results = [];
for (let attempt = 0; attempt < 2; attempt++) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: {Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': key},
    body: JSON.stringify(body),
  });
  const result = await response.json();
  results.push({httpStatus: response.status, id: result.id, error: result.name});
  if (!response.ok) break;
}
console.log(JSON.stringify({results, accepted: !!results[0]?.id, duplicatePrevented: results.length === 2 && !!results[0].id && results[0].id === results[1].id,
  note: 'Resend test recipient; acceptance does not prove delivery to a customer inbox.'}));
