// Quote-only demo: deliberately has no shipment, label or pickup creation endpoints.
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const args = process.argv.slice(2);
const flags = new Set(['--sandbox', '--mas-barata', '--help']);
const numeric = ['--peso', '--largo', '--ancho', '--alto'];
const values = {};
for (let i = 0; i < args.length; i++) {
  if (numeric.includes(args[i])) {
    const name = args[i], value = Number(args[++i]);
    if (!Number.isFinite(value) || value <= 0) throw Error(`${name} requiere un número mayor que cero.`);
    values[name] = value;
  } else if (!flags.has(args[i])) throw Error(`Opción desconocida: ${args[i]}. Usa --help.`);
}
if (args.includes('--help')) {
  console.log('node editorial/scripts/demo-cotizacion.mjs [--mas-barata] [--sandbox] [--peso 0.285] [--largo 12] [--ancho 9] [--alto 5]\nPeso en kg; medidas en cm. Origen: dirección configurada de Marlo (ZMG). Destino: Centro, Cuauhtémoc, CDMX, CP 06000. Solo cotiza y selecciona; no compra guías.');
  process.exit(0);
}

async function main() {
  const sandbox = args.includes('--sandbox');
  const file = new URL(`../.dev.vars.${sandbox ? 'sandbox' : 'production'}`, import.meta.url);
  const env = {};
  try {
    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const raw = m[2].trim();
      env[m[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw.replace(/^'|'$/g, '');
    }
  } catch { throw Error(`No se pudo leer .dev.vars.${sandbox ? 'sandbox' : 'production'}. No pegues credenciales en la consola.`); }
  for (const key of ['SKYDROPX_CLIENT_ID', 'SKYDROPX_CLIENT_SECRET', 'SHIPPING_ORIGIN_JSON']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  if (!env.SKYDROPX_CLIENT_ID || !env.SKYDROPX_CLIENT_SECRET) throw Error('Faltan credenciales del servicio de cotización.');
  // Sandbox may omit the real origin; use the established quotation-only test origin.
  let origin;
  try { origin = env.SHIPPING_ORIGIN_JSON ? JSON.parse(env.SHIPPING_ORIGIN_JSON) : sandbox ? {country_code:'MX',postal_code:'45066',area_level1:'Jalisco',area_level2:'Zapopan',area_level3:'Natura Bosque Residencial'} : null; }
  catch { throw Error('SHIPPING_ORIGIN_JSON no es JSON válido.'); }
  if (!origin) throw Error('Falta SHIPPING_ORIGIN_JSON.');
  // Send only the address geography required to quote, not personal contact data.
  const address_from = Object.fromEntries(['country_code','postal_code','area_level1','area_level2','area_level3'].map(k => [k, origin[k]]));
  if (Object.values(address_from).some(v => !v)) throw Error('El origen no tiene todos los datos geográficos para cotizar.');
  const address_to = {country_code:'MX',postal_code:'06000',area_level1:'Ciudad de México',area_level2:'Cuauhtémoc',area_level3:'Centro (Área 1)'};
  const parcel = {length:values['--largo'] ?? 12,width:values['--ancho'] ?? 9,height:values['--alto'] ?? 5,weight:values['--peso'] ?? 0.285};
  const base = sandbox ? 'https://sb-pro.skydropx.com' : 'https://api-pro.skydropx.com';
  console.log(`\nMARLO GAMES · COTIZACIÓN ${sandbox ? 'SANDBOX' : 'REAL'} · Sin compra de guía`);
  console.log(`Origen: ${origin.area_level2}, ${origin.area_level1}, CP ${origin.postal_code} (zona de Guadalajara)`);
  console.log('Destino: Centro, Cuauhtémoc, CDMX · CP 06000');
  console.log(`Paquete de ejemplo: ${parcel.length} × ${parcel.width} × ${parcel.height} cm · ${parcel.weight} kg\n`);
  let token;
  async function request(path, body, auth = false) {
    let response;
    try {
      response = await fetch(base + path, {method:body ? 'POST' : 'GET',headers:auth ? {'Content-Type':'application/x-www-form-urlencoded'} : {Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body ? auth ? new URLSearchParams(body) : JSON.stringify(body) : undefined,signal:AbortSignal.timeout(20000)});
    } catch { throw Error('No se pudo conectar con el servicio de cotización o se agotó el tiempo de espera.'); }
    if (!response.ok) throw Error(`El servicio de cotización respondió HTTP ${response.status} al ${auth ? 'autenticar' : 'cotizar'}. No se creó ningún envío.`);
    return response.json();
  }
  token = (await request('/api/v1/oauth/token',{grant_type:'client_credentials',client_id:env.SKYDROPX_CLIENT_ID,client_secret:env.SKYDROPX_CLIENT_SECRET},true)).access_token;
  if (!token) throw Error('No se recibió una autorización válida para cotizar.');
  console.log('Consultando paqueterías disponibles…');
  let quotation = await request('/api/v1/quotations',{quotation:{address_from,address_to,parcels:[parcel]}});
  if (!quotation.id) throw Error('La respuesta no contiene un ID de cotización.');
  for (let i=0;i<30 && quotation.is_completed !== true;i++) {
    await new Promise(resolve => setTimeout(resolve,1000));
    quotation = await request('/api/v1/quotations/'+encodeURIComponent(quotation.id));
  }
  if (quotation.is_completed !== true) throw Error('La cotización sigue incompleta. Vuelve a intentar; no se elegirá una tarifa parcial.');
  const all = Array.isArray(quotation.rates) ? quotation.rates : [];
  const rates = all.filter(r=>r.success===true && r.currency_code==='MXN' && r.total!==null && r.total!=='' && Number.isFinite(Number(r.total)) && Number(r.total)>0).sort((a,b)=>Number(a.total)-Number(b.total));
  if (!rates.length) throw Error('No se recibieron tarifas válidas en MXN para esta ruta y paquete.');
  const money = v => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(v));
  console.table(rates.map((r,i)=>({Opción:i+1,Paquetería:r.provider_name,Servicio:r.provider_service_name || r.provider_service_code,Precio:money(r.total),Moneda:'MXN',Días:r.days ?? 'Sin estimación',Condiciones:[r.office_delivery ? 'Opción de sucursal disponible' : 'Sin opción de sucursal indicada',r.requires_origin_verification ? 'Verificar origen' : '',r.pickup_package_min>1 ? `Recolección mínima: ${r.pickup_package_min} paquetes` : ''].filter(Boolean).join('; ')})));
  console.log(`Se muestran ${rates.length} servicios disponibles para esta ruta; no necesariamente todas las paqueterías del mercado. ${all.length-rates.length} respuestas sin tarifa válida en MXN.`);
  console.log(`Más barata: opción 1 · ${rates[0].provider_name} · ${money(rates[0].total)} MXN.`);
  let selection = 1;
  if (!args.includes('--mas-barata') && stdin.isTTY) {
    const rl = createInterface({input:stdin,output:stdout});
    try {
      for (;;) {
        const answer = (await rl.question('\nElige una opción [Enter = más barata, q = salir]: ')).trim();
        if (answer.toLowerCase()==='q') {console.log('Sin selección. No se creó ningún envío.');return;}
        if (answer==='' || /^\d+$/.test(answer) && Number(answer)>=1 && Number(answer)<=rates.length) {selection=answer==='' ? 1 : Number(answer);break;}
        console.log(`Escribe un número entre 1 y ${rates.length}.`);
      }
    } finally {rl.close();}
  }
  const chosen=rates[selection-1];
  console.log(`\nSELECCIONADA: ${chosen.provider_name} · ${chosen.provider_service_name || chosen.provider_service_code} · ${money(chosen.total)} MXN`);
  console.log(`Cotización: ${quotation.id}\nTarifa: ${chosen.id}\nSelección de demostración: no se compró guía ni se programó recolección. La tarifa cotizada puede cambiar; no modifica el precio de envío de la tienda.`);
}
main().catch(error=>{console.error('\n'+error.message);process.exitCode=1;});
