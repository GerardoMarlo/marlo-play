import { it, expect, vi, afterEach } from "vitest";
import { quoteSkydropx } from "../api/skydropx";
import {
  createPayment,
  paymentStatus,
  verifyWebhook,
  refundPayment,
  cardBrands,
} from "../api/providers";
import type { Env, OrderRow } from "../api/types";
const e = {
  MODE: "sandbox",
  PUBLIC_ORIGIN: "https://marlo.games",
  PAYPAL_ENVIRONMENT: "sandbox",
  SKYDROPX_ENVIRONMENT: "sandbox",
  SHIPPING_SERVICES_JSON: JSON.stringify([
    {
      carrier: "test",
      service: "standard",
      homeDelivery: true,
      businessDays: true,
      source: "provider verified test fixture",
      validUntil: Date.now() + 86400000,
      pickup: { extraCents: 0, source: "verified inclusive quote" },
    },
  ]),
  PAYMENTS_ENABLED: "true",
  PAYPAL_ENABLED: "true",
  MP_ENABLED: "true",
  PAYPAL_WEBHOOK_ID: "test",
  MP_PUBLIC_KEY: "test",
  SKYDROPX_CLIENT_ID: "test",
  SKYDROPX_CLIENT_SECRET: "test",
  SHIPPING_ORIGIN_JSON: JSON.stringify({
    country_code: "MX",
    postal_code: "45050",
    area_level1: "Jalisco",
    area_level2: "Zapopan",
    area_level3: "Ciudad del Sol",
  }),
  PAYPAL_CLIENT_ID: "test",
  PAYPAL_CLIENT_SECRET: "test",
  MP_ACCESS_TOKEN: "TEST-test",
  MP_WEBHOOK_SECRET: "test",
} as Env;
const address = {
  recipient: "Prueba",
  phone: "3312345678",
  email: "test@example.com",
  street: "Calle",
  exterior: "1",
  postalCode: "45050",
  colony: "Ciudad del Sol",
  city: "Zapopan",
  state: "Jalisco",
  country: "MX",
};
const parcels = [{ quantity: 2, weight: 1, length: 20, width: 20, height: 5 }];
const o = {
  id: "MG-test",
  provider: "paypal",
  provider_id: "provider-test",
  email: "test@example.com",
  total: 45000,
} as OrderRow;
afterEach(() => vi.restoreAllMocks());
it("sends a full Mercado Pago refund without a body and keeps its idempotency key", async () => {
  const paid = { ...o, provider: "mercadopago", payment: "paid" } as OrderRow;
  const transport = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({
        id: o.provider_id,
        external_reference: o.id,
        total_amount: "450.00",
        currency: "MXN",
        status: "processed",
        status_detail: "accredited",
        transactions: {
          payments: [{ status: "processed", status_detail: "accredited" }],
        },
      }),
    )
    .mockResolvedValueOnce(Response.json({ status: "refunded" }));
  await refundPayment(e, paid);
  expect(transport.mock.calls[1][1]?.body).toBeUndefined();
  expect(
    (transport.mock.calls[1][1]?.headers as Record<string, string>)[
      "X-Idempotency-Key"
    ],
  ).toBe(o.id + "-refund");
});
it("polls until the shipping quote completes and selects usable MXN rates", async () => {
  const requests: any[] = [];
  const replies = [
    { access_token: "test" },
    { id: "q", is_completed: false },
    {
      id: "q",
      is_completed: true,
      rates: [
        {
          id: "bad",
          success: false,
          currency_code: "MXN",
          total: 1,
          provider_name: "bad",
        },
        {
          id: "r",
          success: true,
          currency_code: "MXN",
          total: 125.5,
          provider_name: "test",
          provider_service_code: "standard",
          office_delivery: false,
          requires_origin_verification: false,
          days: 3,
          pickup: true,
          pickup_ocurre: true,
          pickup_package_min: 1,
          shipment_creation_type: "single",
        },
      ],
    },
  ];
  const transport = vi.fn(async (url: any, init: any) => {
    requests.push({ url, init });
    return Response.json(replies.shift());
  });
  const q = await quoteSkydropx(
    e,
    address,
    parcels,
    transport as typeof fetch,
    async () => {},
  );
  expect(q.cost).toBe(12550);
  expect(q.rateId).toBe("r");
  expect(q.fixture).toBe(false);
  expect(JSON.parse(requests[1].init.body).quotation.parcels).toHaveLength(1);
  expect(requests[2].url).toContain("/quotations/q");
});
it("does not accept partial rates or invent coverage during an outage", async () => {
  const partial = vi.fn(async () =>
    Response.json({
      access_token: "x",
      id: "q",
      is_completed: false,
      rates: [],
    }),
  );
  await expect(
    quoteSkydropx(e, address, parcels, partial as typeof fetch, async () => {}),
  ).rejects.toThrow(/proceso/);
  const unavailable = vi.fn(async () => new Response("", { status: 503 }));
  await expect(
    quoteSkydropx(
      e,
      address,
      parcels,
      unavailable as typeof fetch,
      async () => {},
    ),
  ).rejects.toThrow(/autenticó/);
});
it("rejects a completed quotation without usable coverage", async () => {
  const responses = [
    { access_token: "x" },
    { id: "q", is_completed: true, rates: [] },
  ];
  await expect(
    quoteSkydropx(
      e,
      address,
      parcels,
      vi.fn(async () => Response.json(responses.shift())) as typeof fetch,
      async () => {},
    ),
  ).rejects.toThrow(/cobertura/);
});
it("PayPal order uses server amount and idempotency key; captures must match reference", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ access_token: "x" }))
    .mockResolvedValueOnce(Response.json({ id: "provider-test" }));
  await createPayment(e, o);
  const [, init] = spy.mock.calls[1];
  expect(JSON.parse(String(init?.body)).purchase_units[0].amount).toEqual({
    currency_code: "MXN",
    value: "450.00",
  });
  expect((init?.headers as any)["PayPal-Request-Id"]).toBe(o.id);
  spy
    .mockResolvedValueOnce(Response.json({ access_token: "x" }))
    .mockResolvedValueOnce(
      Response.json({
        purchase_units: [
          {
            custom_id: "other",
            amount: { currency_code: "MXN", value: "450.00" },
          },
        ],
      }),
    );
  await expect(paymentStatus(e, o)).rejects.toThrow(/referencia/);
});
it("Mercado Pago sends tokenized data, not raw card information", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json([
        {
          id: "visa",
          status: "active",
          payment_type_id: "credit_card",
          min_allowed_amount: 1,
          max_allowed_amount: 100000,
        },
      ]),
    )
    .mockResolvedValue(Response.json({ id: "mp-test" }));
  await createPayment(
    e,
    { ...o, provider: "mercadopago" },
    { token: "secure-token", payment_method_id: "visa", installments: 1, issuer_id: "123" },
  );
  const body = JSON.parse(String(spy.mock.calls[1][1]?.body));
  expect(body.total_amount).toBe("450.00");
  expect(body.transactions.payments[0].payment_method.token).toBe(
    "secure-token",
  );
  expect(JSON.stringify(body)).not.toMatch(/cvv|card_number/);
  // Bricks returns issuer_id for Payments API; Orders API rejects that property.
  expect(body.transactions.payments[0].payment_method).not.toHaveProperty("issuer_id");
});
it("uses the provider's debit type and filters card logos by active status and amount", async () => {
  const methods = [
    {
      id: "debvisa",
      name: "Visa débito",
      status: "active",
      payment_type_id: "debit_card",
      min_allowed_amount: 5,
      max_allowed_amount: 300000,
      secure_thumbnail: "https://example.com/visa.png",
    },
    {
      id: "disabled",
      status: "inactive",
      payment_type_id: "credit_card",
      min_allowed_amount: 1,
      max_allowed_amount: 300000,
      secure_thumbnail: "https://example.com/no.png",
    },
  ];
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json(methods))
    .mockResolvedValueOnce(Response.json({ id: "debit-test" }));
  await createPayment(
    e,
    { ...o, provider: "mercadopago" },
    { token: "test-token", payment_method_id: "debvisa", installments: 1 },
  );
  expect(
    JSON.parse(String(spy.mock.calls[1][1]?.body)).transactions.payments[0]
      .payment_method.type,
  ).toBe("debit_card");
  spy.mockImplementation(async () => Response.json(methods));
  expect(await cardBrands(e, 25900)).toEqual([
    {
      id: "debvisa",
      name: "Visa débito",
      logo: "https://example.com/visa.png",
    },
  ]);
  expect(await cardBrands(e, 100)).toEqual([]);
  await expect(
    createPayment(
      e,
      { ...o, provider: "mercadopago" },
      { token: "test-token", payment_method_id: "disabled", installments: 1 },
    ),
  ).rejects.toThrow(/no está disponible/);
});
it("preserves Mercado Pago rejected order reference returned with HTTP 402", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json([
        {
          id: "master",
          status: "active",
          payment_type_id: "credit_card",
          min_allowed_amount: 1,
          max_allowed_amount: 100000,
        },
      ]),
    )
    .mockResolvedValue(
      Response.json(
        {
          errors: [{ code: "failed" }],
          data: { id: "ORDTST-rejected", status: "failed" },
        },
        { status: 402 },
      ),
    );
  expect(
    await createPayment(
      e,
      { ...o, provider: "mercadopago" },
      { token: "test-token", payment_method_id: "master", installments: 1 },
    ),
  ).toEqual({ id: "ORDTST-rejected" });
});
it("authenticates Mercado Pago notifications and rejects altered IDs", async () => {
  const ts = String(Math.floor(Date.now() / 1000)),
    id = "mp123",
    rid = "req1";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`id:${id};request-id:${rid};ts:${ts};`),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const request = new Request(
    "https://example.com/api/webhooks/mercadopago?data.id=" + id,
    { headers: { "x-signature": `ts=${ts},v1=${sig}`, "x-request-id": rid } },
  );
  await expect(
    verifyWebhook(e, request, "mercadopago", { data: { id } }),
  ).resolves.toBeUndefined();
  await expect(
    verifyWebhook(e, request, "mercadopago", { data: { id: "altered" } }),
  ).rejects.toThrow(/Firma/);
});
it("external payments require explicit enablement in production", async () => {
  const spy = vi.spyOn(globalThis, "fetch");
  await expect(
    createPayment({ ...e, MODE: "production", PAYMENTS_ENABLED: "false" }, o),
  ).rejects.toThrow(/habilitados/);
  expect(spy).not.toHaveBeenCalled();
});
