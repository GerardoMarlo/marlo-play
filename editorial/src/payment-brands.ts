export type CardBrand = { id: string; name: string; logo: string };
// A brand represents both credit and debit; keep the provider's official artwork.
export function uniqueCardBrands(methods: CardBrand[]): CardBrand[] {
  const aliases: Record<string, string> = {visa:"visa",debvisa:"visa",master:"mastercard",mastercard:"mastercard",debmaster:"mastercard",amex:"amex"};
  const names: Record<string, string> = {visa:"Visa",mastercard:"Mastercard",amex:"American Express"};
  const selected = new Map<string, CardBrand>();
  for (const method of [...methods].sort((a,b)=>Number(a.id.startsWith("deb"))-Number(b.id.startsWith("deb")))) {
    const id = aliases[method.id] || method.id;
    if (!selected.has(id)) selected.set(id,{...method,id,name:names[id] || method.name});
  }
  return [...selected.values()];
}
