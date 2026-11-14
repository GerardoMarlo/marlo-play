import fs from 'node:fs';
const checks = [];
for (const path of ['/admin', '/admin/', '/api/admin/session', '/api/admin/overview']) {
  const response = await fetch('https://marlo.games' + path, {redirect:'manual',signal:AbortSignal.timeout(15000)});
  const location = response.headers.get('location');
  const target = location ? new URL(location) : null;
  checks.push({path,status:response.status,team:target?.hostname,audience:target?.searchParams.get('kid')});
}
if (checks.some(check => check.status !== 302 || !check.team?.endsWith('.cloudflareaccess.com') || !/^[a-f0-9]{64}$/.test(check.audience || '')) ||
    checks.some(check => check.team !== checks[0].team || check.audience !== checks[0].audience)) {
  console.log(JSON.stringify({verified:false,checks})); process.exit(1);
}
const file = new URL('../.dev.vars.production', import.meta.url);
const lines = fs.readFileSync(file,'utf8').split(/\r?\n/).filter(line => !line.startsWith('ACCESS_TEAM_DOMAIN=') && !line.startsWith('ACCESS_AUD='));
lines.push('ACCESS_TEAM_DOMAIN='+JSON.stringify(checks[0].team),'ACCESS_AUD='+JSON.stringify(checks[0].audience));
fs.writeFileSync(file,lines.join('\n'));
console.log(JSON.stringify({verified:true,checks,configurationSaved:true}));
