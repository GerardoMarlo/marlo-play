import { it, expect } from "vitest";
import { chooseShipping, pack, type Evidence } from "../api/shipping-policy";
import type { Env } from "../api/types";
import {provisionalPackaging} from '../src/packaging';
const proof: Evidence = {
  carrier: "test",
  service: "home",
  homeDelivery: true,
  businessDays: true,
  source: "Verified provider contract",
  validUntil: Date.now() + 86400000,
  pickup: { extraCents: 0, source: "Pickup included in total" },
  dropoff: {
    extraCents: 0,
    source: "Dropoff included in total",
    officeId: "11111111-1111-4111-8111-111111111111",
  },
};
const rate = (total: number, method = "pickup", extra = {}) => ({
  id: method + total,
  provider_name: "test",
  provider_service_code: "home",
  success: true,
  currency_code: "MXN",
  total,
  days: 4,
  office_delivery: false,
  requires_origin_verification: false,
  pickup: method === "pickup",
  pickup_ocurre: true,
  pickup_package_min: 1,
  office_pickup: method === "dropoff",
  shipment_creation_type: "single",
  ...extra,
});
it.each([0, 1, 29.99])(
  "prefers pickup when dropoff saves %s MXN",
  (savings) => {
    expect(
      chooseShipping([rate(150), rate(150 - savings, "dropoff")], [proof], 1)
        .method,
    ).toBe("pickup");
  },
);
it.each([30, 30.01, 70])(
  "chooses dropoff only with verified %s MXN savings",
  (savings) => {
    const q = chooseShipping(
      [rate(150), rate(150 - savings, "dropoff")],
      [proof],
      1,
    );
    expect(q.method).toBe("dropoff");
    expect(q.savings).toBe(Math.round(savings * 100));
  },
);
it("compares all carriers and includes verified pickup charges", () => {
  const q = chooseShipping(
    [rate(90), rate(120, "dropoff"), rate(110, "dropoff")],
    [
      {
        ...proof,
        pickup: { extraCents: 5000, source: "Provider pickup fee quote" },
      },
    ],
    1,
  );
  expect(q.cost).toBe(11000);
  expect(q.method).toBe("dropoff");
});
it.each([
  { days: 7 },
  { days: undefined },
  { days: "3" },
  { office_delivery: undefined },
  { requires_origin_verification: true },
  { currency_code: "USD" },
  { total: "unknown" },
  { success: false },
  { pickup_package_min: 3 },
  { shipment_creation_type: "multishipment" },
])("excludes unverified/ineligible rate %j", (extra) => {
  expect(() =>
    chooseShipping([rate(100, "pickup", extra)], [proof], 1),
  ).toThrow(/cobertura/);
});
it("requires unexpired evidence and does not invent cheaper dropoff", () => {
  expect(() => chooseShipping([rate(100)], [], 1)).toThrow();
  expect(() =>
    chooseShipping([rate(100)], [{ ...proof, validUntil: 0 }], 1),
  ).toThrow();
  expect(
    chooseShipping([rate(100, "pickup", { office_pickup: true })], [proof], 1)
      .method,
  ).toBe("pickup");
});
it("uses an eligible sole method and refuses no coverage", () => {
  expect(chooseShipping([rate(100, "dropoff")], [proof], 1).method).toBe(
    "dropoff",
  );
  expect(() => chooseShipping([], [proof], 1)).toThrow(/cobertura/);
});
it("uses authorized dimensions and combines bags for bulk orders", () => {
  const e = {
    SHIPPING_PACKAGING_JSON: JSON.stringify(provisionalPackaging),
  } as Env;
  expect(pack(e, [{ id: "intercambio-navideno", quantity: 2 }])[0]).toMatchObject({length:12,width:8.5,height:8.5,weight:.545,packaging:{verified:false}});
  expect(pack(e, [{ id: "intercambio-navideno", quantity: 6 }]).map(p=>p.packaging.units)).toEqual([4,2]);
});
it('rejects single-parcel services for multiple bags',()=>{
 expect(()=>chooseShipping([rate(100)],[proof],2)).toThrow();
 expect(chooseShipping([rate(100,'pickup',{shipment_creation_type:'multipackage'})],[proof],2).cost).toBe(10000);
});
