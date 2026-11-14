import { BusinessError, type PaymentState } from "../src/domain";
import type { Env, OrderRow } from "./types";
import { quoteSkydropx } from "./skydropx";
async function request(
  url: string,
  init: RequestInit,
  acceptRejectedOrder = false,
) {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new BusinessError(
      "El proveedor no está disponible. Vuelve a intentar.",
      503,
    );
  }
  if (acceptRejectedOrder && r.status === 402) {
    const rejected: any = await r.json();
    if (
      typeof rejected.data?.id === "string" &&
      rejected.data.status === "failed"
    )
      return rejected.data;
  }
  if (!r.ok)
    throw new BusinessError(
      "El proveedor no pudo completar la solicitud.",
      502,
    );
  return r.json() as Promise<any>;
}
const amount = (o: OrderRow) => (o.total / 100).toFixed(2);
export function enabledProviders(e: Env) {
  return {
    paypal:
      e.MODE === "local" ||
      (e.PAYMENTS_ENABLED === "true" &&
        e.PAYPAL_ENABLED === "true" &&
        !!e.PAYPAL_CLIENT_ID &&
        !!e.PAYPAL_CLIENT_SECRET &&
        !!e.PAYPAL_WEBHOOK_ID),
    mercadopago:
      e.MODE === "local" ||
      (e.PAYMENTS_ENABLED === "true" &&
        e.MP_ENABLED === "true" &&
        !!e.MP_ACCESS_TOKEN &&
        !!e.MP_PUBLIC_KEY &&
        !!e.MP_WEBHOOK_SECRET),
  };
}
function paymentGate(e: Env) {
  if (
    !["sandbox", "production"].includes(e.MODE) ||
    e.PAYMENTS_ENABLED !== "true"
  )
    throw new BusinessError(
      "Los pagos externos no están habilitados. No se realizó ningún cobro.",
      503,
    );
}
function paypalBase(e: Env) {
  if (e.PAYPAL_ENVIRONMENT !== (e.MODE === "production" ? "live" : "sandbox"))
    throw new BusinessError(
      "El ambiente PayPal no coincide con la aplicación.",
      503,
    );
  return e.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}
async function paypalToken(e: Env) {
  if (!e.PAYPAL_CLIENT_ID || !e.PAYPAL_CLIENT_SECRET)
    throw new BusinessError("PayPal sandbox pendiente de configurar.", 503);
  const data = await request(paypalBase(e) + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + btoa(e.PAYPAL_CLIENT_ID + ":" + e.PAYPAL_CLIENT_SECRET),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  return data.access_token as string;
}
async function paypal(
  e: Env,
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const token = await paypalToken(e);
  return request(paypalBase(e) + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(key ? { "PayPal-Request-Id": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function mp(
  e: Env,
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  if (!e.MP_ACCESS_TOKEN)
    throw new BusinessError(
      "Mercado Pago sandbox pendiente de configurar.",
      503,
    );
  return request(
    "https://api.mercadopago.com" + path,
    {
      method,
      headers: {
        Authorization: "Bearer " + e.MP_ACCESS_TOKEN,
        "Content-Type": "application/json",
        ...(key ? { "X-Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    method === "POST" && path === "/v1/orders",
  );
}
export async function cardBrands(e: Env, total: number) {
  if (!enabledProviders(e).mercadopago || e.MODE === "local") return [];
  const methods = await mp(e, "/v1/payment_methods");
  if (!Array.isArray(methods))
    throw new BusinessError(
      "No pudimos verificar las tarjetas disponibles.",
      503,
    );
  return methods
    .filter(
      (m: any) =>
        m.status === "active" &&
        ["credit_card", "debit_card"].includes(m.payment_type_id) &&
        Number.isFinite(m.min_allowed_amount) &&
        Number.isFinite(m.max_allowed_amount) &&
        total / 100 >= m.min_allowed_amount &&
        total / 100 <= m.max_allowed_amount &&
        typeof m.secure_thumbnail === "string" &&
        /^https:\/\//.test(m.secure_thumbnail),
    )
    .map((m: any) => ({ id: m.id, name: m.name, logo: m.secure_thumbnail }));
}
export async function createPayment(
  e: Env,
  o: OrderRow,
  card?: {
    token: string;
    payment_method_id: string;
    installments: number;
    issuer_id?: string;
  },
) {
  paymentGate(e);
  if (!enabledProviders(e)[o.provider])
    throw new BusinessError(
      "Este proveedor de pago aún no está habilitado.",
      503,
    );
  if (o.provider === "paypal") {
    const d = await paypal(
      e,
      "/v2/checkout/orders",
      "POST",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: o.id,
            amount: { currency_code: "MXN", value: amount(o) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: e.PUBLIC_ORIGIN + "/checkout/paypal/return",
              cancel_url: e.PUBLIC_ORIGIN + "/checkout/paypal/cancel",
            },
          },
        },
      },
      o.id,
    );
    return { id: d.id as string };
  }
  if (
    !card?.token ||
    !card.payment_method_id ||
    !Number.isInteger(card.installments)
  )
    throw new BusinessError("Completa el formulario seguro de Mercado Pago.");
  const methods = await mp(e, "/v1/payment_methods");
  const selected =
    Array.isArray(methods) &&
    methods.find(
      (m: any) =>
        m.id === card.payment_method_id &&
        m.status === "active" &&
        ["credit_card", "debit_card"].includes(m.payment_type_id) &&
        o.total / 100 >= m.min_allowed_amount &&
        o.total / 100 <= m.max_allowed_amount,
    );
  if (!selected)
    throw new BusinessError(
      "Esta tarjeta no está disponible para el importe del pedido. Elige otro medio de pago.",
      409,
    );
  const d = await mp(
    e,
    "/v1/orders",
    "POST",
    {
      type: "online",
      processing_mode: "automatic",
      total_amount: amount(o),
      external_reference: o.id,
      payer: { email: o.email },
      transactions: {
        payments: [
          {
            amount: amount(o),
            payment_method: {
              id: card.payment_method_id,
              type: selected.payment_type_id,
              token: card.token,
              installments: card.installments,
            },
          },
        ],
      },
    },
    o.id,
  );
  return { id: d.id as string };
}
export async function capturePaypal(e: Env, o: OrderRow) {
  paymentGate(e);
  if (!o.provider_id) throw new BusinessError("Falta la orden de PayPal.");
  await paypal(
    e,
    `/v2/checkout/orders/${encodeURIComponent(o.provider_id)}/capture`,
    "POST",
    {},
    o.id + "-capture",
  );
}
export async function paymentStatus(
  e: Env,
  o: OrderRow,
): Promise<PaymentState> {
  paymentGate(e);
  if (!o.provider_id)
    throw new BusinessError("No existe una transacción asociada.", 409);
  if (o.provider === "paypal") {
    const d = await paypal(
      e,
      `/v2/checkout/orders/${encodeURIComponent(o.provider_id)}`,
    );
    const unit = d.purchase_units?.[0];
    if (
      unit?.custom_id !== o.id ||
      unit?.amount?.currency_code !== "MXN" ||
      Math.round(Number(unit?.amount?.value) * 100) !== o.total ||
      d.purchase_units?.length !== 1
    )
      throw new BusinessError(
        "El pago requiere revisión: importe o referencia distintos.",
        409,
      );
    const c = unit.payments?.captures?.[0];
    o.verified_payment_status = c?.status || d.status;
    if (
      c?.status === "COMPLETED" &&
      c.amount?.currency_code === "MXN" &&
      Math.round(Number(c.amount.value) * 100) === o.total
    )
      return "paid";
    if (c?.status === "REFUNDED") return "refunded";
    if (c?.status === "PARTIALLY_REFUNDED") return "review";
    if (c?.status === "DECLINED" || d.status === "VOIDED") return "rejected";
    return "pending";
  }
  const d = await mp(e, `/v1/orders/${encodeURIComponent(o.provider_id)}`);
  if (
    d.external_reference !== o.id ||
    d.currency !== "MXN" ||
    (typeof d.live_mode === "boolean" &&
      d.live_mode !== (e.MODE === "production")) ||
    Math.round(Number(d.total_amount) * 100) !== o.total
  )
    throw new BusinessError(
      "El pago requiere revisión: importe o referencia distintos.",
      409,
    );
  o.verified_payment_status = d.status;
  if (d.status === "processed" && d.status_detail === "accredited")
    return "paid";
  if (d.status === "refunded") return "refunded";
  if (["failed", "canceled", "expired"].includes(d.status)) return "rejected";
  return "pending";
}
export async function verifyWebhook(
  e: Env,
  r: Request,
  provider: string,
  body: any,
) {
  if (!["sandbox", "production"].includes(e.MODE))
    throw new BusinessError("Webhooks externos deshabilitados.", 503);
  if (provider === "paypal") {
    if (!e.PAYPAL_WEBHOOK_ID)
      throw new BusinessError("Webhook pendiente de configurar.", 503);
    if (
      [
        "paypal-auth-algo",
        "paypal-cert-url",
        "paypal-transmission-id",
        "paypal-transmission-sig",
        "paypal-transmission-time",
      ].some((name) => !r.headers.get(name)?.trim())
    )
      throw new BusinessError("Firma inválida.", 401);
    const result = await paypal(
      e,
      "/v1/notifications/verify-webhook-signature",
      "POST",
      {
        auth_algo: r.headers.get("paypal-auth-algo"),
        cert_url: r.headers.get("paypal-cert-url"),
        transmission_id: r.headers.get("paypal-transmission-id"),
        transmission_sig: r.headers.get("paypal-transmission-sig"),
        transmission_time: r.headers.get("paypal-transmission-time"),
        webhook_id: e.PAYPAL_WEBHOOK_ID,
        webhook_event: body,
      },
    );
    if (result.verification_status !== "SUCCESS")
      throw new BusinessError("Firma inválida.", 401);
    return;
  }
  if (!e.MP_WEBHOOK_SECRET)
    throw new BusinessError("Webhook pendiente de configurar.", 503);
  const parts = Object.fromEntries(
    (r.headers.get("x-signature") || "")
      .split(",")
      .map((x) => x.trim().split("=")),
  );
  const id = new URL(r.url).searchParams.get("data.id"),
    rid = r.headers.get("x-request-id");
  if (
    !id ||
    !rid ||
    !parts.ts ||
    !parts.v1 ||
    !/^[a-f0-9]{64}$/i.test(parts.v1)
  )
    throw new BusinessError("Firma inválida.", 401);
  const stamp = Number(parts.ts);
  if (
    !Number.isFinite(stamp) ||
    Math.abs(Date.now() - (stamp < 1e12 ? stamp * 1000 : stamp)) > 300000
  )
    throw new BusinessError("Notificación vencida.", 401);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(e.MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sig = Uint8Array.from(
    parts.v1.match(/../g)!.map((h: string) => parseInt(h, 16)),
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(`id:${id};request-id:${rid};ts:${parts.ts};`),
  );
  if (!valid || String(body.data?.id) !== id)
    throw new BusinessError("Firma inválida.", 401);
}
// Call only after signature verification. Resolve refund IDs through the capture
// API rather than mistaking them for checkout order IDs. Never fetch event URLs.
export async function paypalWebhookOrderId(
  e: Env,
  event: any,
): Promise<string> {
  const resource = event.resource || {};
  const related = resource.supplementary_data?.related_ids?.order_id;
  if (typeof related === "string" && related) return related;
  if (String(event.event_type).startsWith("CHECKOUT.ORDER."))
    return String(resource.id || "");
  let captureId = String(resource.id || "");
  if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
    const refund = await paypal(
      e,
      "/v2/payments/refunds/" + encodeURIComponent(captureId),
    );
    const up = refund.links?.find((link: any) => link.rel === "up");
    let path = "";
    try {
      path = new URL(up?.href).pathname;
    } catch {
      /* No usable parent. */
    }
    captureId =
      path.match(/^\/v2\/payments\/captures\/([A-Za-z0-9]+)$/)?.[1] || "";
  }
  if (!captureId)
    throw new BusinessError(
      "No se pudo relacionar la notificación con una captura.",
      409,
    );
  const capture = await paypal(
    e,
    "/v2/payments/captures/" + encodeURIComponent(captureId),
  );
  const orderId = capture.supplementary_data?.related_ids?.order_id;
  if (typeof orderId !== "string" || !orderId)
    throw new BusinessError("Captura sin pedido relacionado.", 409);
  return orderId;
}
export async function refundPayment(e: Env, o: OrderRow) {
  paymentGate(e);
  if (o.payment !== "paid")
    throw new BusinessError("El pago no admite reembolso.", 409);
  const state = await paymentStatus(e, o);
  // Recover an earlier successful refund whose response/webhook was lost.
  if (state === "refunded") return;
  if (state !== "paid") throw new BusinessError("El pago no admite reembolso.", 409);
  if (o.provider === "mercadopago") {
    try { await mp(
      e,
      `/v1/orders/${encodeURIComponent(o.provider_id!)}/refund`,
      "POST",
      undefined,
      o.id + "-refund",
    ); } catch (error) {
      // A timeout or provider rejection is not proof that money was returned.
      // Read back before asking the operator to retry with the same key.
      if (await paymentStatus(e, o).catch(() => "review") === "refunded") return;
      throw new BusinessError("Mercado Pago todavía no confirmó el reembolso. El pedido conserva su estado; vuelve a consultar y reintenta desde este mismo pedido. Si persiste, contacta al proveedor.", 502);
    }
  } else {
    const d = await paypal(
      e,
      `/v2/checkout/orders/${encodeURIComponent(o.provider_id!)}`,
    );
    const capture = d.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture?.id || capture.status !== "COMPLETED")
      throw new BusinessError("Captura no disponible para reembolso.", 409);
    await paypal(
      e,
      `/v2/payments/captures/${encodeURIComponent(capture.id)}/refund`,
      "POST",
      {},
      o.id + "-refund",
    );
  }
}
// Skydropx's account-specific API contract must be verified before enabling real labels.
export interface ShippingQuote {
  id: string;
  rateId: string;
  carrier: string;
  cost: number;
  expires: number;
  fixture: boolean;
  manualFulfillment?: boolean;
  service?: string;
  rateCost?: number;
  transitDays?: number;
  method?: "pickup" | "dropoff";
  officeId?: string;
  savings?: number;
  rationale?: string;
  parcels?: { weight: number; length: number; width: number; height: number }[];
  packaging?: {
    parcels: import("../src/packaging").PackedParcel["packaging"][];
    costCents: number | null;
    config: unknown;
  };
}
export interface ShippingProvider {
  quote(address: unknown, parcels: unknown): Promise<ShippingQuote>;
  label(
    quote: ShippingQuote,
    orderId: string,
  ): Promise<{ tracking: string; labelUrl: string }>;
}
export function shippingProvider(e: Env): ShippingProvider {
  if (e.MODE === "local")
    return {
      async quote() {
        return {
          id: crypto.randomUUID(),
          rateId: "LOCAL-TEST",
          carrier: "Paquetería de prueba (sin envío real)",
          cost: 12500,
          expires: Date.now() + 15 * 60000,
          fixture: true,
        };
      },
      async label(q, id) {
        if (q.expires <= Date.now())
          throw new BusinessError(
            "Cotización vencida. Renueva antes de generar la guía.",
            409,
          );
        return { tracking: "DEMO-" + id, labelUrl: "" };
      },
    };
  return {
    async quote(address, parcels) {
      return quoteSkydropx(e, address, parcels);
    },
    async label() {
      throw new BusinessError(
        "Generación de guías deshabilitada hasta validar Skydropx.",
        503,
      );
    },
  };
}
