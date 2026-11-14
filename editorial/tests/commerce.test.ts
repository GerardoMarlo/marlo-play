import { describe, it, expect, beforeEach, vi } from "vitest";
import { database } from "./db";
import worker from "../api/worker";
import { processOutbox, renderEmail } from "../api/emails";
import {
  paymentTransition,
  totals,
  checkoutSchema,
  type Product,
  type Coupon,
} from "../src/domain";
import { shippingProvider } from "../api/providers";
import type { Env } from "../api/types";
let e: Env;
let sql: ReturnType<typeof database>["sqlite"];
const origin = "http://127.0.0.1:5173";
const checkout = () => ({
  items: [{ id: "demo-mesa", quantity: 2 }],
  name: "Cliente de prueba",
  email: "prueba@example.com",
  phone: "3312345678",
  delivery: "local",
  localConsent: true,
  terms: true,
  privacy: true,
  provider: "paypal",
  idempotencyKey: crypto.randomUUID(),
});
async function call(
  path: string,
  b?: unknown,
  token?: string,
  host = "http://127.0.0.1:8788",
) {
  const r = await worker.fetch(
    new Request(host + "/api" + path, {
      method: b === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        ...(token ? { Cookie: token } : {}),
      },
      body: b === undefined ? undefined : JSON.stringify(b),
    }),
    e,
  );
  const data:any = await r.json();
  // These inventory/admin fixtures use internal IDs; customer API contracts have separate tests.
  if (data.orderNumber) data.id = sql.prepare("SELECT id FROM orders WHERE public_number=?").get(data.orderNumber)?.id;
  if (r.headers.get("set-cookie")) data.cookie = r.headers.get("set-cookie")!.split(";")[0];
  return { status: r.status, data };
}
beforeEach(() => {
  const d = database();
  sql = d.sqlite;
  e = {
    DB: d.db,
    MODE: "local",
    PUBLIC_ORIGIN: origin,
    PAYMENTS_ENABLED: "false",
    EMAIL_ENABLED: "false",
    LABELS_ENABLED: "false",
  };
  vi.restoreAllMocks();
});
describe("checkout and inventory", () => {
  it("rejects local pickup without acknowledgment and without reserving inventory", async () => {
    const response = await call("/orders", {
      ...checkout(),
      localConsent: false,
    });
    expect(response.status).toBe(400);
    expect(sql.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(0);
  });
  it("records optional marketing consent and supports idempotent unsubscribe", async () => {
    const input = { ...checkout(), marketingConsent: true };
    expect((await call("/orders", input)).status).toBe(201);
    const subscriber = sql
      .prepare("SELECT * FROM marketing_subscribers")
      .get()!;
    expect(subscriber.consent).toBe(1);
    expect(subscriber.notice_version).toBe("2026-10-21");
    expect(Number(subscriber.recorded_at)).toBeGreaterThan(0);
    expect(
      (
        await call("/marketing/unsubscribe", {
          token: subscriber.unsubscribe_token,
        })
      ).status,
    ).toBe(200);
    expect((await call("/orders", input)).status).toBe(200);
    expect(
      sql.prepare("SELECT consent FROM marketing_subscribers").get()?.consent,
    ).toBe(0);
    expect(
      (
        await call("/marketing/unsubscribe", {
          token: subscriber.unsubscribe_token,
        })
      ).status,
    ).toBe(200);
  });
  it("never subscribes a buyer merely for giving an email", async () => {
    expect((await call("/orders", checkout())).status).toBe(201);
    expect(
      sql.prepare("SELECT consent FROM marketing_subscribers").get()?.consent,
    ).toBe(0);
  });
  it("calculates from server prices, normalizes phone and reserves stock atomically", async () => {
    const b = checkout();
    const o = await call("/orders", { ...b, total: 1, price: 1 });
    expect(o.status).toBe(201);
    expect(o.data.total).toBe(90000);
    expect(
      sql.prepare("SELECT stock FROM products WHERE id=?").get("demo-mesa")
        ?.stock,
    ).toBe(10);
    expect(checkoutSchema.parse(b).phone).toBe("+523312345678");
  });
  it("does not invent shipping before quotation; calculates discounts", async () => {
    const p = JSON.parse(
      String(
        sql.prepare("SELECT data FROM products WHERE id=?").get("demo-mesa")
          ?.data,
      ),
    ) as Product;
    const c = {
      code: "TEST",
      type: "percent",
      value: 10,
      starts: 0,
      expires: Date.now() + 10000,
      maxUses: 2,
      perCustomer: 1,
      minimum: 0,
      eligible: [],
      active: true,
      combinable: false,
    } as Coupon;
    expect(
      totals([{ id: p.id, quantity: 3 }], [p], "national", c),
    ).toMatchObject({
      shipping: 0,
      subtotal: 135000,
      discount: 13500,
      total: 121500,
    });
    expect(
      totals([{ id: p.id, quantity: 1 }], [p], "local", {
        ...c,
        type: "fixed",
        value: 999999,
      }).total,
    ).toBe(0);
  });
  it("rejects duplicate items, unavailable stock and invalid address", async () => {
    expect(
      (
        await call("/orders", {
          ...checkout(),
          items: [{ id: "demo-mesa", quantity: 13 }],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("/orders", {
          ...checkout(),
          items: [
            { id: "demo-mesa", quantity: 1 },
            { id: "demo-mesa", quantity: 1 },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/orders", {
          ...checkout(),
          delivery: "national",
          address: {},
        })
      ).status,
    ).toBe(400);
    expect(sql.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(0);
  });
  it("same idempotency key creates one order and rejects changed payload", async () => {
    const b = checkout(),
      first = await call("/orders", b),
      second = await call("/orders", b);
    expect(second.data.id).toBe(first.data.id);
    expect((await call("/orders", { ...b, name: "Changed" })).status).toBe(409);
    expect(sql.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(1);
  });
  it("SQL rollback prevents overselling even across separate reservations", async () => {
    const first = await call("/orders", {
      ...checkout(),
      items: [{ id: "demo-mesa", quantity: 10 }],
    });
    expect(first.status).toBe(201);
    const second = await call("/orders", {
      ...checkout(),
      items: [{ id: "demo-mesa", quantity: 3 }],
    });
    expect(second.status).toBe(409);
    expect(
      sql.prepare("SELECT stock FROM products WHERE id=?").get("demo-mesa")
        ?.stock,
    ).toBe(2);
  });
  it("enforces coupon total/customer limits in the same transaction", async () => {
    const c = JSON.parse(
      String(
        sql.prepare("SELECT data FROM coupons WHERE code='PRUEBA10'").get()
          ?.data,
      ),
    );
    c.maxUses = 1;
    sql
      .prepare("UPDATE coupons SET data=? WHERE code='PRUEBA10'")
      .run(JSON.stringify(c));
    expect(
      (await call("/orders", { ...checkout(), coupon: "PRUEBA10" })).status,
    ).toBe(201);
    expect(
      (await call("/orders", { ...checkout(), coupon: "PRUEBA10" })).status,
    ).toBe(409);
    expect(
      sql.prepare("SELECT stock FROM products WHERE id='demo-mesa'").get()
        ?.stock,
    ).toBe(10);
  });
  it("releases rejected reservations exactly once and protects late payments", async () => {
    const o = (await call("/orders", checkout())).data;
    await call(
      "/orders/" + o.id + "/simulate",
      { state: "rejected" },
      o.cookie,
    );
    await call(
      "/orders/" + o.id + "/simulate",
      { state: "rejected" },
      o.cookie,
    );
    expect(
      sql.prepare("SELECT stock FROM products WHERE id='demo-mesa'").get()
        ?.stock,
    ).toBe(12);
    expect(
      (
        await call(
          "/orders/" + o.id + "/simulate",
          { state: "paid" },
          o.cookie,
        )
      ).data.payment,
    ).toBe("review");
  });
  it("pending/approved/duplicate events do not duplicate emails or regress payment", async () => {
    const o = (await call("/orders", checkout())).data;
    expect(
      (
        await call(
          "/orders/" + o.id + "/simulate",
          { state: "pending" },
          o.cookie,
        )
      ).data.payment,
    ).toBe("pending");
    for (let i = 0; i < 2; i++)
      await call(
        "/orders/" + o.id + "/simulate",
        { state: "paid" },
        o.cookie,
      );
    expect(
      sql.prepare("SELECT count(*) n FROM outbox WHERE kind='paid'").get()?.n,
    ).toBe(1);
    expect(paymentTransition("paid", "pending")).toBe("paid");
    expect(
      (
        await call(
          "/orders/" + o.id + "/simulate",
          { state: "refunded" },
          o.cookie,
        )
      ).data.payment,
    ).toBe("refunded");
  });
  it("requires private token and refuses production local bypass", async () => {
    const o = (await call("/orders", checkout())).data;
    expect((await call("/orders/" + o.id)).status).toBe(403);
    expect(
      (
        await call(
          "/admin/overview",
          undefined,
          undefined,
          "https://marlo.games",
        )
      ).status,
    ).toBe(503);
    e.MODE = "production";
    expect(
      (
        await call(
          "/admin/overview",
          undefined,
          undefined,
          "https://marlo.games",
        )
      ).status,
    ).toBe(503);
  });
});
describe("shipping and fulfillment", () => {
  const address = {
    recipient: "Prueba",
    phone: "3312345678",
    email: "test@example.com",
    street: "Calle de prueba",
    exterior: "1",
    interior: "",
    postalCode: "45050",
    colony: "Ciudad del Sol",
    city: "Zapopan",
    state: "Jalisco",
    country: "MX",
    references: "",
  };
  it("keeps a configurable customer charge even when carrier costs less and deduplicates refreshed quotes", async () => {
    expect(
      (await call("/admin/content", { shippingFlatRate: 7000 })).status,
    ).toBe(200);
    const input = checkout();
    const q = (await call("/quotes", { items: input.items, address })).data;
    const row = sql.prepare("SELECT data FROM quotes WHERE id=?").get(q.id)!;
    sql
      .prepare("UPDATE quotes SET data=? WHERE id=?")
      .run(
        JSON.stringify({ ...JSON.parse(String(row.data)), cost: 5000 }),
        q.id,
      );
    const first = await call("/orders", {
      ...input,
      delivery: "national",
      address,
      quoteId: q.id,
      shipping: 1,
    });
    expect(first.status).toBe(201);
    expect(first.data.shipping).toBe(7000);
    expect(
      sql
        .prepare("SELECT shipping_cost FROM orders WHERE id=?")
        .get(first.data.id)?.shipping_cost,
    ).toBe(5000);
    const refreshed = (await call("/quotes", { items: input.items, address }))
      .data;
    const retry = await call("/orders", {
      ...input,
      delivery: "national",
      address,
      quoteId: refreshed.id,
    });
    expect(retry.data.id).toBe(first.data.id);
    expect(sql.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(1);
    expect(
      (await call("/admin/content", { shippingFlatRate: -1 })).status,
    ).toBe(400);
  });
  it("requires usable coverage and rejects an incomplete or inconsistent address", async () => {
    expect(
      (await call("/quotes", { items: checkout().items, address: {} })).status,
    ).toBe(400);
    expect(
      (
        await call("/quotes", {
          items: checkout().items,
          address: { ...address, postalCode: "00000" },
        })
      ).status,
    ).toBe(400);
  });
  it("validates a carrier quote for six games and separates flat charge from actual cost", async () => {
    sql.prepare("UPDATE products SET stock=100").run();
    const items = [{ id: "demo-mesa", quantity: 6 }];
    const q = await call("/quotes", { items, address });
    expect(q.status).toBe(200);
    expect(q.data.shipping).toBe(7000);
    expect(q.data.manualFulfillment).toBeUndefined();
    const order = await call("/orders", {
      ...checkout(),
      items,
      delivery: "national",
      address,
      quoteId: q.data.id,
    });
    expect(order.status).toBe(201);
    expect(order.data.shipping).toBe(7000);
    const o = order.data;
    await call(
      "/orders/" + o.id + "/simulate",
      { state: "paid" },
      o.cookie,
    );
    const internal = sql
      .prepare("SELECT recipient FROM outbox WHERE kind='manual_shipping'")
      .all();
    expect(internal).toEqual([]);
    const stored = sql
      .prepare("SELECT shipping,shipping_cost,data FROM orders WHERE id=?")
      .get(o.id)!;
    expect(stored.shipping).toBe(7000);
    expect(stored.shipping_cost).toBe(12500);
    expect(JSON.parse(String(stored.data)).quote.rateId).toBe("LOCAL-TEST");
    expect(
      (await call("/admin/order", { id: o.id, action: "label" })).status,
    ).toBe(200);
    expect(
      sql.prepare("SELECT logistics FROM orders WHERE id=?").get(o.id)
        ?.logistics,
    ).toBe("label_created");
  });
  it("expired quotes block checkout; outage does not invent coverage", async () => {
    const q = await call("/quotes", { items: checkout().items, address });
    expect(q.status).toBe(200);
    sql.prepare("UPDATE quotes SET expires=0").run();
    expect(
      (
        await call("/orders", {
          ...checkout(),
          delivery: "national",
          address,
          quoteId: q.data.id,
        })
      ).status,
    ).toBe(409);
    await expect(
      shippingProvider({ ...e, MODE: "sandbox" }).quote(address, []),
    ).rejects.toThrow(/Skydropx/);
  });
  it("rejects legacy free-text scheduling even for paid local orders", async () => {
    const o = (await call("/orders", checkout())).data;
    await call("/orders/" + o.id + "/simulate", {state:"paid"}, o.cookie);
    expect((await call("/admin/order", {id:o.id,action:"logistics",logistics:"scheduled",appointment:"2026-11-01T14:00"})).status).toBe(409);
    expect(sql.prepare("SELECT count(*) n FROM outbox WHERE kind='local'").get()?.n).toBe(0);
  });
  it("label is distinct from shipped and delivered, with shipping subsidy", async () => {
    const q = (await call("/quotes", { items: checkout().items, address }))
      .data;
    const o = (
      await call("/orders", {
        ...checkout(),
        delivery: "national",
        address,
        quoteId: q.id,
      })
    ).data;
    expect(o.shipping).toBe(7000);
    expect(
      (await call("/admin/order", { id: o.id, action: "label" })).status,
    ).toBe(409);
    await call(
      "/orders/" + o.id + "/simulate",
      { state: "paid" },
      o.cookie,
    );
    expect(
      (await call("/admin/order", { id: o.id, action: "label" })).status,
    ).toBe(200);
    expect(
      (await call("/orders/" + o.id, undefined, o.cookie)).data.logistics,
    ).toBe("label_created");
    for (const state of ["shipped", "delivered"])
      expect(
        (
          await call("/admin/order", {
            id: o.id,
            action: "logistics",
            logistics: state,
          })
        ).status,
      ).toBe(200);
    expect((await call("/admin/overview")).data.metrics.shippingSubsidy).toBe(
      5500,
    );
  });
});
describe("forms, mail and security", () => {
  it("adds a functional unsubscribe link to marketing and suppresses queued mail after opt out", async () => {
    await call("/orders", { ...checkout(), marketingConsent: true });
    sql.prepare("DELETE FROM outbox").run();
    sql
      .prepare(
        "INSERT INTO outbox(id,recipient,kind,payload) VALUES('campaign-1','prueba@example.com','marketing','{}')",
      )
      .run();
    sql.prepare("UPDATE outbox SET next_attempt=0").run();
    e.MODE = "sandbox";
    e.EMAIL_ENABLED = "true";
    e.RESEND_API_KEY = "test";
    e.EMAIL_FROM = "test@example.com";
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ id: "mail-test" }));
    await processOutbox(e);
    const subscriber = sql
      .prepare("SELECT unsubscribe_token FROM marketing_subscribers")
      .get()!;
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).html).toContain(
      "/baja-noticias#" + subscriber.unsubscribe_token,
    );
    sql.prepare("UPDATE marketing_subscribers SET consent=0").run();
    sql
      .prepare(
        "INSERT INTO outbox(id,recipient,kind,payload) VALUES('campaign-2','prueba@example.com','marketing','{}')",
      )
      .run();
    await processOutbox(e);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(
      sql.prepare("SELECT status FROM outbox WHERE id='campaign-2'").get()
        ?.status,
    ).toBe("suppressed");
  });
  it("validates wholesale, deduplicates requests and queues confirmation", async () => {
    const b = {
      store: "Tienda de prueba",
      name: "Persona",
      email: "shop@example.com",
      phone: "3312345678",
      city: "Guadalajara",
      state: "Jalisco",
      privacy: true,
    };
    expect((await call("/wholesale", { ...b, privacy: false })).status).toBe(
      400,
    );
    expect((await call("/wholesale", b)).status).toBe(201);
    expect((await call("/wholesale", b)).status).toBe(201);
    expect(sql.prepare("SELECT count(*) n FROM leads").get()?.n).toBe(1);
    expect(sql.prepare("SELECT count(*) n FROM outbox").get()?.n).toBe(1);
  });
  it("escapes email content and only previews locally", async () => {
    await call("/orders", checkout());
    expect(
      renderEmail("paid", { id: "<script>alert(1)</script>" }).html,
    ).not.toContain("<script>");
    const spy = vi.spyOn(globalThis, "fetch");
    sql.prepare("UPDATE outbox SET next_attempt=0").run();
    await processOutbox(e);
    expect(spy).not.toHaveBeenCalled();
    expect(sql.prepare("SELECT status FROM outbox").get()?.status).toBe(
      "preview",
    );
  });
  it("email failures retry with backoff and stop at five", async () => {
    await call("/orders", checkout());
    sql.prepare("UPDATE outbox SET next_attempt=0").run();
    e.MODE = "sandbox";
    e.EMAIL_ENABLED = "true";
    e.RESEND_API_KEY = "test-key";
    e.EMAIL_FROM = "test@example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "provider unavailable" }, { status: 503 }),
    );
    await processOutbox(e);
    expect(
      sql.prepare("SELECT attempts,status FROM outbox").get(),
    ).toMatchObject({ attempts: 1, status: "pending" });
    for (let i = 0; i < 4; i++) {
      sql.prepare("UPDATE outbox SET next_attempt=0").run();
      await processOutbox(e);
    }
    expect(
      sql.prepare("SELECT attempts,status FROM outbox").get(),
    ).toMatchObject({ attempts: 5, status: "failed" });
  });
  it("rejects forged webhook and no payment starts with disabled credentials", async () => {
    e.MODE = "sandbox";
    expect((await call("/webhooks/paypal", { id: "fake" })).status).toBe(503);
  });
  it("enforces request origin on mutations", async () => {
    const r = await worker.fetch(
      new Request("http://127.0.0.1:8788/api/orders", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: JSON.stringify(checkout()),
      }),
      e,
    );
    expect(r.status).toBe(403);
  });
  it("hides fixtures outside local mode", async () => {
    e.MODE = "production";
    expect((await call("/catalog")).data.products).toEqual([]);
  });
});
