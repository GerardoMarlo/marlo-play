import { z } from "zod";
import { BusinessError } from "./domain";
const grams = z.number().finite().nonnegative().max(100000);
const cents = z.number().int().nonnegative().max(1000000).nullable();
export const dimensions = z.object({length:z.number().positive().max(200),width:z.number().positive().max(200),height:z.number().positive().max(200)});
export const packagingConfigSchema = z.object({
  version:z.literal(2),
  allowProvisionalQuotes:z.boolean().default(false),
  foamGramsPerGame:grams, foamCostCentsPerGame:cents,
  foamThicknessCm:z.number().nonnegative().max(10).nullable(),
  tapeGramsPerParcel:grams, tapeCostCentsPerParcel:cents,
  additionalGramsPerParcel:grams, additionalCostCentsPerParcel:cents,
  materialWeightsVerified:z.boolean(),
  bags:z.array(z.object({id:z.enum(['small','large']),flatLength:z.number().positive(),flatWidth:z.number().positive(),
    weightGrams:grams,costCents:cents,closureCm:z.number().nonnegative().nullable(),
    plans:z.array(z.object({units:z.number().int().min(1).max(5),packed:dimensions.nullable(),verified:z.boolean()})).max(5)
  })).length(2),
  boxes:z.array(z.object({id:z.string().min(1).max(60),name:z.string().min(1).max(100),inner:dimensions,outer:dimensions,
    weightGrams:grams.refine(n=>n>0),costCents:cents,maxUnits:z.number().int().min(1).max(100),
    available:z.number().int().min(0).max(30),verified:z.boolean()})).max(30)
}).superRefine((c,ctx)=>{
  if(new Set(c.bags.map(b=>b.id)).size!==2 || new Set(c.boxes.map(b=>b.id)).size!==c.boxes.length)
    ctx.addIssue({code:'custom',message:'Los identificadores de empaque deben ser únicos.'});
  for(const bag of c.bags){
    const expected=bag.id==='small'?[1,2]:[3,4,5];
    if(bag.plans.length!==expected.length || expected.some(n=>bag.plans.filter(p=>p.units===n).length!==1))
      ctx.addIssue({code:'custom',message:'Configura exactamente 1–2 juegos en bolsa pequeña y 3–5 en bolsa grande.'});
    if(bag.plans.some(p=>p.verified&&!p.packed))ctx.addIssue({code:'custom',message:'Un empaque verificado requiere dimensiones medidas.'});
  }
  for(const box of c.boxes)if(['length','width','height'].some(k=>box.inner[k as keyof typeof box.inner]>box.outer[k as keyof typeof box.outer]))
    ctx.addIssue({code:'custom',message:'Las medidas interiores no pueden superar las exteriores.'});
});
export type PackagingConfig=z.infer<typeof packagingConfigSchema>;
export const defaultPackaging:PackagingConfig={version:2,allowProvisionalQuotes:false,foamGramsPerGame:10,foamCostCentsPerGame:null,foamThicknessCm:null,
  tapeGramsPerParcel:10,tapeCostCentsPerParcel:null,additionalGramsPerParcel:0,additionalCostCentsPerParcel:null,materialWeightsVerified:false,
  bags:[{id:'small',flatLength:25,flatWidth:17,weightGrams:15,costCents:null,closureCm:null,plans:[1,2].map(units=>({units,packed:null,verified:false}))},
    {id:'large',flatLength:55,flatWidth:35,weightGrams:35,costCents:null,closureCm:null,plans:[3,4,5].map(units=>({units,packed:null,verified:false}))}],boxes:[]};

// User authorized provisional production quotations on 2026-10-19.
// 1 mm foam on each side; integer/half-cm clearance; never verified measurements.
export const provisionalPackaging:PackagingConfig={...defaultPackaging,allowProvisionalQuotes:true,foamThicknessCm:0.1,
  bags:defaultPackaging.bags.map(b=>({...b,closureCm:2,plans:b.plans.map(p=>({...p,packed:({
    1:{length:12,width:9,height:5},2:{length:12,width:8.5,height:8.5},
    3:{length:12,width:9,height:13},4:{length:17,width:12,height:9},5:{length:26,width:12,height:9}
  } as Record<number,D>)[p.units]}))}))};
type D=z.infer<typeof dimensions>;
const volume=(d:D)=>d.length*d.width*d.height;
function rotations(d:D){const {length:a,width:b,height:c}=d;return [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]];}
function capacity(d:D,foam:number){return Math.max(...rotations({length:8+2*foam,width:11+2*foam,height:4+2*foam}).map(([a,b,c])=>Math.floor(d.length/a)*Math.floor(d.width/b)*Math.floor(d.height/c)));}
export function packageWeight(c:PackagingConfig,units:number,containerGrams:number){return Math.round(units*(250+c.foamGramsPerGame)+containerGrams+c.tapeGramsPerParcel+c.additionalGramsPerParcel);}
export type PackedParcel=D & {weight:number;packaging:{id:string;name:string;units:number;verified:boolean;weightVerified:boolean;costCents:number|null;weightGrams:number;foamGrams:number;containerGrams:number;tapeGrams:number;additionalGrams:number;}};
function parcel(c:PackagingConfig,units:number,id:string,name:string,d:D,containerGrams:number,cost:number|null,verified:boolean):PackedParcel{
  const costs=[cost,c.foamCostCentsPerGame,c.tapeCostCentsPerParcel,c.additionalCostCentsPerParcel];
  const weightGrams=packageWeight(c,units,containerGrams);
  return {...d,weight:weightGrams/1000,packaging:{id,name,units,verified,weightVerified:c.materialWeightsVerified,weightGrams,
    foamGrams:units*c.foamGramsPerGame,containerGrams,tapeGrams:c.tapeGramsPerParcel,additionalGrams:c.additionalGramsPerParcel,
    costCents:costs.some(x=>x===null)?null:cost!+units*c.foamCostCentsPerGame!+c.tapeCostCentsPerParcel!+c.additionalCostCentsPerParcel!}};
}
export function planPackaging(input:unknown,items:{id:string;quantity:number}[],requireVerified=true):PackedParcel[]{
  const c=packagingConfigSchema.parse(input);
  if(items.some(i=>i.id!=='intercambio-navideno'))throw new BusinessError('Producto sin configuración de empaque.',409);
  const units=items.reduce((s,i)=>s+i.quantity,0);
  if(!Number.isInteger(units)||units<1||units>100)throw new BusinessError('Cantidad fuera del rango de empaque.',409);
  if(units<=5){
    const bag=c.bags.find(b=>b.id===(units<=2?'small':'large'))!;
    const plan=bag.plans.find(p=>p.units===units)!;
    if(!plan.packed || (requireVerified&&!plan.verified))throw new BusinessError(`Falta medir y verificar el empaque cerrado de ${units} juegos.`,409);
    if(capacity(plan.packed,c.foamThicknessCm??0)<units)throw new BusinessError('Las dimensiones no admiten los juegos y la protección configurada.',409);
    if(bag.closureCm===null || !rotations(plan.packed).some(([l,w,h])=>l+h+bag.closureCm!<=bag.flatLength && w+h<=bag.flatWidth))
      throw new BusinessError('Falta confirmar el margen de cierre o el paquete no cabe en la bolsa plana.',409);
    return [parcel(c,units,bag.id,bag.id==='small'?'Bolsa pequeña + espuma':'Bolsa grande + espuma',plan.packed,bag.weightGrams,bag.costCents,plan.verified)];
  }
  // Reuse only configured bag plans; prefer fewer labels, then lower packed volume.
  const options:PackedParcel[]=[];
  for(let count=1;count<=5;count++){
    try { options.push(planPackaging(c,[{id:'intercambio-navideno',quantity:count}],requireVerified)[0]); }
    catch(error) { if(!(error instanceof BusinessError))throw error; }
  }
  type State={volume:number;parcels:PackedParcel[]};
  const dp:(State|undefined)[]=Array(units+1);dp[0]={volume:0,parcels:[]};
  for(let n=1;n<=units;n++)for(const bag of options){
    const previous=dp[n-bag.packaging.units];
    if(!previous || previous.parcels.length>=30)continue;
    const candidate={volume:previous.volume+volume(bag),parcels:[...previous.parcels,bag]};
    const old=dp[n];
    if(!old || candidate.parcels.length<old.parcels.length ||
      (candidate.parcels.length===old.parcels.length && candidate.volume<old.volume))dp[n]=candidate;
  }
  if(!dp[units])throw new BusinessError('No hay una combinación de bolsas configuradas para esta cantidad. Revisa las medidas y capacidades registradas.',409);
  return dp[units]!.parcels.map(p=>structuredClone(p));
}
