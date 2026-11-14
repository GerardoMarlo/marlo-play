import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { database } from "./db";
import worker from "../api/worker";
import {
  publicTracking,
  registerTracking,
  recordTrackingEvent,
  normalizeTrackingResponse,
  trackingNumber,
} from "../api/tracking";
import { getShipment, skyClient } from "../api/skydropx";
import { renderEmail } from "../api/emails";
import { defaultContent } from "../src/content";
import type { Env, OrderRow } from "../api/types";
vi.mock("../api/skydropx", async (original) => ({
  ...(await original<any>()),
  getShipment: vi.fn(),
  skyClient: vi.fn(),
}));
let e: Env,
  sql: ReturnType<typeof database>["sqlite"],
  o: OrderRow,
  send: ReturnType<typeof vi.fn>;
const origin = "http://127.0.0.1:5173",
  shipmentId = "93774c22-8275-4757-9963-71b79b2e8db7";
const parcel = {
  tracking_number: "123456789012",
  tracking_status: "created",
  updated_at: "2026-10-20T10:00:00Z",
  label_url: "https://example.com/private.pdf",
  tracking_url_provider: "https://example.com/track",
};
const result = () => ({
  id: shipmentId,
  carrier: "fedex",
  cost: 7000,
  packages: [parcel],
});
const event = (status: string, date: string) => ({
  id: crypto.randomUUID(),
  attributes: {
    status,
    date,
    description: "PRIVATE NAME",
    location: "PRIVATE ADDRESS",
    event_description: "PRIVATE PHONE",
  },
});
async function call(body: unknown, path = "/api/tracking") {
  return worker.fetch(
    new Request(origin + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    e,
  );
}
beforeEach(async () => {
  const d = database();
  sql = d.sqlite;
  e = {
    DB: d.db,
    MODE: "local",
    PUBLIC_ORIGIN: origin,
    PAYMENTS_ENABLED: "false",
    EMAIL_ENABLED: "false",
    LABELS_ENABLED: "false",
    SKYDROPX_WEBHOOK_SECRET: "test-secret",
  };
  send = vi
    .fn()
    .mockResolvedValue({
      data: [
        event("picked_up", "2026-10-21T10:00:00Z"),
        event("in_transit", "2026-10-21T12:00:00Z"),
      ],
    });
  vi.mocked(skyClient).mockReturnValue(send as any);
  vi.mocked(getShipment).mockResolvedValue(result() as any);
  const product = sql
    .prepare("SELECT id FROM products WHERE stock>0 LIMIT 1")
    .get()!;
  const response = await call(
    {
      items: [{ id: product.id, quantity: 1 }],
      name: "PRIVATE NAME",
      email: "private@example.com",
      phone: "3312345678",
      delivery: "local",
      localConsent: true,
      terms: true,
      privacy: true,
      provider: "mercadopago",
      idempotencyKey: crypto.randomUUID(),
    },
    "/api/orders",
  );
  expect(response.status).toBe(201);
  o = sql.prepare("SELECT * FROM orders LIMIT 1").get() as unknown as OrderRow;
  const data = JSON.parse(o.data);
  data.checkout.delivery = "national";
  o = { ...o, payment: "paid", data: JSON.stringify(data) };
  sql
    .prepare("UPDATE orders SET payment='paid',data=? WHERE id=?")
    .run(o.data, o.id);
  sql
    .prepare(
      "INSERT INTO fulfillment(order_id,rate_id,shipment_id,request,created) VALUES(?,?,?,?,?)",
    )
    .run(o.id, "rate-test", shipmentId, "{}", Date.now());
  await registerTracking(e, o, result());
});
afterEach(() => vi.clearAllMocks());
it("normalizes tracking numbers without accepting punctuation or missing input", () => {
  expect(trackingNumber(" ab 123456 ")).toBe("AB123456");
  for (const value of [
    undefined,
    "",
    "abc",
    "https://evil",
    "12345<script>",
    123456,
  ])
    expect(() => trackingNumber(value)).toThrow();
});
it("resolves carrier automatically and returns current state plus history", async () => {
  const response = await call({ trackingNumber: parcel.tracking_number });
  expect(response.status).toBe(200);
  const data: any = await response.json();
  expect(data.status).toBe("in_transit");
  expect(data.events).toHaveLength(2);
  expect(send).toHaveBeenCalledWith(
    "/api/v1/shipments/tracking?tracking_number=123456789012&carrier_name=fedex",
  );
  expect(data.carrier).toBe("fedex");
});
it("exposes only safe logistics fields even if provider descriptions contain PII", async () => {
  const data = await publicTracking(e, parcel.tracking_number),
    text = JSON.stringify(data);
  for (const value of [
    "PRIVATE",
    "private@example.com",
    "private.pdf",
    o.id,
    shipmentId,
    "total",
    "payment",
    "location",
  ])
    expect(text).not.toContain(value);
  expect(Object.keys(data).sort()).toEqual(
    [
      "carrier",
      "events",
      "stale",
      "status",
      "trackingNumber",
      "updatedAt",
    ].sort(),
  );
});
it("does not query provider for unknown or ambiguous guides", async () => {
  await expect(publicTracking(e, "999999999999")).rejects.toThrow("localizar");
  sql
    .prepare(
      "INSERT INTO shipment_tracking(id,order_id,shipment_id,tracking_number,carrier) VALUES(?,?,?,?,?)",
    )
    .run("ambiguous", o.id, "other", parcel.tracking_number, "dhl");
  await expect(publicTracking(e, parcel.tracking_number)).rejects.toThrow(
    "localizar",
  );
  expect(send).not.toHaveBeenCalled();
});
it("caches lookups and limits concurrent refreshes to one provider call", async () => {
  await Promise.all([
    publicTracking(e, parcel.tracking_number),
    publicTracking(e, parcel.tracking_number),
  ]);
  await publicTracking(e, parcel.tracking_number);
  expect(send).toHaveBeenCalledTimes(1);
});
it("keeps verified state on provider outage and backs off", async () => {
  send.mockRejectedValue(Error("network"));
  const data = await publicTracking(e, parcel.tracking_number);
  expect(data.status).toBe("created");
  expect(data.stale).toBe(true);
  expect(data.events).toEqual([]);
  await publicTracking(e, parcel.tracking_number);
  expect(send).toHaveBeenCalledTimes(1);
});
it("empty provider history does not create milestones or dates", async () => {
  send.mockResolvedValue({ data: [] });
  const data = await publicTracking(e, parcel.tracking_number);
  expect(data.events).toEqual([]);
  expect(data.stale).toBe(false);
});
it("ignores unknown status and invalid dates instead of guessing progress", () => {
  expect(
    normalizeTrackingResponse({ data: [event("not_known", "2026-01-01")] }),
  ).toEqual([]);
  expect(
    normalizeTrackingResponse({ data: [event("last_mile", "nonsense")] }),
  ).toEqual([{ status: "last_mile", date: null }]);
  expect(() => normalizeTrackingResponse({ status: "delivered" })).toThrow();
});
it("deduplicates history, rejects old and regressive events, allows return after delivery", async () => {
  const row = sql.prepare("SELECT id FROM shipment_tracking").get()!;
  const id = String(row.id);
  for (const status of ["delivered", "delivered"])
    await recordTrackingEvent(
      e,
      id,
      { status, date: "2026-10-21T12:00:00Z" },
      "tracking",
    );
  await recordTrackingEvent(
    e,
    id,
    { status: "in_transit", date: "2026-10-20T12:00:00Z" },
    "tracking",
  );
  await recordTrackingEvent(
    e,
    id,
    { status: "created", date: "2026-10-22T12:00:00Z" },
    "tracking",
  );
  expect(
    sql.prepare("SELECT status FROM shipment_tracking").get()?.status,
  ).toBe("delivered");
  expect(
    sql
      .prepare(
        "SELECT count(*) n FROM shipment_tracking_events WHERE status='delivered'",
      )
      .get()?.n,
  ).toBe(1);
  await recordTrackingEvent(
    e,
    id,
    { status: "in_return", date: "2026-10-23T12:00:00Z" },
    "tracking",
  );
  expect(
    sql.prepare("SELECT status FROM shipment_tracking").get()?.status,
  ).toBe("in_return");
});
it("skips local pickup and missing tracking numbers", async () => {
  sql.exec(
    "DELETE FROM shipment_tracking_events; DELETE FROM shipment_tracking;",
  );
  await registerTracking(
    e,
    {
      ...o,
      data: JSON.stringify({
        ...JSON.parse(o.data),
        checkout: { delivery: "local" },
      }),
    },
    result(),
  );
  await registerTracking(e, o, {
    ...result(),
    packages: [{ tracking_status: "created" }],
  });
  expect(sql.prepare("SELECT count(*) n FROM shipment_tracking").get()?.n).toBe(
    0,
  );
});
it("limits public attempts and requires real anti-bot verification outside local", async () => {
  for (let i = 0; i < 8; i++)
    expect((await call({ trackingNumber: "999999999999" })).status).toBe(404);
  expect((await call({ trackingNumber: parcel.tracking_number })).status).toBe(
    429,
  );
  e.MODE = "production";
  sql.exec("DELETE FROM rate_limits");
  expect((await call({ trackingNumber: parcel.tracking_number })).status).toBe(
    400,
  );
});
async function signed(payload: unknown) {
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(e.SKYDROPX_WEBHOOK_SECRET!),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  return new Request(origin + "/api/webhooks/skydropx", {
    method: "POST",
    headers: { Authorization: "HMAC " + sig },
    body,
  });
}
it("authenticates webhook, updates tracking and sends each notification once", async () => {
  vi.mocked(getShipment).mockResolvedValue({
    ...result(),
    packages: [
      {
        ...parcel,
        tracking_status: "delivered",
        updated_at: "2026-10-23T12:00:00Z",
      },
    ],
  } as any);
  const payload = {
    data: {
      type: "packages",
      relationships: { shipment: { data: { id: shipmentId } } },
    },
  };
  expect((await worker.fetch(await signed(payload), e)).status).toBe(200);
  const second = await worker.fetch(await signed(payload), e);
  expect(await second.json()).toEqual({ received: true, duplicate: true });
  expect(getShipment).toHaveBeenCalledTimes(1);
  expect(
    sql.prepare("SELECT status FROM shipment_tracking").get()?.status,
  ).toBe("delivered");
  expect(
    sql.prepare("SELECT count(*) n FROM outbox WHERE kind='delivered'").get()
      ?.n,
  ).toBe(1);
  expect(sql.prepare("SELECT count(*) n FROM outbox WHERE kind IN ('label_created','shipped')").get()?.n).toBe(0);
});
it("ignores signed unknown shipments and rejects invalid signatures", async () => {
  const unknown = await worker.fetch(
    await signed({
      data: { type: "shipments", id: "00000000-0000-4000-8000-000000000000" },
    }),
    e,
  );
  expect(((await unknown.json()) as any).ignored).toBe(true);
  expect(getShipment).not.toHaveBeenCalled();
  expect((await call({}, "/api/webhooks/skydropx")).status).toBe(401);
});
it("shipping emails include safe number, branded link, carrier and truthful subject", () => {
  const email = renderEmail("label_created", {
    tracking: parcel.tracking_number,
    carrier: "FedEx",
    name: "Ana",
    lines: [{ title: "Intercambio Navideño", quantity: 1, amount: 25900 }],
    delivery: "national",
  });
  expect(email.html).toContain(
    "https://marlo.games/rastrear-pedido?guia=123456789012",
  );
  expect(email.html).toContain("Rastrear mi paquete");
  expect(email.html).toContain("FedEx");
  expect(email.html).toContain("Intercambio Navideño");
  expect(email.html).toContain("Todavía no significa que el transportista lo haya recibido");
  expect(email.subject).not.toContain("en camino");
  expect(renderEmail("shipped", {}).subject).toBe(
    "¡Tu juego ya va en camino! 📦",
  );
  expect(renderEmail("paid", { delivery: "local" }).html).not.toContain(
    "?guia=",
  );
});
it("FAQ includes explicit shipping costs and tracking link anchor text", () => {
  const shipping = defaultContent.faq.find(
    ([q]) => q === "¿Cuánto cuesta el envío?",
  )![1];
  expect(shipping).toContain("$0 MXN");
  expect(shipping).toContain("$70 MXN");
  expect(shipping).toContain("cobertura");
  expect(
    defaultContent.faq.find(
      ([q]) => q === "¿Cómo puedo consultar el estado de mi pedido?",
    )![1],
  ).toContain("número de pedido");
});

it("waits for every bag label and does not mark the order delivered after just one bag",async()=>{
 const data=JSON.parse(o.data);data.quote={parcels:[{},{}]};
 sql.prepare("UPDATE orders SET data=? WHERE id=?").run(JSON.stringify(data),o.id);
 const delivered={...parcel,tracking_status:"delivered"};
 vi.mocked(getShipment).mockResolvedValue({...result(),packages:[delivered]} as any);
 const payload=(id:string)=>({id,data:{type:"packages",relationships:{shipment:{data:{id:shipmentId}}}}});
 expect((await worker.fetch(await signed(payload("partial")),e)).status).toBe(200);
 expect(sql.prepare("SELECT logistics FROM orders").get()?.logistics).not.toBe("delivered");
 expect(sql.prepare("SELECT count(*) n FROM outbox WHERE kind='delivered'").get()?.n).toBe(0);
 vi.mocked(getShipment).mockResolvedValue({...result(),packages:[delivered,{...parcel,tracking_number:"987654321012",tracking_status:"in_transit"}]} as any);
 expect((await worker.fetch(await signed(payload("both")),e)).status).toBe(200);
 expect(sql.prepare("SELECT logistics,tracking FROM orders").get()).toMatchObject({logistics:"shipped",tracking:"123456789012, 987654321012"});
});
