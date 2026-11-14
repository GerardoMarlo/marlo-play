import { customerPickup, adminPickup, processPickups, markPickup } from "./local-pickup";
import {
  sessionOrder,
  issueSession,
  authorizeOrder,
  requestCode,
  verifyCode,
} from "./order-access";
import { z } from "zod";
import {
  commercialName,
  addressSchema,
  cartSchema,
  checkoutSchema,
  couponSchema,
  productSchema,
  leadSchema,
  totals,
  BusinessError,
  paymentTransition,
  logisticsTransition,
  type Product,
  type Coupon,
  type Checkout,
  type PaymentState,
} from "../src/domain";
import { defaultContent } from "../src/content";
import {
  admin,
  antiBot,
  hash,
  isLocal,
  originGuard,
  rateLimit,
} from "./security";
import {
  enabledProviders,
  refundPayment,
  createPayment,
  cardBrands,
  capturePaypal,
  paymentStatus,
  paypalWebhookOrderId,
  verifyWebhook,
  shippingProvider,
} from "./providers";
import { lifecycle, readiness } from "./readiness";
import { pack } from "./shipping-policy";
import { verifyShippingWebhook } from "./shipping-webhook";
import { publicTracking, registerTracking, refreshTracking } from "./tracking";
import { packagingEnvironment } from "./packaging-config";
import { packagingConfigSchema, planPackaging } from "../src/packaging";
import {
  prepareShipment,
  createShipment,
  getShipment,
  skyClient,
} from "./skydropx";
import { emailCopy, mailStatement, processOutbox, renderEmail } from "./emails";
import type { Env, OrderRow } from "./types";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function body(r: Request) {
  if (Number(r.headers.get("Content-Length")) > 64000)
    throw new BusinessError("Solicitud demasiado grande.", 413);
  const text = await r.text();
  if (text.length > 64000)
    throw new BusinessError("Solicitud demasiado grande.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new BusinessError("JSON inválido.");
  }
}
async function products(e: Env) {
  const rows = await e.DB.prepare(
    "SELECT data,stock,version FROM products",
  ).all<{ data: string; stock: number; version: number }>();
  return rows.results.map(
    (r) =>
      ({
        ...JSON.parse(r.data),
        stock: r.stock,
        version: r.version,
      }) as Product & { version: number },
  );
}
async function content(e: Env) {
  const row = await e.DB.prepare(
    "SELECT data FROM content WHERE id='site'",
  ).first<{ data: string }>();
  return { ...defaultContent, ...(row ? JSON.parse(row.data) : {}) };
}
async function coupon(e: Env, code: string): Promise<Coupon | undefined> {
  if (!code) return;
  const row = await e.DB.prepare("SELECT data FROM coupons WHERE code=?")
    .bind(code.toUpperCase())
    .first<{ data: string }>();
  if (!row) throw new BusinessError("Cupón no válido.");
  return couponSchema.parse(JSON.parse(row.data));
}
async function available(e: Env) {
  const all = await products(e);
  return all.filter((p) => !p.archived && (e.MODE === "local" || !p.fixture));
}
async function order(e: Env, id: string) {
  const o = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(id)
    .first<OrderRow>();
  if (!o) throw new BusinessError("Pedido no encontrado.", 404);
  return o;
}
function publicOrder(o: OrderRow) {
  const d = JSON.parse(o.data);
  return {
    id: o.public_number,
    orderNumber: o.public_number,
    email: o.email.slice(0, 1) + "***@" + o.email.split("@")[1],
    payment: o.payment,
    state: lifecycle(o),
    logistics: o.logistics,
    provider: o.provider,
    providerId: o.provider_id,
    total: o.total,
    shipping: o.shipping,
    discount: o.discount,
    lines: d.totals.lines.map((l: { title: string }) => ({
      ...l,
      title: commercialName(l.title),
    })),
    delivery: d.checkout.delivery,
    tracking: o.tracking,
    appointment: o.appointment,
    created: o.created,
  };
}
async function audit(e: Env, actor: string, action: string, target: string) {
  await e.DB.prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), actor, action, target, Date.now())
    .run();
}
async function postal(e: Env, a: ReturnType<typeof addressSchema.parse>) {
  const row = await e.DB.prepare(
    "SELECT * FROM postal_codes WHERE code=? AND lower(colony)=lower(?) AND lower(city)=lower(?) AND lower(state)=lower(?)",
  )
    .bind(a.postalCode, a.colony, a.city, a.state)
    .first<{ source: string }>();
  if (!row || (e.MODE !== "local" && row.source.startsWith("FIXTURE")))
    throw new BusinessError(
      "El código postal, colonia, municipio y estado no coinciden con la fuente postal disponible. Corrige los datos o contacta a soporte.",
    );
}
async function quoteFingerprint(
  c: Pick<Checkout, "items" | "address">,
  e: Env,
) {
  return hash(
    JSON.stringify({
      items: [...c.items].sort((a, b) => a.id.localeCompare(b.id)),
      address: c.address,
      packaging: e.SHIPPING_PACKAGING_JSON || "local",
      packagingPolicy: "combined-bags-v1",
    }),
  );
}
export async function updatePayment(
  e: Env,
  o: OrderRow,
  next: PaymentState,
  eventId: string,
) {
  const state = paymentTransition(o.payment, next),
    now = Date.now();
  if (state === o.payment) return;
  const d = JSON.parse(o.data),
    payload = {
      id: o.id,
      orderNumber: o.public_number,
      name: d.checkout.name,
      orderUrl: e.PUBLIC_ORIGIN + "/consultar-pedido",
      ...d.totals,
      delivery: d.checkout.delivery,
      address: d.checkout.address,
      ...(state === "refunded" ? { refundAmount: o.total } : {}),
    };
  const statements = [
    e.DB.prepare(
      "UPDATE orders SET payment=?,version=version+1 WHERE id=? AND payment=?",
    ).bind(state, o.id, o.payment),
    e.DB.prepare(
      "INSERT INTO events(id,order_id,kind,created) VALUES(?,?,CASE WHEN (SELECT payment FROM orders WHERE id=?)=? THEN ? ELSE NULL END,?)",
    ).bind(eventId, o.id, o.id, state, "payment:" + state, now),
  ];
  if (state === "paid") {
    statements.push(mailStatement(e, o.id + ":paid", o.email, "paid", payload));
    if (d.checkout.delivery === "local" && e.ADMIN_EMAIL)
      statements.push(mailStatement(e, o.id + ":local-admin", e.ADMIN_EMAIL, "internal_preparation", { ...payload, phone: d.checkout.phone }));
  }

  if (["refunded", "rejected"].includes(state)) {
    const verified = o.verified_payment_status || "";
    const kind = state === "refunded" ? "refunded" : ["VOIDED", "canceled"].includes(verified) ? "payment_cancelled" : ["failed", "expired"].includes(verified) ? "payment_failed" : "rejected";
    statements.push(mailStatement(e, o.id + ":" + state, o.email, kind, payload));
  }
  if (["review", "refunded", "rejected"].includes(state) && e.ADMIN_EMAIL)
    statements.push(
      mailStatement(e, o.id + ":" + state + ":admin", e.ADMIN_EMAIL, "incident", {
        ...payload,
        provider: o.provider, verifiedStatus: o.verified_payment_status || state, errorCategory: "provider_status",
      }),
    );
  await e.DB.batch(statements);
}
async function expire(e: Env) {
  await e.DB.prepare(
    "UPDATE orders SET payment='expired',version=version+1 WHERE payment='pending' AND expires<? AND provider_id IS NULL AND payment_started IS NULL",
  )
    .bind(Date.now())
    .run(); /* Payments already sent to providers require reconciliation, never release their stock blindly. */
}

async function syncShipment(e: Env, o: OrderRow) {
  if (JSON.parse(o.data).checkout.delivery === "local")
    throw new BusinessError(
      "El rastreo por paquetería no aplica a entrega local.",
      409,
    );
  if (o.payment !== "paid")
    throw new BusinessError("El pedido no está pagado.", 409);
  const f = await e.DB.prepare("SELECT * FROM fulfillment WHERE order_id=?")
    .bind(o.id)
    .first<any>();
  if (!f) throw new BusinessError("No hay envío registrado.", 409);
  if (!f.shipment_id)
    throw new BusinessError(
      "Resultado de compra incierto. Verifica Skydropx antes de repetir el intento.",
      409,
    );
  const result = await getShipment(e, f.shipment_id);
  await registerTracking(e, o, result);
  await e.DB.prepare(
    "UPDATE fulfillment SET tracking_checked_at=? WHERE order_id=?",
  )
    .bind(Date.now(), o.id)
    .run();
  const d = JSON.parse(o.data);
  const usable = result.packages.filter(
    (p: any) => p.tracking_number && /^https:\/\//.test(p.label_url || ""),
  );
  const expectedPackages = d.quote?.parcels?.length || 1;
  if (usable.length < expectedPackages || new Set(usable.map((p: any) => p.tracking_number)).size < expectedPackages) {
    await e.DB.prepare("UPDATE fulfillment SET data=? WHERE order_id=?")
      .bind(JSON.stringify(result), o.id)
      .run();
    return;
  }
  const tracking = usable.map((p: any) => p.tracking_number).join(", ");
  const delivered = usable.every((p: any) => p.tracking_status === "delivered");
  const shipped = usable.some((p: any) =>
    ["picked_up", "in_transit", "last_mile", "delivered"].includes(
      p.tracking_status,
    ),
  );
  const logistics = delivered
    ? "delivered"
    : shipped
      ? "shipped"
      : "label_created";
  const rank: any = {
    pending_contact: 0,
    label_created: 1,
    shipped: 2,
    delivered: 3,
  };
  if ((rank[o.logistics] || 0) > (rank[logistics] || 0)) return;
  d.label = { tracking, labels: usable.map((p: any) => p.label_url) };
  const payload = {
    id: o.id,
    orderNumber: o.public_number,
    orderUrl: e.PUBLIC_ORIGIN + "/consultar-pedido",
    ...d.totals,
    tracking,
    carrier: result.carrier,
    name: d.checkout.name,
    trackingNumbers: usable.map((p: any) => String(p.tracking_number)),
    delivery: d.checkout.delivery,
  };
  const shipmentMail = (kind: string) =>
    e.DB.prepare(
      "INSERT OR IGNORE INTO outbox(id,recipient,kind,payload) SELECT ?,?,?,? FROM orders WHERE id=? AND logistics=?",
    ).bind(
      o.id + ":" + kind,
      o.email,
      kind,
      JSON.stringify(payload),
      o.id,
      kind,
    );
  const statements = [
    e.DB.prepare(
      "UPDATE orders SET tracking=?,logistics=?,shipping_cost=?,data=?,version=version+1 WHERE id=? AND CASE logistics WHEN 'delivered' THEN 3 WHEN 'shipped' THEN 2 WHEN 'label_created' THEN 1 ELSE 0 END<=?",
    ).bind(
      tracking,
      logistics,
      Number.isSafeInteger(result.cost)
        ? result.cost +
            Math.max(
              0,
              (d.quote?.cost || 0) - (d.quote?.rateCost || d.quote?.cost || 0),
            )
        : o.shipping_cost,
      JSON.stringify(d),
      o.id,
      rank[logistics],
    ),
    e.DB.prepare(
      "UPDATE fulfillment SET state=?,data=? WHERE order_id=? AND CASE state WHEN 'delivered' THEN 3 WHEN 'shipped' THEN 2 WHEN 'label_created' THEN 1 ELSE 0 END<=?",
    ).bind(logistics, JSON.stringify(result), o.id, rank[logistics]),
  ];
  if (!shipped && !delivered) statements.push(shipmentMail("label_created"));
  if (shipped && !delivered) statements.push(shipmentMail("shipped"));
  if (delivered) statements.push(shipmentMail("delivered"));
  await e.DB.batch(statements);
}

async function handle(r: Request, e: Env): Promise<Response> {
  const u = new URL(r.url),
    path = u.pathname,
    method = r.method;
  if (e.MODE === "local" && !isLocal(r, e))
    throw new BusinessError(
      "Modo local no disponible en un dominio público.",
      503,
    );
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (
    path === "/api/quotes" ||
    path === "/api/orders" ||
    path.startsWith("/api/admin/")
  )
    e = await packagingEnvironment(e);
  if (!["GET", "HEAD"].includes(method) && !path.startsWith("/api/webhooks/"))
    originGuard(r, e);
  if (path === "/api/order-access/request" && method === "POST")
    return json(await requestCode(r, e, await body(r)));
  if (path === "/api/order-access/verify" && method === "POST") {
    const verified = await verifyCode(r, e, await body(r));
    return issueSession(e, verified, json({ verified: true }));
  }
  if (path === "/api/pickup" && ["GET", "POST"].includes(method)) {
    const current = await sessionOrder(r, e);
    if (!current) throw new BusinessError("Verifica tu correo para gestionar tu cita.", 401);
    await rateLimit(r, e, "pickup", 20);
    return json(await customerPickup(e, current, method, method === "POST" ? await body(r) : {}, u.searchParams.get("date") || ""));
  }
  if (path === "/api/order-session" && method === "GET") {
    const current = await sessionOrder(r, e);
    if (!current)
      throw new BusinessError(
        "Ingresa tu número de pedido y verifica tu correo para consultar el estado.",
        401,
      );
    const history = (
      await e.DB.prepare(
        "SELECT kind,created FROM events WHERE order_id=? ORDER BY created",
      )
        .bind(current.id)
        .all()
    ).results;
    const { providerId, ...view } = publicOrder(current);
    return json({ ...view, history });
  }
  if (path === "/api/order-tracking" && method === "GET") {
    const current = await sessionOrder(r, e);
    if (!current) throw new BusinessError("Verifica tu correo para rastrear este pedido.", 401);
    await rateLimit(r, e, "order-tracking", 8);
    const numbers = [...new Set((current.tracking || "").split(",").map(n => n.trim()).filter(Boolean))];
    const shipments = await Promise.all(numbers.map(async number => {
      try { return { number, result: await publicTracking(e, number) }; }
      catch { return { number, error: "No pudimos actualizar esta guía. Intenta más tarde." }; }
    }));
    return json({ shipments });
  }
  if (path === "/api/tracking" && method === "POST") {
    await rateLimit(r, e, "tracking", 8);
    // Global cap plus Turnstile prevents distributed enumeration/provider exhaustion.
    await rateLimit(new Request(r.url), e, "tracking-global", 120);
    const b = await body(r);
    await antiBot(r, e, b.turnstile);
    return json(await publicTracking(e, b.trackingNumber));
  }
  if (path === "/checkout/paypal/cancel" && method === "GET")
    return Response.redirect(
      e.PUBLIC_ORIGIN + "/checkout?payment=cancelled",
      303,
    );
  if (path === "/checkout/paypal/return" && method === "GET") {
    let o = await sessionOrder(r, e);
    // Only bridge an already-issued return cookie for a recent, in-flight PayPal payment.
    if (!o) {
      const legacy = (r.headers.get("Cookie") || "")
        .split(/;\s*/)
        .find((c) => c.startsWith("marlo_payment="))
        ?.slice(14)
        .split(":");
      if (legacy?.length === 2)
        o = await e.DB.prepare(
          "SELECT * FROM orders WHERE id=? AND access_token=? AND payment_started>? AND provider='paypal'",
        )
          .bind(legacy[0], legacy[1], Date.now() - 2 * 3600000)
          .first<OrderRow>();
    }
    if (!o)
      return Response.redirect(e.PUBLIC_ORIGIN + "/consultar-pedido", 303);
    const id = o.id;
    if (
      o.provider !== "paypal" ||
      !o.provider_id ||
      u.searchParams.get("token") !== o.provider_id
    )
      throw new BusinessError("Retorno de PayPal inválido.", 403);
    try {
      const state = await paymentStatus(e, o);
      if (state === "pending" && o.payment === "pending") {
        try {
          await capturePaypal(e, o);
        } catch {
          /* Re-read after timeout or duplicate capture. */
        }
      }
      await updatePayment(
        e,
        o,
        await paymentStatus(e, o),
        o.id + ":return:" + crypto.randomUUID(),
      );
    } catch {
      return issueSession(
        e,
        o,
        new Response(null, {
          status: 303,
          headers: { Location: e.PUBLIC_ORIGIN + "/pedido/confirmacion" },
        }),
      );
    }
    return issueSession(
      e,
      o,
      new Response(null, {
        status: 303,
        headers: { Location: e.PUBLIC_ORIGIN + "/pedido/confirmacion" },
      }),
    );
  }
  if (path === "/api/health")
    return json({
      ok: true,
      mode: e.MODE,
      paymentsEnabled: e.MODE !== "local" && e.PAYMENTS_ENABLED === "true",
      formsEnabled:
        e.MODE === "local" || !!(e.TURNSTILE_SECRET && e.TURNSTILE_SITE_KEY),
    });
  if (path === "/api/catalog" && method === "GET")
    return json({
      products: await available(e),
      content: await content(e),
      mode: e.MODE,
      providers: enabledProviders(e),
      mpPublicKey: e.MODE !== "local" ? e.MP_PUBLIC_KEY : undefined,
      paypalClientId: e.MODE !== "local" ? e.PAYPAL_CLIENT_ID : undefined,
      turnstileSiteKey: e.TURNSTILE_SITE_KEY,
      paymentsEnabled: e.MODE !== "local" && e.PAYMENTS_ENABLED === "true",
      formsEnabled:
        e.MODE === "local" || !!(e.TURNSTILE_SECRET && e.TURNSTILE_SITE_KEY),
    });
  if (path === "/api/marketing/unsubscribe" && method === "POST") {
    await rateLimit(r, e, "unsubscribe", 20);
    const token = z
      .string()
      .uuid()
      .parse((await body(r)).token);
    await e.DB.prepare(
      "UPDATE marketing_subscribers SET consent=0,unsubscribed_at=? WHERE unsubscribe_token=?",
    )
      .bind(Date.now(), token)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/postal" && method === "GET") {
    const rows = await e.DB.prepare(
      "SELECT code,colony,city,state,source FROM postal_codes WHERE code=?",
    )
      .bind(u.searchParams.get("code") || "")
      .all();
    return json(
      rows.results.filter(
        (x: any) => e.MODE === "local" || !x.source.startsWith("FIXTURE"),
      ),
    );
  }
  if (path === "/api/totals" && method === "POST") {
    const b = await body(r);
    const c = await coupon(e, String(b.coupon || ""));
    return json(
      totals(
        cartSchema.parse(b.items),
        await available(e),
        z.enum(["local", "national"]).parse(b.delivery),
        c,
      ),
    );
  }
  if (path === "/api/quotes" && method === "POST") {
    await rateLimit(r, e, "quotes", 10);
    const b = await body(r),
      address = addressSchema.parse(b.address),
      items = cartSchema.parse(b.items);
    await postal(e, address);
    const ps = await available(e);
    totals(items, ps, "national");
    const q: import("./providers").ShippingQuote = await shippingProvider(
      e,
    ).quote(address, e.MODE === "local" ? [] : pack(e, items));
    if (!q.rateId || q.expires <= Date.now())
      throw new BusinessError(
        "No existe un servicio utilizable para este domicilio.",
        409,
      );
    const id = crypto.randomUUID();
    await e.DB.prepare("INSERT INTO quotes VALUES(?,?,?,?)")
      .bind(
        id,
        await quoteFingerprint({ items, address }, e),
        JSON.stringify(q),
        q.expires,
      )
      .run();
    return json({
      id,
      expires: q.expires,
      shipping: (await content(e)).shippingFlatRate,
      carrier: q.carrier,
      transitDays: q.transitDays,
      provisionalPackaging:
        q.packaging?.parcels.some((p) => !p.verified || !p.weightVerified) ||
        false,
      fixture: q.fixture,
    });
  }
  if (path === "/api/orders" && method === "POST") {
    if (e.MODE !== "local" && e.PAYMENTS_ENABLED !== "true")
      throw new BusinessError("Las compras todavía no están habilitadas.", 503);
    await rateLimit(r, e, "checkout", 10);
    const b = await body(r);
    await antiBot(r, e, b.turnstile);
    const c = checkoutSchema.parse(b);
    if (!enabledProviders(e)[c.provider])
      throw new BusinessError("Este método de pago no está habilitado.", 503);
    await expire(e);
    // Quotes can be refreshed after a timeout without creating another order.
    const fingerprint = await hash(
        JSON.stringify({ ...c, quoteId: undefined }),
      ),
      existing = await e.DB.prepare(
        "SELECT * FROM orders WHERE idempotency_key=?",
      )
        .bind(c.idempotencyKey)
        .first<OrderRow>();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new BusinessError(
          "Este intento ya fue utilizado con otros datos.",
          409,
        );
      if (Date.now() - existing.created > 2 * 3600000)
        throw new BusinessError(
          "Consulta tu pedido con tu número y correo para continuar.",
          409,
        );
      return issueSession(e, existing, json(publicOrder(existing)));
    }
    const config = await content(e);
    if (
      (c.delivery === "local" && !config.localEnabled) ||
      (c.delivery === "national" && !config.nationalEnabled)
    )
      throw new BusinessError("Método de entrega no disponible.");
    const ps = await available(e);
    if (
      !config.preordersEnabled &&
      c.items.some((x) => ps.find((p) => p.id === x.id)?.status === "preorder")
    )
      throw new BusinessError("Las preventas aún no están habilitadas.");
    const cp = await coupon(e, c.coupon),
      calculated = totals(c.items, ps, c.delivery, cp);
    let quoteData = null;
    if (c.delivery === "national") {
      await postal(e, c.address!);
      const q = await e.DB.prepare("SELECT * FROM quotes WHERE id=?")
        .bind(c.quoteId || "")
        .first<{ fingerprint: string; expires: number; data: string }>();
      if (
        !q ||
        q.expires <= Date.now() ||
        q.fingerprint !== (await quoteFingerprint(c, e))
      )
        throw new BusinessError(
          "Cotización vencida o distinta al pedido. Vuelve a continuar al pago para verificar la dirección.",
          409,
        );
      quoteData = JSON.parse(q.data);
      if (e.MODE !== "local" && quoteData.fixture)
        throw new BusinessError("Cotización de prueba no válida.", 409);
      calculated.shipping = config.shippingFlatRate;
      calculated.total =
        calculated.subtotal - calculated.discount + calculated.shipping;
    }
    const id = "MG-" + crypto.randomUUID(),
      accessToken = crypto.randomUUID() + crypto.randomUUID(),
      now = Date.now();
    const stored = {
      checkout: c,
      totals: calculated,
      quote: quoteData,
      marketing: {
        consent: c.marketingConsent,
        recordedAt: now,
        privacyVersion: "2026-10-21",
        unsubscribeToken: crypto.randomUUID(),
      },
    };
    const statements = [
      e.DB.prepare(
        "INSERT INTO orders(id,idempotency_key,fingerprint,access_token,email,data,total,discount,shipping,shipping_cost,provider,expires,created,coupon,quote_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        id,
        c.idempotencyKey,
        fingerprint,
        accessToken,
        c.email,
        JSON.stringify(stored),
        calculated.total,
        calculated.discount,
        calculated.shipping,
        quoteData?.cost || 0,
        c.provider,
        now + 30 * 60000,
        now,
        cp?.code || null,
        c.delivery === "national" ? c.quoteId : null,
      ),
    ];
    statements.push(
      e.DB.prepare(
        "INSERT INTO marketing_subscribers(email,consent,recorded_at,notice_version,unsubscribe_token) VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET consent=excluded.consent,recorded_at=excluded.recorded_at,notice_version=excluded.notice_version,unsubscribed_at=CASE WHEN excluded.consent=1 THEN NULL ELSE excluded.recorded_at END",
      ).bind(
        c.email,
        c.marketingConsent ? 1 : 0,
        now,
        stored.marketing.privacyVersion,
        stored.marketing.unsubscribeToken,
      ),
    );
    for (const line of calculated.lines) {
      const p = ps.find((p) => p.id === line.id)!;
      statements.push(
        e.DB.prepare(
          "INSERT INTO order_items(order_id,product_id,quantity,price) SELECT ?,id,?,? FROM products WHERE id=? AND version=?",
        ).bind(id, line.quantity, line.price, line.id, p.version),
      );
    }
    // A final guard aborts the entire transaction if any product changed during validation.
    statements.push(
      e.DB.prepare(
        "INSERT INTO events(id,order_id,kind,created) VALUES(?,?,CASE WHEN (SELECT count(*) FROM order_items WHERE order_id=?)=? THEN 'reserved' ELSE NULL END,?)",
      ).bind(id + ":reserve", id, id, calculated.lines.length, now),
    );
    if (cp)
      statements.push(
        e.DB.prepare("INSERT INTO coupon_uses VALUES(?,?,?)").bind(
          id,
          cp.code,
          c.email,
        ),
      );
    statements.push(
      mailStatement(e, id + ":received", c.email, "received", {
        id,
        orderUrl: e.PUBLIC_ORIGIN + "/consultar-pedido",
        ...calculated,
        delivery: c.delivery,
      }),
    );
    try {
      await e.DB.batch(statements);
    } catch {
      throw new BusinessError(
        "Cambió el inventario, el cupón o este intento ya se registró. Actualiza e intenta de nuevo.",
        409,
      );
    }
    const created = await order(e, id);
    return issueSession(e, created, json(publicOrder(created), 201));
  }
  const orderMatch = path.match(
    /^\/api\/orders\/([^/]+)(?:\/(payment|capture|refresh|simulate|card-methods))?$/,
  );
  if (orderMatch) {
    const o = await e.DB.prepare(
      "SELECT * FROM orders WHERE public_number=? OR id=?",
    )
      .bind(orderMatch[1], orderMatch[1])
      .first<OrderRow>();
    if (!o)
      throw new BusinessError(
        "Verifica tu correo para consultar este pedido.",
        403,
      );
    await authorizeOrder(r, e, o);
    const action = orderMatch[2];
    if (action === "card-methods" && method === "GET")
      return json(await cardBrands(e, o.total));
    if (!action && method === "GET")
      return json({
        ...publicOrder(o),
        history: (
          await e.DB.prepare(
            "SELECT kind,created FROM events WHERE order_id=? ORDER BY created",
          )
            .bind(o.id)
            .all()
        ).results,
      });
    if (method !== "POST") throw new BusinessError("Método no permitido.", 405);
    if (action === "simulate") {
      if (!isLocal(r, e))
        throw new BusinessError("Simulación disponible solo en local.", 403);
      const b = await body(r);
      const next = z
        .enum(["pending", "paid", "rejected", "refunded"])
        .parse(b.state);
      await updatePayment(e, o, next, o.id + ":local:" + next);
    } else if (action === "payment") {
      if (o.payment !== "pending" || o.expires < Date.now())
        throw new BusinessError("El pedido ya no admite un pago.", 409);
      if (!o.provider_id) {
        const stored = JSON.parse(o.data);
        if (
          !o.payment_started &&
          stored.checkout.delivery === "national" &&
          (!stored.quote || stored.quote.expires <= Date.now())
        )
          throw new BusinessError(
            "La verificación de envío venció. Contacta a la editorial para actualizar este pedido antes de pagar.",
            409,
          );
        const b = await body(r);
        if (o.payment_started && Date.now() - o.payment_started > 3600000)
          throw new BusinessError(
            "Este intento requiere conciliación antes de repetir el cobro.",
            409,
          );
        await e.DB.prepare(
          "UPDATE orders SET payment_started=COALESCE(payment_started,?) WHERE id=?",
        )
          .bind(Date.now(), o.id)
          .run();
        const payment = await createPayment(e, o, b.card);
        await e.DB.prepare(
          "UPDATE orders SET provider_id=? WHERE id=? AND provider_id IS NULL",
        )
          .bind(payment.id, o.id)
          .run();
        if (o.provider === "mercadopago") {
          const linked = await order(e, o.id);
          await updatePayment(
            e,
            linked,
            await paymentStatus(e, linked),
            o.id + ":initial-readback",
          );
        }
      }
    } else if (action === "capture") {
      if (o.provider !== "paypal")
        throw new BusinessError("Proveedor incorrecto.");
      if (o.payment === "pending") {
        const current = await paymentStatus(e, o);
        if (current === "pending") await capturePaypal(e, o);
      }
      await updatePayment(
        e,
        o,
        await paymentStatus(e, o),
        o.id + ":capture:" + crypto.randomUUID(),
      );
    } else if (action === "refresh") {
      await updatePayment(
        e,
        o,
        await paymentStatus(e, o),
        o.id + ":refresh:" + crypto.randomUUID(),
      );
    }
    const result = json(publicOrder(await order(e, o.id)));
    return result;
  }
  if (path === "/api/webhooks/skydropx" && method === "POST") {
    const shipmentId = await verifyShippingWebhook(
      r,
      e.SKYDROPX_WEBHOOK_SECRET,
    );
    if (!shipmentId) return json({ received: true, ignored: true });
    const o = await e.DB.prepare(
      "SELECT o.* FROM orders o JOIN fulfillment f ON f.order_id=o.id WHERE f.shipment_id=?",
    )
      .bind(shipmentId)
      .first<OrderRow>();
    // Account-wide events and dashboard probes can refer to unrelated shipments.
    // If creation is still being persisted, scheduled reconciliation recovers it.
    if (!o)
      return json({
        received: true,
        ignored: true,
        reason: "shipment_not_registered",
      });
    const receipt = await hash(r.headers.get("Authorization") || "");
    const claim = await e.DB.prepare(
      `INSERT INTO shipping_webhook_receipts(id,lease_until) VALUES(?,?)
      ON CONFLICT(id) DO UPDATE SET lease_until=excluded.lease_until
      WHERE processed=0 AND lease_until<? RETURNING id`,
    )
      .bind(receipt, Date.now() + 120000, Date.now())
      .first();
    if (!claim) {
      const prior = await e.DB.prepare(
        "SELECT processed FROM shipping_webhook_receipts WHERE id=?",
      )
        .bind(receipt)
        .first<any>();
      if (!prior?.processed)
        throw new BusinessError("Evento en proceso. Reintenta.", 503);
      return json({ received: true, duplicate: true });
    }
    try {
      await syncShipment(e, o);
      const tracked = await e.DB.prepare(
        "SELECT * FROM shipment_tracking WHERE order_id=?",
      )
        .bind(o.id)
        .all<any>();
      for (const row of tracked.results) await refreshTracking(e, row);
      await e.DB.prepare(
        "UPDATE shipping_webhook_receipts SET processed=1 WHERE id=?",
      )
        .bind(receipt)
        .run();
    } catch (error) {
      await e.DB.prepare(
        "DELETE FROM shipping_webhook_receipts WHERE id=? AND processed=0",
      )
        .bind(receipt)
        .run();
      throw error;
    }
    return json({ received: true });
  }
  if (path === "/api/webhooks/mercadopago/sandbox" && method === "POST") {
    const b = await body(r);
    try {
      await verifyWebhook(
        { ...e, MP_WEBHOOK_SECRET: e.MP_SANDBOX_WEBHOOK_SECRET },
        r,
        "mercadopago",
        b,
      );
    } catch (error) {
      // Log only structural diagnostics, never credentials, signatures or payloads.
      const signature = r.headers.get("x-signature") || "";
      const timestamp = signature
        .split(",")
        .map((p) => p.trim())
        .find((p) => p.startsWith("ts="))
        ?.slice(3);
      const stamp = Number(timestamp);
      const queryId = new URL(r.url).searchParams.get("data.id");
      console.warn(
        "mp_sandbox_verification_failed",
        JSON.stringify({
          secretConfigured: !!e.MP_SANDBOX_WEBHOOK_SECRET,
          signaturePresent: !!signature,
          requestIdPresent: !!r.headers.get("x-request-id"),
          queryIdPresent: !!queryId,
          bodyIdMatchesQuery:
            queryId !== null && String(b.data?.id) === queryId,
          timestampFresh:
            !!timestamp &&
            Number.isFinite(stamp) &&
            Math.abs(Date.now() - (stamp < 1e12 ? stamp * 1000 : stamp)) <=
              300000,
        }),
      );
      throw error;
    }
    const id = z
      .string()
      .min(1)
      .max(200)
      .parse(String(b.id || r.headers.get("x-request-id") || ""));
    const event = z.string().min(1).max(150).parse(b.action);
    const resource = z.string().min(1).max(200).parse(b.data?.id);
    await e.DB.prepare(
      "INSERT OR IGNORE INTO sandbox_webhook_events VALUES(?,?,?,?)",
    )
      .bind("mercadopago:" + id, event, resource, Date.now())
      .run();
    return json({ received: true, environment: "sandbox" });
  }
  if (path === "/api/webhooks/paypal/sandbox" && method === "POST") {
    const b = await body(r);
    await verifyWebhook(
      {
        ...e,
        MODE: "sandbox",
        PAYPAL_ENVIRONMENT: "sandbox",
        PAYPAL_CLIENT_ID: e.PAYPAL_SANDBOX_CLIENT_ID,
        PAYPAL_CLIENT_SECRET: e.PAYPAL_SANDBOX_CLIENT_SECRET,
        PAYPAL_WEBHOOK_ID: e.PAYPAL_SANDBOX_WEBHOOK_ID,
      },
      r,
      "paypal",
      b,
    );
    const id = z.string().min(1).max(200).parse(b.id),
      event = z.string().min(1).max(150).parse(b.event_type);
    await e.DB.prepare(
      "INSERT OR IGNORE INTO sandbox_webhook_events VALUES(?,?,?,?)",
    )
      .bind(id, event, String(b.resource?.id || "").slice(0, 200), Date.now())
      .run();
    return json({ received: true, environment: "sandbox" });
  }
  const hook = path.match(/^\/api\/webhooks\/(paypal|mercadopago)$/);
  if (hook && method === "POST") {
    const b = await body(r);
    await verifyWebhook(e, r, hook[1], b);
    const providerId =
      hook[1] === "mercadopago"
        ? String(b.data?.id)
        : await paypalWebhookOrderId(e, b);
    const o = await e.DB.prepare(
      "SELECT * FROM orders WHERE provider_id=? AND provider=?",
    )
      .bind(providerId || "", hook[1])
      .first<OrderRow>();
    if (!o)
      throw new BusinessError("Transacción no registrada; reintentar.", 409);
    const verifiedState = await paymentStatus(e, o);
    await updatePayment(
      e,
      o,
      hook[1] === "paypal" &&
        b.event_type === "PAYMENT.CAPTURE.REVERSED" &&
        verifiedState !== "refunded"
        ? "review"
        : verifiedState,
      hook[1] + ":" + String(b.id || r.headers.get("x-request-id")),
    );
    return json({ received: true });
  }
  if (["/api/wholesale", "/api/contact"].includes(path) && method === "POST") {
    await rateLimit(r, e, "forms", 5);
    const b = await body(r);
    await antiBot(r, e, b.turnstile);
    const id = crypto.randomUUID();
    if (path.endsWith("wholesale")) {
      const data = leadSchema.parse(b);
      await e.DB.batch([
        e.DB.prepare(
          "INSERT OR IGNORE INTO leads(id,email,data,created) VALUES(?,?,?,?)",
        ).bind(id, data.email, JSON.stringify(data), Date.now()),
        e.DB.prepare(
          "INSERT OR IGNORE INTO outbox(id,recipient,kind,payload) SELECT 'lead:'||id,email,'lead',data FROM leads WHERE email=?",
        ).bind(data.email),
        ...(e.ADMIN_EMAIL
          ? [
              e.DB.prepare(
                "INSERT OR IGNORE INTO outbox(id,recipient,kind,payload) SELECT 'lead-admin:'||id,?,'internal_lead',data FROM leads WHERE email=?",
              ).bind(e.ADMIN_EMAIL, data.email),
            ]
          : []),
      ]);
    } else {
      const data = z
        .object({
          name: z.string().min(2).max(200),
          email: z.email(),
          message: z.string().min(10).max(4000),
          privacy: z.literal(true),
          websiteTrap: z.literal(""),
        })
        .parse(b);
      await e.DB.batch([
        e.DB.prepare("INSERT INTO messages VALUES(?,?,?)").bind(
          id,
          JSON.stringify(data),
          Date.now(),
        ),
        mailStatement(e, id + ":contact", data.email, "contact", data),
        ...(e.ADMIN_EMAIL
          ? [
              mailStatement(
                e,
                id + ":contact-admin",
                e.ADMIN_EMAIL,
                "internal_contact",
                data,
              ),
            ]
          : []),
      ]);
    }
    return json({ ok: true, mode: e.MODE }, 201);
  }
  if (path.startsWith("/api/admin")) {
    const actor = await admin(r, e);
    if (method !== "GET") await rateLimit(r, e, "admin", 60);
    if (path === "/api/admin/local-pickup" && ["GET", "POST"].includes(method)) {
      const result = await adminPickup(e, method, method === "POST" ? await body(r) : {}, actor);
      if (method === "POST") await audit(e, actor, "pickup.manage", "local-pickup");
      return json(result);
    }
    if (path === "/api/admin/packaging" && method === "GET")
      return json(JSON.parse(e.SHIPPING_PACKAGING_JSON!));
    if (path === "/api/admin/packaging" && method === "POST") {
      const config = packagingConfigSchema.parse(await body(r));
      for (const bag of config.bags)
        for (const plan of bag.plans)
          if (plan.packed)
            planPackaging(
              config,
              [{ id: "intercambio-navideno", quantity: plan.units }],
              false,
            );
      await e.DB.prepare(
        "INSERT INTO content(id,data) VALUES('shipping:packaging',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
        .bind(JSON.stringify(config))
        .run();
      await audit(e, actor, "packaging.update", "shipping:packaging");
      return json({ ok: true });
    }
    if (path === "/api/admin/readiness" && method === "GET")
      return json(readiness(e, true));
    if (path === "/api/admin/pickup-dates" && method === "GET") {
      const f = await e.DB.prepare(
        "SELECT shipment_id FROM fulfillment WHERE order_id=?",
      )
        .bind(u.searchParams.get("id") || "")
        .first<any>();
      if (!f?.shipment_id)
        throw new BusinessError("Primero crea y verifica la guía.", 409);
      const result = await skyClient(e)(
        "/api/v1/pickups/coverage?shipment_id=" +
          encodeURIComponent(f.shipment_id),
      );
      return json({
        available: result.success === true,
        dates: result.success === true ? result.pickupDates : [],
      });
    }
    if (path === "/api/admin/session") return json({ actor, mode: e.MODE });
    if (path === "/api/admin/overview") {
      const orders = (
        await e.DB.prepare(
          "SELECT * FROM orders ORDER BY created DESC LIMIT 500",
        ).all<OrderRow>()
      ).results;
      const paid = orders.filter((o) => o.payment === "paid");
      const total = paid.reduce((s, o) => s + o.total, 0),
        subsidy = paid.reduce(
          (s, o) => s + Math.max(0, o.shipping_cost - o.shipping),
          0,
        );
      return json({
        readiness: readiness(e, true),
        orders,
        metrics: {
          paid: paid.length,
          sales: total,
          discounts: paid.reduce((s, o) => s + o.discount, 0),
          shippingSubsidy: subsidy,
          estimatedNet: paid.reduce((s, o) => s + o.total - o.shipping_cost, 0),
          pending: paid.filter((o) => o.logistics !== "delivered").length,
          delivered: paid.filter((o) => o.logistics === "delivered").length,
        },
        products: await products(e),
        coupons: (await e.DB.prepare("SELECT * FROM coupons").all()).results,
        leads: (
          await e.DB.prepare(
            "SELECT * FROM leads ORDER BY created DESC LIMIT 500",
          ).all()
        ).results,
        messages: (
          await e.DB.prepare(
            "SELECT * FROM messages ORDER BY created DESC LIMIT 100",
          ).all()
        ).results,
        outbox: (
          await e.DB.prepare(
            "SELECT * FROM outbox ORDER BY rowid DESC LIMIT 100",
          ).all()
        ).results,
        audit: (
          await e.DB.prepare(
            "SELECT * FROM audit ORDER BY created DESC LIMIT 100",
          ).all()
        ).results,
        content: await content(e),
      });
    }
    if (path === "/api/admin/products" && method === "POST") {
      const b = await body(r),
        p = productSchema.parse(b);
      const expected = z
        .number()
        .int()
        .min(0)
        .parse(b.version || 0);
      if (e.MODE !== "local" && p.fixture)
        throw new BusinessError(
          "No se permiten fixtures fuera del modo local.",
        );
      const current = await e.DB.prepare(
        "SELECT version FROM products WHERE id=?",
      )
        .bind(p.id)
        .first<{ version: number }>();
      if (current) {
        const result = await e.DB.prepare(
          "UPDATE products SET slug=?,data=?,stock=?,version=version+1 WHERE id=? AND version=?",
        )
          .bind(p.slug, JSON.stringify(p), p.stock, p.id, expected)
          .run();
        if (!result.meta.changes)
          throw new BusinessError(
            "Otro proceso cambió el inventario. Recarga antes de guardar.",
            409,
          );
      } else
        await e.DB.prepare(
          "INSERT INTO products(id,slug,data,stock) VALUES(?,?,?,?)",
        )
          .bind(p.id, p.slug, JSON.stringify(p), p.stock)
          .run();
      await audit(e, actor, "product.save", p.id);
      return json({ ok: true });
    }
    if (path === "/api/admin/coupons" && method === "POST") {
      const c = couponSchema.parse(await body(r));
      await e.DB.prepare(
        "INSERT INTO coupons(code,data) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data",
      )
        .bind(c.code, JSON.stringify(c))
        .run();
      await audit(e, actor, "coupon.save", c.code);
      return json({ ok: true });
    }
    if (path === "/api/admin/content" && method === "POST") {
      const b = await body(r);
      const allowed = Object.keys(defaultContent);
      if (Object.keys(b).some((k) => !allowed.includes(k)))
        throw new BusinessError("Campo de contenido desconocido.");
      for (const [k, v] of Object.entries(b)) {
        const original = defaultContent[k as keyof typeof defaultContent];
        if (k === "faq") {
          z.array(z.tuple([z.string().max(300), z.string().max(2000)]))
            .max(30)
            .parse(v);
        } else if (k === "freeShippingThreshold") {
          if (v !== null)
            throw new BusinessError(
              "El umbral de envío gratis aún no está habilitado.",
            );
        } else if (k === "shippingFlatRate") {
          z.number().int().min(0).max(100000).parse(v);
        } else if (typeof original === "boolean") {
          z.boolean().parse(v);
        } else {
          z.string().max(12000).parse(v);
          if (
            /Image|Desktop|Mobile|logo|instagram|facebook/.test(k) &&
            v &&
            !/^https:\/\//.test(String(v))
          )
            throw new BusinessError("Los recursos y redes deben usar HTTPS.");
        }
      }
      await e.DB.prepare(
        "INSERT INTO content VALUES('site',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
        .bind(JSON.stringify({ ...(await content(e)), ...b }))
        .run();
      await audit(e, actor, "content.save", "site");
      return json({ ok: true });
    }
    if (path === "/api/admin/email-template" && method === "POST") {
      const b = z
        .object({
          kind: z.string().refine(kind => Object.hasOwn(emailCopy, kind), "Plantilla desconocida."),
          text: z.string().min(1).max(4000),
        })
        .parse(await body(r));
      await e.DB.prepare(
        "INSERT INTO content VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
        .bind("email:" + b.kind, JSON.stringify({ text: b.text }))
        .run();
      await audit(e, actor, "email.template", b.kind);
      return json({ ok: true });
    }
    if (path === "/api/admin/mail-preview" && method === "GET") {
      const row = await e.DB.prepare("SELECT * FROM outbox WHERE id=?")
        .bind(u.searchParams.get("id") || "")
        .first<any>();
      if (!row) throw new BusinessError("Correo no encontrado.", 404);
      return json(renderEmail(row.kind, JSON.parse(row.payload)));
    }
    if (path === "/api/admin/mail-retry" && method === "POST") {
      await e.DB.prepare(
        "UPDATE outbox SET status='pending',attempts=0,next_attempt=0 WHERE id=? AND status IN ('failed','preview')",
      )
        .bind(String((await body(r)).id))
        .run();
      await audit(e, actor, "email.retry", "outbox");
      return json({ processed: await processOutbox(e) });
    }
    if (path === "/api/admin/process" && method === "POST") {
      await expire(e);
      await e.DB.prepare("DELETE FROM rate_limits WHERE expires<?")
        .bind(Date.now())
        .run();
      return json({ processed: await processOutbox(e) });
    }
    if (path === "/api/admin/leads" && method === "POST") {
      const b = z
        .object({
          id: z.string(),
          status: z.enum(["nuevo", "contactado", "negociación", "cerrado"]),
          notes: z.string().max(4000),
        })
        .parse(await body(r));
      await e.DB.prepare("UPDATE leads SET status=?,notes=? WHERE id=?")
        .bind(b.status, b.notes, b.id)
        .run();
      await audit(e, actor, "lead.update", b.id);
      return json({ ok: true });
    }
    if (path === "/api/admin/order" && method === "POST") {
      const b = z
        .object({
          id: z.string(),
          action: z.enum([
            "logistics",
            "label",
            "quote",
            "notes",
            "tracking",
            "refund",
            "retry-label",
            "pickup",
            "manual-tracking",
          ]),
          scheduledFrom: z.string().max(40).optional(),
          tracking: z.string().trim().min(3).max(200).optional(),
          scheduledTo: z.string().max(40).optional(),
          approvedCost: z.number().int().nonnegative().optional(),
          logistics: z
            .enum([
              "pending_contact",
              "scheduled",
              "ready",
              "label_created",
              "shipped",
              "delivered",
              "incident",
            ])
            .optional(),
          notes: z.string().max(4000).default(""),
          appointment: z.string().max(80).default(""),
        })
        .parse(await body(r));
      const o = await order(e, b.id),
        d = JSON.parse(o.data);
      if (b.action === "pickup") {
        if (
          o.payment !== "paid" ||
          d.quote?.method !== "pickup" ||
          e.LABELS_ENABLED !== "true"
        )
          throw new BusinessError("No admite recolección.", 409);
        const f = await e.DB.prepare(
          "SELECT * FROM fulfillment WHERE order_id=?",
        )
          .bind(o.id)
          .first<any>();
        if (!f?.shipment_id || f.pickup_state)
          throw new BusinessError(
            "Recolección no disponible o ya solicitada; verifica en Skydropx.",
            409,
          );
        const send = skyClient(e),
          coverage = await send(
            "/api/v1/pickups/coverage?shipment_id=" +
              encodeURIComponent(f.shipment_id),
          );
        const selected =
          coverage.success === true &&
          coverage.pickupDates?.find(
            (x: any) =>
              x.date + " " + x.startHour === b.scheduledFrom &&
              x.date + " " + x.endHour === b.scheduledTo,
          );
        if (!selected)
          throw new BusinessError(
            "El horario de recolección ya no está disponible.",
            409,
          );
        const claim = await e.DB.prepare(
          "UPDATE fulfillment SET pickup_state='requesting' WHERE order_id=? AND pickup_state IS NULL",
        )
          .bind(o.id)
          .run();
        if (!claim.meta.changes)
          throw new BusinessError(
            "Ya existe una solicitud de recolección.",
            409,
          );
        const result = await send("/api/v1/pickups", "POST", {
          pickup: {
            reference_shipment_id: f.shipment_id,
            packages: d.quote.parcels.length,
            total_weight: d.quote.parcels.reduce(
              (sum: number, p: any) => sum + p.weight,
              0,
            ),
            scheduled_from: b.scheduledFrom,
            scheduled_to: b.scheduledTo,
          },
        });
        await e.DB.prepare(
          "UPDATE fulfillment SET pickup_state='requested',pickup_data=? WHERE order_id=?",
        )
          .bind(JSON.stringify(result), o.id)
          .run();
      }
      if (b.action === "refund") {
        if (b.approvedCost !== o.total)
          throw new BusinessError(
            "Confirma el importe exacto del reembolso.",
            409,
          );
        await refundPayment(e, o);
        await updatePayment(
          e,
          o,
          await paymentStatus(e, o),
          o.id + ":refund:" + crypto.randomUUID(),
        );
      }
      if (b.action === "retry-label") {
        if (o.payment !== "paid")
          throw new BusinessError("El pedido no está pagado.", 409);
        const f = await e.DB.prepare(
          "SELECT * FROM fulfillment WHERE order_id=?",
        )
          .bind(o.id)
          .first<any>();
        if (!f || f.shipment_id || Date.now() - f.created > 23 * 3600000)
          throw new BusinessError(
            "Revisa este intento con Skydropx antes de volver a crear una guía.",
            409,
          );
        const saved = JSON.parse(f.request);
        if (b.approvedCost !== saved.quote.cost)
          throw new BusinessError("Confirma el importe original.", 409);
        const result = await createShipment(e, saved.payload);
        const shipmentId = result.data?.id || result.id;
        if (typeof shipmentId !== "string")
          throw new BusinessError(
            "Envío aún sin referencia; requiere revisión.",
            502,
          );
        await e.DB.prepare(
          "UPDATE fulfillment SET shipment_id=?,state='pending',data=? WHERE order_id=?",
        )
          .bind(shipmentId, JSON.stringify(result), o.id)
          .run();
      }
      if (b.action === "notes") {
        await e.DB.prepare("UPDATE orders SET notes=?,appointment=? WHERE id=?")
          .bind(b.notes, b.appointment, o.id)
          .run();
      }
      if (b.action === "quote") {
        if (d.quote?.manualFulfillment)
          throw new BusinessError(
            "Pedido con envío fijo de $70: prepara la guía manualmente y registra el seguimiento.",
            409,
          );
        if (
          await e.DB.prepare(
            "SELECT order_id FROM fulfillment WHERE order_id=?",
          )
            .bind(o.id)
            .first()
        )
          throw new BusinessError(
            "Ya existe un intento de guía. Reconcílialo antes de recotizar.",
            409,
          );
        if (d.checkout.delivery !== "national")
          throw new BusinessError("El pedido es de entrega local.");
        const q = await shippingProvider(e).quote(
          d.checkout.address,
          e.MODE === "local" ? [] : pack(e, d.checkout.items),
        );
        d.quote = q;
        await e.DB.prepare(
          "UPDATE orders SET data=?,shipping_cost=? WHERE id=?",
        )
          .bind(JSON.stringify(d), q.cost, o.id)
          .run();
      }
      if (b.action === "label") {
        if (d.quote?.manualFulfillment)
          throw new BusinessError(
            "Generación automática deshabilitada para este pedido. Registra la guía manualmente.",
            409,
          );
        if (
          o.payment !== "paid" ||
          d.checkout.delivery !== "national" ||
          o.tracking
        )
          throw new BusinessError("El pedido no admite una guía.", 409);
        if (e.MODE !== "local" && e.LABELS_ENABLED !== "true")
          throw new BusinessError("Compra de guías deshabilitada.", 403);
        if (!d.quote || d.quote.expires <= Date.now())
          throw new BusinessError(
            "Cotización vencida. Renueva la cotización.",
            409,
          );
        if (e.MODE !== "local") {
          if (b.approvedCost !== d.quote.cost)
            throw new BusinessError(
              "Autoriza el costo actual de la guía; el cliente no recibirá cargos adicionales.",
              409,
            );
          const payload = await prepareShipment(e, d.quote, d.checkout.address);
          const claimed = await e.DB.prepare(
            "INSERT OR IGNORE INTO fulfillment(order_id,rate_id,request,created) VALUES(?,?,?,?)",
          )
            .bind(
              o.id,
              d.quote.rateId,
              JSON.stringify({
                quote: d.quote,
                address: d.checkout.address,
                payload,
              }),
              Date.now(),
            )
            .run();
          if (!claimed.meta.changes)
            throw new BusinessError(
              "Ya existe un intento de guía. Usa consultar envío; no vuelvas a comprar.",
              409,
            );
          // Persist intent BEFORE network call. Ambiguous results never release this claim.
          const result = await createShipment(e, payload);
          const shipmentId = result.data?.id || result.id;
          if (typeof shipmentId !== "string")
            throw new BusinessError(
              "Skydropx recibió el intento; consulta el envío antes de reintentar.",
              502,
            );
          await e.DB.prepare(
            "UPDATE fulfillment SET shipment_id=?,state='pending',data=? WHERE order_id=?",
          )
            .bind(shipmentId, JSON.stringify(result), o.id)
            .run();
        } else {
          const label = await shippingProvider(e).label(d.quote, o.id);
          d.label = label;
          await e.DB.prepare(
            "UPDATE orders SET data=?,tracking=?,logistics='label_created' WHERE id=? AND tracking IS NULL",
          )
            .bind(JSON.stringify(d), label.tracking, o.id)
            .run();
        }
      }
      if (b.action === "tracking") await syncShipment(e, o);
      if (b.action === "manual-tracking") {
        if (
          !d.quote?.manualFulfillment ||
          o.payment !== "paid" ||
          !b.tracking ||
          o.tracking
        )
          throw new BusinessError(
            "El pedido no admite registrar esta guía manual.",
            409,
          );
        await e.DB.batch([
          e.DB.prepare(
            "UPDATE orders SET tracking=?,logistics='label_created',version=version+1 WHERE id=? AND tracking IS NULL",
          ).bind(b.tracking, o.id),
          mailStatement(e, o.id + ":label_created", o.email, "label_created", {
            id: o.id,
            ...d.totals,
            tracking: b.tracking,
            name: d.checkout.name, delivery: d.checkout.delivery,
          }),
        ]);
      }

      if (b.action === "logistics") {
        if (d.checkout.delivery === "local") {
          if (b.logistics === "ready" || b.logistics === "delivered") {
            const result = await markPickup(e, o, b.logistics === "ready" ? "ready" : "completed", actor);
            await audit(e, actor, "pickup." + b.logistics, o.id);
            return json(result);
          }
          throw new BusinessError("Gestiona las citas desde Entregas locales.", 409);
        }

        if (!b.logistics) throw new BusinessError("Falta el estado.");
        logisticsTransition(
          o.logistics,
          b.logistics,
          d.checkout.delivery,
          o.payment,
          !!o.tracking,
        );
        if (b.logistics === "scheduled" && !b.appointment)
          throw new BusinessError("Indica la fecha acordada.");
        if (
          d.checkout.delivery === "national" &&
          ["shipped", "delivered"].includes(b.logistics) &&
          e.MODE !== "local"
        )
          throw new BusinessError(
            "Falta integrar una señal verificada del transportista. No se puede confirmar entrega.",
            409,
          );
        const statements = [
          e.DB.prepare(
            "UPDATE orders SET logistics=?,notes=?,appointment=? WHERE id=? AND logistics=?",
          ).bind(b.logistics, b.notes, b.appointment, o.id, o.logistics),
        ];
        if (["shipped", "delivered"].includes(b.logistics))
          statements.push(
            mailStatement(e, o.id + ":" + b.logistics, o.email, b.logistics, {
              id: o.id,
              ...d.totals,
              tracking: o.tracking,
              name: d.checkout.name, delivery: d.checkout.delivery,
            }),
          );
        await e.DB.batch(statements);
      }
      await audit(e, actor, "order." + b.action, o.id);
      return json({ ok: true });
    }
  }
  return json({ error: "No encontrado." }, 404);
}
export default {
  async fetch(r: Request, e: Env) {
    try {
      return await handle(r, e);
    } catch (err) {
      if (err instanceof z.ZodError)
        return json({ error: err.issues.map((i) => i.message).join(" ") }, 400);
      if (err instanceof BusinessError)
        return json({ error: err.message }, err.status);
      if (
        err instanceof Error &&
        err.message.includes("D1") &&
        err.message.includes("daily row write limit")
      )
        return json(
          {
            error:
              "La tienda no puede registrar solicitudes en este momento. Intenta más tarde.",
          },
          503,
        );
      console.error(
        "request_failed",
        err instanceof Error ? err.name : "unknown",
        err instanceof Error
          ? err.stack?.split("\n").slice(1, 5).join("\n")
          : "",
      );
      return json(
        { error: "No se pudo completar la solicitud. Intenta de nuevo." },
        500,
      );
    }
  },
  async scheduled(_event: ScheduledEvent, e: Env) {
    await expire(e);
    if (e.MODE !== "local") {
      const due = await e.DB.prepare(
        "SELECT * FROM orders WHERE provider_id IS NOT NULL AND payment IN ('pending','paid') ORDER BY reconciled_at LIMIT 5",
      ).all<OrderRow>();
      for (const o of due.results) {
        try {
          await updatePayment(
            e,
            o,
            await paymentStatus(e, o),
            o.id + ":reconcile:" + crypto.randomUUID(),
          );
        } catch {
          /* next scheduled attempt */
        } finally {
          await e.DB.prepare("UPDATE orders SET reconciled_at=? WHERE id=?")
            .bind(Date.now(), o.id)
            .run();
        }
      }
    }
    if (e.MODE !== "local" && e.SKYDROPX_CLIENT_ID) {
      const shipments = await e.DB.prepare(
        "SELECT o.* FROM orders o JOIN fulfillment f ON f.order_id=o.id WHERE f.shipment_id IS NOT NULL AND o.payment='paid' AND (o.logistics<>'delivered' OR f.tracking_checked_at=0) ORDER BY f.tracking_checked_at LIMIT 3",
      ).all<OrderRow>();
      for (const o of shipments.results) {
        try {
          await syncShipment(e, o);
        } catch {
          /* retry next schedule */
        } finally {
          await e.DB.prepare(
            "UPDATE fulfillment SET tracking_checked_at=? WHERE order_id=?",
          )
            .bind(Date.now(), o.id)
            .run();
        }
      }
    }
    await processPickups(e);
    await processOutbox(e);
    await e.DB.prepare("DELETE FROM order_sessions WHERE expires<?")
      .bind(Date.now())
      .run();
    await e.DB.prepare("DELETE FROM order_challenges WHERE expires<?")
      .bind(Date.now())
      .run();
    await e.DB.prepare("DELETE FROM rate_limits WHERE expires<?")
      .bind(Date.now())
      .run();
  },
};
