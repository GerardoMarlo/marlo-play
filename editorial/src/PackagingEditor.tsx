import {useEffect,useState} from 'react';
import {api} from './api';
import {packagingConfigSchema,planPackaging,type PackagingConfig} from './packaging';
import {money} from './domain';
export function PackagingEditor(){
 const [config,setConfig]=useState<PackagingConfig>();const [message,setMessage]=useState('');const [saving,setSaving]=useState(false);
 useEffect(()=>{api('/admin/packaging').then(setConfig).catch(e=>setMessage(e.message));},[]);
 if(!config)return <p>{message||'Cargando empaques…'}</p>;
 const c=config;
 function change(fn:(draft:PackagingConfig)=>void){const next=structuredClone(c);fn(next);setConfig(next);setMessage('Cambios sin guardar.');}
 function number(label:string,value:number|null,onChange:(n:number|null)=>void,nullable=false){return <label>{label}<input type="number" min="0" step="any" value={value??''} onChange={e=>onChange(e.target.value===''&&nullable?null:Number(e.target.value))}/></label>;}
 function dim(d:any,fn:(key:'length'|'width'|'height',n:number)=>void){return <div className="form-grid">{(['length','width','height'] as const).map((key,i)=><div key={key}>{number(['Largo (cm)','Ancho (cm)','Alto (cm)'][i],d?.[key]??null,n=>fn(key,n??0))}</div>)}</div>;}
 return <div><h2>Empaques y materiales</h2><p>Las medidas de bolsa plana no son las del paquete lleno. Los costos se registran para operación; no agregan un cargo al cliente. Un costo vacío significa pendiente.</p>
 <label><input type="checkbox" checked={c.allowProvisionalQuotes} onChange={e=>change(d=>{d.allowProvisionalQuotes=e.target.checked;})}/> Permitir cotizaciones con medidas provisionales</label>
 <label><input type="checkbox" checked={c.materialWeightsVerified} onChange={e=>change(d=>{d.materialWeightsVerified=e.target.checked;})}/> Pesos de materiales medidos físicamente</label>
 <div className="form-grid">{number('Espuma por juego (g)',c.foamGramsPerGame,n=>change(d=>{d.foamGramsPerGame=n!;}))}
 {number('Espesor de espuma (cm)',c.foamThicknessCm,n=>change(d=>{d.foamThicknessCm=n;}),true)}
 {number('Costo espuma por juego (centavos MXN)',c.foamCostCentsPerGame,n=>change(d=>{d.foamCostCentsPerGame=n;}),true)}
 {number('Cinta y etiqueta por paquete (g)',c.tapeGramsPerParcel,n=>change(d=>{d.tapeGramsPerParcel=n!;}))}
 {number('Costo cinta y etiqueta (centavos MXN)',c.tapeCostCentsPerParcel,n=>change(d=>{d.tapeCostCentsPerParcel=n;}),true)}
 {number('Material adicional por paquete (g)',c.additionalGramsPerParcel,n=>change(d=>{d.additionalGramsPerParcel=n!;}))}
 {number('Costo material adicional (centavos MXN)',c.additionalCostCentsPerParcel,n=>change(d=>{d.additionalCostCentsPerParcel=n;}),true)}</div>
 {c.bags.map((b,i)=><fieldset key={b.id}><legend>{b.id==='small'?'Bolsa pequeña · 1–2 juegos':'Bolsa grande · 3–5 juegos'}</legend><div className="form-grid">
 {number('Largo plano (cm)',b.flatLength,n=>change(d=>{d.bags[i].flatLength=n!;}))}{number('Ancho plano (cm)',b.flatWidth,n=>change(d=>{d.bags[i].flatWidth=n!;}))}
 {number('Margen para cierre (cm)',b.closureCm,n=>change(d=>{d.bags[i].closureCm=n;}),true)}{number('Peso bolsa (g)',b.weightGrams,n=>change(d=>{d.bags[i].weightGrams=n!;}))}
 {number('Costo bolsa (centavos MXN)',b.costCents,n=>change(d=>{d.bags[i].costCents=n;}),true)}</div>
 {b.plans.map((p,j)=><div key={p.units}><h3>{p.units} juegos · {p.verified?'Verificado':'PROVISIONAL'}</h3>{dim(p.packed,(k,n)=>change(d=>{const plan=d.bags[i].plans[j];plan.packed={...(plan.packed||{length:0,width:0,height:0}),[k]:n};plan.verified=false;}))}
 <label><input type="checkbox" checked={p.verified} onChange={e=>change(d=>{d.bags[i].plans[j].verified=e.target.checked;})}/> Medido con juegos, espuma y bolsa cerrada</label></div>)}</fieldset>)}
 <h3>Pedidos de seis juegos o más</h3><p>Se combinan las bolsas registradas de 1–2 y 3–5 juegos, con una guía por bolsa. Se prioriza el menor número de bolsas y después el menor volumen. Skydropx cotiza el conjunto completo.</p>
 <h3>Vista previa del cálculo</h3>{[1,2,3,4,5,6,10,20].map(quantity=>{try{const parcels=planPackaging(c,[{id:'intercambio-navideno',quantity}],!c.allowProvisionalQuotes);return <p key={quantity}>{quantity} juegos: {parcels.map(p=>`${p.packaging.name}: ${p.length} × ${p.width} × ${p.height} cm, ${p.weight} kg, materiales ${p.packaging.costCents===null?'pendientes':money(p.packaging.costCents)} (${p.packaging.verified?'medido':'provisional'})`).join('; ')}</p>;}catch(e){return <p key={quantity}>{quantity} juegos: {(e as Error).message.startsWith('[')?'Revisa los campos pendientes.':(e as Error).message}</p>;}})}
 <p role="status">{message}</p><button disabled={saving} onClick={async()=>{setSaving(true);try{const value=packagingConfigSchema.parse(c);await api('/admin/packaging',value);setMessage('Configuración guardada. Las cotizaciones anteriores deben actualizarse.');}catch(e){setMessage((e as Error).message);}finally{setSaving(false);}}}>Guardar empaques</button></div>;
}
