import { it, expect, vi, afterEach } from "vitest";
import { database } from "./db";
import worker from "../api/worker";
import type { Env } from "../api/types";
vi.mock("../api/security", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  admin: async () => "test-admin",
}));
afterEach(() => vi.restoreAllMocks());
it("rejects unavailable pickup slots and prevents duplicate pickup requests", async () => {
  const { o, req } = await setup();
  let pickups = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith("/oauth/token")) return Response.json({access_token: "test"});
    if (path.includes("/quotations/")) return Response.json({is_completed: true, rates: [rate]});
    if (path.includes("/pickups/coverage")) return Response.json({success: true, pickupDates: [{date: "2026-10-20", startHour: "09:00", endHour: "14:00"}]});
    if (path.endsWith("/pickups")) { pickups++; return Response.json({id: "pickup"}); }
    return Response.json({data: {id: "shipment"}});
  });
  expect((await req("/admin/order", {id: o.id, action: "label", approvedCost: 12500})).status).toBe(200);
  const request = {id: o.id, action: "pickup", scheduledFrom: "2026-10-20 09:00", scheduledTo: "2026-10-20 14:00"};
  expect((await req("/admin/order", {...request, scheduledFrom: "2026-10-20 08:00"})).status).toBe(409);
  expect(pickups).toBe(0);
  expect((await req("/admin/order", request)).status).toBe(200);
  expect((await req("/admin/order", request)).status).toBe(409);
  expect(pickups).toBe(1);
});
const rate = {
  id: "rate",
  success: true,
  provider_name: "test",
  provider_service_code: "home",
  currency_code: "MXN",
  total: 125,
  days: 3,
  pickup: true,
  pickup_ocurre: true,
  pickup_package_min: 1,
  office_delivery: false,
  office_pickup: false,
  requires_origin_verification: false,
  shipment_creation_type: "single",
};
async function setup() {
  const { db, sqlite } = database();
  const e = {
    DB: db,
    MODE: "local",
    PUBLIC_ORIGIN: "http://localhost",
    PAYMENTS_ENABLED: "false",
    EMAIL_ENABLED: "false",
    LABELS_ENABLED: "false",
  } as Env;
  const req = (path: string, b: any) =>
    worker.fetch(
      new Request("http://localhost/api" + path, {
        method: "POST",
        headers: { Origin: e.PUBLIC_ORIGIN },
        body: JSON.stringify(b),
      }),
      e,
    );
  const r = await req("/orders", {
    items: [{ id: "demo-mesa", quantity: 1 }],
    name: "Test Buyer",
    email: "test@example.com",
    phone: "3312345678",
    delivery: "local",
    localConsent: true, localPostalCode: "45050",
    terms: true,
    privacy: true,
    provider: "paypal",
    idempotencyKey: crypto.randomUUID(),
  });
  const o: any = await r.json();
  o.id = sqlite.prepare("SELECT id FROM orders WHERE public_number=?").get(o.orderNumber)?.id;
  const stored = JSON.parse(
      String(
        sqlite.prepare("SELECT data FROM orders WHERE id=?").get(o.id)?.data,
      ),
    );
  stored.checkout.delivery = "national";
  stored.checkout.address = {
    recipient: "Test Buyer",
    email: "test@example.com",
    phone: "3312345678",
    street: "Test Street",
    exterior: "1",
    colony: "Centro",
    city: "Monterrey",
    state: "Nuevo León",
    postalCode: "64000",
    country: "MX",
  };
  stored.quote = {
    id: "quote",
    rateId: "rate",
    carrier: "test",
    service: "home",
    cost: 12500,
    rateCost: 12500,
    method: "pickup",
    fixture: false,
    expires: Date.now() + 3600000,
    parcels: [{ length: 35, width: 55, height: 10, weight: 0.265 }],
  };
  sqlite
    .prepare(
      "UPDATE orders SET data=?,payment='paid',shipping=12500 WHERE id=?",
    )
    .run(JSON.stringify(stored), o.id);
  Object.assign(e, {
    MODE: "sandbox",
    SKYDROPX_ENVIRONMENT: "sandbox",
    LABELS_ENABLED: "true",
    SKYDROPX_CLIENT_ID: "test",
    SKYDROPX_CLIENT_SECRET: "test",
    SHIPPING_CONSIGNMENT_NOTE: "test",
    SHIPPING_PACKAGE_TYPE: "test",
    SHIPPING_ORIGIN_JSON: JSON.stringify({
      street1: "Test Street 2",
      name: "Test Sender",
      company: "Marlo",
      phone: "3312345678",
      email: "sender@example.com",
    }),
    SHIPPING_SERVICES_JSON: JSON.stringify([
      {
        carrier: "test",
        service: "home",
        homeDelivery: true,
        businessDays: true,
        validUntil: Date.now() + 86400000,
        source: "Verified provider fixture",
        pickup: { extraCents: 0, source: "Pickup included in quote" },
      },
    ]),
  });
  return { e, sqlite, o, req };
}
it("authorizes the exact price and creates only one shipment for duplicate requests", async () => {
  const { o, req, sqlite } = await setup();
  let buys = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/oauth/token"))
      return Response.json({ access_token: "test" });
    if (String(url).includes("/quotations/"))
      return Response.json({ is_completed: true, rates: [rate] });
    buys++;
    return Response.json({ data: { id: "shipment" } });
  });
  expect(
    (await req("/admin/order", { id: o.id, action: "label", approvedCost: 1 }))
      .status,
  ).toBe(409);
  expect(
    (
      await req("/admin/order", {
        id: o.id,
        action: "label",
        approvedCost: 12500,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await req("/admin/order", {
        id: o.id,
        action: "label",
        approvedCost: 12500,
      })
    ).status,
  ).toBe(409);
  expect(buys).toBe(1);
  expect(
    sqlite.prepare("SELECT shipment_id FROM fulfillment").get()?.shipment_id,
  ).toBe("shipment");
});
it("repricing prevents a label purchase and does not change customer charges", async () => {
  const { o, req, sqlite } = await setup();
  let buys = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/oauth/token"))
      return Response.json({ access_token: "test" });
    if (String(url).includes("/quotations/"))
      return Response.json({
        is_completed: true,
        rates: [{ ...rate, total: 150 }],
      });
    buys++;
    return Response.json({});
  });
  expect(
    (
      await req("/admin/order", {
        id: o.id,
        action: "label",
        approvedCost: 12500,
      })
    ).status,
  ).toBe(409);
  expect(buys).toBe(0);
  expect(sqlite.prepare("SELECT shipping FROM orders").get()?.shipping).toBe(
    12500,
  );
});

it("buys a multi-package shipment with one package request per bag", async()=>{
 const {o,req,sqlite}=await setup();
 const data=JSON.parse(String(sqlite.prepare("SELECT data FROM orders WHERE id=?").get(o.id)!.data));
 data.quote.parcels=[{length:12,width:9,height:13,weight:.825},{length:12,width:9,height:13,weight:.825}];
 sqlite.prepare("UPDATE orders SET data=? WHERE id=?").run(JSON.stringify(data),o.id);
 let payload:any;
 vi.spyOn(globalThis,"fetch").mockImplementation(async(url,init)=>{
  if(String(url).endsWith("/oauth/token"))return Response.json({access_token:"test"});
  if(String(url).includes("/quotations/"))return Response.json({is_completed:true,rates:[{...rate,shipment_creation_type:"multipackage"}]});
  payload=JSON.parse(String(init?.body));return Response.json({data:{id:"shipment"}});
 });
 expect((await req("/admin/order",{id:o.id,action:"label",approvedCost:12500})).status).toBe(200);
 expect(payload.shipment.packages.map((p:any)=>p.package_number)).toEqual(["1","2"]);
});
