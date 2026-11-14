import { it, expect, vi, afterEach } from "vitest";
import worker from "../api/worker";
import { database } from "./db";
import { paymentStatus, verifyWebhook } from "../api/providers";
import type { Env, OrderRow } from "../api/types";
afterEach(() => vi.restoreAllMocks());
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
  const r = await worker.fetch(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: JSON.stringify({
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
      }),
    }),
    e,
  );
  const o: any = await r.json();
  o.cookie = r.headers.get("set-cookie")!.split(";")[0];
  o.id = sqlite.prepare("SELECT id FROM orders WHERE public_number=?").get(o.orderNumber)?.id;
  sqlite.prepare("UPDATE orders SET provider_id='PP-123' WHERE id=?").run(o.id);
  Object.assign(e, {
    MODE: "sandbox",
    PUBLIC_ORIGIN: "https://marlo.games",
    PAYMENTS_ENABLED: "true",
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "test",
    PAYPAL_CLIENT_SECRET: "test",
  });
  return { e, sqlite, o };
}
it("captures PayPal on valid return and verifies before success, duplicates capture only once", async () => {
  const { e, sqlite, o } = await setup();
  let captured = false,
    captures = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/oauth2/token"))
      return Response.json({ access_token: "test" });
    if (path.endsWith("/capture")) {
      captured = true;
      captures++;
      return Response.json({ status: "COMPLETED" });
    }
    return Response.json({
      purchase_units: [
        {
          custom_id: o.id,
          amount: { currency_code: "MXN", value: "450.00" },
          payments: {
            captures: captured
              ? [
                  {
                    status: "COMPLETED",
                    amount: { currency_code: "MXN", value: "450.00" },
                  },
                ]
              : [],
          },
        },
      ],
    });
  });
  const req = () =>
    new Request("https://marlo.games/checkout/paypal/return?token=PP-123", {
      headers: { Cookie: o.cookie },
    });
  for (let i = 0; i < 2; i++) {
    const r = await worker.fetch(req(), e);
    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toContain("/pedido/confirmacion");
  }
  expect(captures).toBe(1);
  expect(
    sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='paid'").get()?.n,
  ).toBe(1);
});
it("does not capture using only a query token or a mismatched session", async () => {
  const { e, o } = await setup(),
    spy = vi.spyOn(globalThis, "fetch");
  expect(
    (
      await worker.fetch(
        new Request("https://marlo.games/checkout/paypal/return?token=PP-123"),
        e,
      )
    ).headers.get("Location"),
  ).toContain("consultar-pedido");
  const r = await worker.fetch(
    new Request("https://marlo.games/checkout/paypal/return?token=OTHER", {
      headers: { Cookie: o.cookie },
    }),
    e,
  );
  expect(r.status).toBe(403);
  expect(spy).not.toHaveBeenCalled();
});
it("cancellation returns to checkout without releasing stock or changing payment", async () => {
  const { e, sqlite } = await setup();
  const r = await worker.fetch(
    new Request("https://marlo.games/checkout/paypal/cancel"),
    e,
  );
  expect(r.headers.get("Location")).toBe(
    "https://marlo.games/checkout?payment=cancelled",
  );
  expect(sqlite.prepare("SELECT payment FROM orders").get()?.payment).toBe(
    "pending",
  );
});
it.each(["PENDING", "DECLINED"])(
  "does not confirm a %s capture",
  async (status) => {
    const { e, o } = await setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/oauth2/token")
        ? Response.json({ access_token: "test" })
        : Response.json({
            purchase_units: [
              {
                custom_id: o.id,
                amount: { currency_code: "MXN", value: "450.00" },
                payments: {
                  captures: [
                    {
                      status,
                      amount: { currency_code: "MXN", value: "450.00" },
                    },
                  ],
                },
              },
            ],
          }),
    );
    const result = await paymentStatus(e, {
      ...o,
      provider_id: "PP-123",
    } as OrderRow);
    expect(result).toBe(status === "PENDING" ? "pending" : "rejected");
  },
);
it("production PayPal webhooks use live signature verification and reject forged events", async () => {
  const e = {
    MODE: "production",
    PAYPAL_ENVIRONMENT: "live",
    PAYPAL_CLIENT_ID: "test",
    PAYPAL_CLIENT_SECRET: "test",
    PAYPAL_WEBHOOK_ID: "hook",
  } as Env;
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ access_token: "test" }))
    .mockResolvedValueOnce(Response.json({ verification_status: "FAILURE" }));
  await expect(
    verifyWebhook(
      e,
      new Request("https://marlo.games/api/webhooks/paypal", {headers: {
        "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/v1/notifications/certs/test",
        "paypal-transmission-id": "test", "paypal-transmission-sig": "forged", "paypal-transmission-time": new Date().toISOString(),
      }}),
      "paypal",
      { id: "forged" },
    ),
  ).rejects.toThrow(/Firma/);
  expect(String(spy.mock.calls[1][0])).toBe(
    "https://api-m.paypal.com/v1/notifications/verify-webhook-signature",
  );
});
it("Mercado Pago does not accept wrong currency or mismatched amount", async () => {
  const e = {
    MODE: "production",
    PAYMENTS_ENABLED: "true",
    MP_ACCESS_TOKEN: "test",
  } as Env;
  const o = {
    id: "MG-test",
    provider_id: "MP-123",
    provider: "mercadopago",
    total: 25900,
  } as OrderRow;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      external_reference: o.id,
      total_amount: "259.00",
      currency: "USD",
      status: "processed",
      status_detail: "accredited",
    }),
  );
  await expect(paymentStatus(e, o)).rejects.toThrow(/importe/);
});
it("rejects unsigned PayPal events before contacting the provider", async () => {
  const spy = vi.spyOn(globalThis, "fetch");
  await expect(verifyWebhook({MODE: "production", PAYPAL_WEBHOOK_ID: "hook"} as Env,
    new Request("https://marlo.games/api/webhooks/paypal"), "paypal", {id: "forged"})).rejects.toThrow(/Firma/);
  expect(spy).not.toHaveBeenCalled();
});
