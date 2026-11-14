import {expect,it} from "vitest";
import {uniqueCardBrands} from "../src/payment-brands";
it("shows one official logo per brand while retaining credit and debit acceptance",()=>{
 const ids=["debvisa","debmaster","visa","master","mastercard","amex"];
 const result=uniqueCardBrands(ids.map(id=>({id,name:id,logo:"https://example.com/"+id})));
 expect(result.map(x=>x.name)).toEqual(["Visa","Mastercard","American Express"]);
 expect(result[0].logo).toBe("https://example.com/visa");
 expect(uniqueCardBrands([{id:"debvisa",name:"Visa Débito",logo:"official"}])).toEqual([{id:"visa",name:"Visa",logo:"official"}]);
});
