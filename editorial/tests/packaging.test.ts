import {it,expect} from 'vitest';
import {planPackaging,provisionalPackaging,defaultPackaging} from '../src/packaging';
const items=(quantity:number)=>[{id:'intercambio-navideno',quantity}];
it.each([[1,285],[2,545],[3,825],[4,1085],[5,1345]])('packs %s games with foam and all material weights', (n,weight)=>{
 const [p]=planPackaging(provisionalPackaging,items(n),false);
 expect(p.weight).toBe(weight/1000);expect(p.packaging.foamGrams).toBe(n*10);
 expect(p.packaging.id).toBe(n<=2?'small':'large');expect(p.packaging.costCents).toBeNull();
 expect(p.packaging.verified).toBe(false);expect(p.packaging.weightVerified).toBe(false);
});
it('does not silently treat estimates or flat bags as verified measurements',()=>{
 expect(()=>planPackaging(provisionalPackaging,items(1))).toThrow(/verificar/);
 expect(()=>planPackaging(defaultPackaging,items(1),false)).toThrow(/medir/);
 const c=structuredClone(provisionalPackaging);c.bags[0].plans[0].packed={length:25,width:17,height:10};
 expect(()=>planPackaging(c,items(1),false)).toThrow(/bolsa/);
});
it.each([6,7,8,9,10,11,20,100])('combines registered bags for %s games without boxes',n=>{
 const parcels=planPackaging(provisionalPackaging,items(n),false);
 expect(parcels.length).toBe(Math.ceil(n/5));
 expect(parcels.reduce((sum,p)=>sum+p.packaging.units,0)).toBe(n);
 expect(parcels.every(p=>['small','large'].includes(p.packaging.id))).toBe(true);
 expect(parcels.reduce((sum,p)=>sum+p.packaging.weightGrams,0)).toBe(n*260+parcels.reduce((sum,p)=>sum+p.packaging.containerGrams+10,0));
 expect(()=>planPackaging(provisionalPackaging,items(n))).toThrow(/bolsas/);
});
it('uses small bags when large bag plans are unavailable and rejects excessive parcels',()=>{
 const c=structuredClone(provisionalPackaging);c.bags[1].plans.forEach(p=>{p.packed=null;});
 expect(planPackaging(c,items(6),false).map(p=>p.packaging.units)).toEqual([2,2,2]);
 expect(()=>planPackaging(c,items(100),false)).toThrow(/bolsas/);
});
it('counts material cost for every bag and does not reuse mutable parcel objects',()=>{
 const c=structuredClone(provisionalPackaging);c.foamCostCentsPerGame=10;c.tapeCostCentsPerParcel=20;c.additionalCostCentsPerParcel=0;c.bags.forEach(b=>{b.costCents=30;});
 const parcels=planPackaging(c,items(10),false);
 expect(parcels.reduce((sum,p)=>sum+p.packaging.costCents!,0)).toBe(200);
 parcels[0].packaging.units=1;expect(parcels[1].packaging.units).toBe(5);
});
it('changing quantity changes packed dimensions and full weight',()=>{
 const one=planPackaging(provisionalPackaging,items(1),false)[0];
 const five=planPackaging(provisionalPackaging,items(5),false)[0];
 expect(one.weight).not.toBe(five.weight);expect(one.length).not.toBe(five.length);
});
